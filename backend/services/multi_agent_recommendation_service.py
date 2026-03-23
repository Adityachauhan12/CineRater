"""
Multi-Agent Recommendation Pipeline
====================================
Three agents, each with a distinct role and structured output:

  Agent 1 — TasteAnalyst
    Input : user's rated content (title, score, genres, overview snippets)
    Output: structured taste profile JSON
            {profile_summary, loved_themes, loved_moods, loved_genres,
             weak_genres, search_queries}

  Agent 2 — CandidateFinder  (deterministic, no LLM)
    Input : taste_profile.search_queries + existing ContentEmbedding table
    Runs semantic search for each query, merges + deduplicates, excludes
    already-rated items, returns top-30 candidates with similarity scores.

  Agent 3 — RankerExplainer
    Input : taste profile + enriched TMDB candidates
    Output: re-ranked list with a personalised one-line reason per item
            that directly references the user's taste profile language.

The pipeline result includes the taste profile so the frontend can show
"Here's what CineRater knows about your taste."
"""

import json
import logging
from typing import Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from openai import OpenAI
from decouple import config
from django.core.cache import cache

from services.user_context_service import UserContextService
from services.embedding_service import EmbeddingService
from services.tmdb_service import TMDBService
from movies.models import ContentEmbedding

logger = logging.getLogger(__name__)

try:
    _groq = OpenAI(
        api_key=config('GROQ_API_KEY'),
        base_url="https://api.groq.com/openai/v1",
    )
    MODEL = config('GROQ_MODEL', default='llama-3.3-70b-versatile')
except Exception:
    _groq = None
    MODEL = None

CACHE_TTL = 1800   # 30 min
CACHE_KEY  = "recs_v3:{user_id}"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _llm(system: str, user: str, max_tokens: int = 600, temperature: float = 0.5) -> Optional[str]:
    """Single Groq call. Returns raw text or None on failure."""
    if not _groq:
        return None
    try:
        resp = _groq.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return None


def _parse_json(text: Optional[str], fallback):
    """Strip markdown fences and parse JSON; return fallback on failure."""
    if not text:
        return fallback
    try:
        cleaned = text.strip()
        if cleaned.startswith('```'):
            cleaned = cleaned.split('```')[1]
            if cleaned.startswith('json'):
                cleaned = cleaned[4:]
        return json.loads(cleaned.strip())
    except Exception:
        return fallback


# ── Agent 1: TasteAnalyst ─────────────────────────────────────────────────────

def _run_taste_analyst(rated_content: List[Dict]) -> Dict:
    """
    Analyse the user's rating history and produce a structured taste profile.
    Falls back to a genre-only profile if the LLM call fails.
    """
    # Build a compact summary for the prompt
    items_text = "\n".join(
        f"- {r['title']} ({r['score']}/10) — genres: {', '.join(r.get('genres', []))}"
        for r in rated_content[:20]
    )

    system = (
        "You are an expert film taste analyst. "
        "Analyse the user's ratings and return ONLY valid JSON with these exact keys:\n"
        '{\n'
        '  "profile_summary": "2-sentence description of what this viewer loves",\n'
        '  "loved_themes": ["theme1", "theme2", "theme3"],\n'
        '  "loved_moods": ["mood1", "mood2", "mood3"],\n'
        '  "loved_genres": ["Genre1", "Genre2", "Genre3"],\n'
        '  "weak_genres": ["Genre4"],\n'
        '  "search_queries": ["query1", "query2", "query3"]\n'
        '}\n'
        "search_queries should be 3 natural-language phrases ideal for semantic film search "
        "(e.g. 'slow-burn psychological thriller with unreliable narrator').\n"
        "Return ONLY the JSON object, no markdown, no explanation."
    )

    raw = _llm(system, f"Here are my ratings:\n{items_text}", max_tokens=500, temperature=0.4)
    profile = _parse_json(raw, {})

    # Ensure required keys exist
    from collections import Counter
    genre_counts: Counter = Counter()
    for r in rated_content:
        for g in r.get('genres', []):
            genre_counts[g] += int(r['score'])
    top_genres = [g for g, _ in genre_counts.most_common(5)]

    defaults = {
        "profile_summary": f"You enjoy {', '.join(top_genres[:2]) or 'great cinema'} and critically acclaimed films.",
        "loved_themes":  [],
        "loved_moods":   [],
        "loved_genres":  top_genres[:3],
        "weak_genres":   [],
        "search_queries": [g.lower() for g in top_genres[:3]],
    }
    for k, v in defaults.items():
        if k not in profile or not profile[k]:
            profile[k] = v

    return profile


# ── Agent 2: CandidateFinder (deterministic) ─────────────────────────────────

def _find_candidates(
    taste_profile: Dict,
    rated_ids: set,
    watchlist_ids: set,
    limit: int = 30,
) -> List[Dict]:
    """
    Run each search_query from the taste profile as a semantic search over
    ContentEmbedding. Merge results, deduplicate, exclude already-rated items.
    """
    exclude_content_ids = {cid for cid, _ in rated_ids}
    queries = taste_profile.get('search_queries', []) or taste_profile.get('loved_genres', [])

    # Embed all queries in parallel
    def embed(q):
        return q, EmbeddingService.embed_text(q)

    query_embeddings = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        for q, emb in ex.map(lambda q: embed(q), queries[:4]):
            if emb:
                query_embeddings.append((q, emb))

    if not query_embeddings:
        return []

    # Load all non-rated embeddings once
    all_entries = list(
        ContentEmbedding.objects.exclude(tmdb_id__in=exclude_content_ids)
        .values('tmdb_id', 'content_type', 'title', 'embedding', 'popularity', 'vote_average')
    )

    # Score each entry as the max similarity across all query embeddings
    scored: Dict[int, dict] = {}
    for entry in all_entries:
        emb = entry['embedding']
        if not emb or len(emb) != 384:
            continue
        best_sim = max(
            EmbeddingService.cosine_similarity(q_emb, emb)
            for _, q_emb in query_embeddings
        )
        key = entry['tmdb_id']
        if key not in scored or best_sim > scored[key]['similarity']:
            scored[key] = {
                'content_id':   entry['tmdb_id'],
                'content_type': entry['content_type'],
                'title':        entry['title'],
                'similarity':   best_sim,
                'popularity':   entry['popularity'],
                'vote_average': entry['vote_average'],
            }

    # Sort by similarity; secondary sort by vote_average for ties
    results = sorted(scored.values(), key=lambda x: (x['similarity'], x['vote_average']), reverse=True)
    return results[:limit]


# ── Agent 3: RankerExplainer ──────────────────────────────────────────────────

def _run_ranker_explainer(taste_profile: Dict, candidates: List[Dict]) -> List[Dict]:
    """
    Re-rank candidates with the LLM and write personalised one-line reasons.
    Falls back to similarity order + generic reason if LLM fails.
    """
    if not candidates:
        return []

    profile_text = (
        f"Taste summary: {taste_profile.get('profile_summary', '')}\n"
        f"Loved themes: {', '.join(taste_profile.get('loved_themes', []))}\n"
        f"Loved moods: {', '.join(taste_profile.get('loved_moods', []))}\n"
        f"Top genres: {', '.join(taste_profile.get('loved_genres', []))}\n"
        f"Genres to avoid: {', '.join(taste_profile.get('weak_genres', []))}"
    )

    candidate_lines = "\n".join(
        f"{i+1}. {c.get('title','')} — {c.get('content_type','')} "
        f"(TMDB score: {c.get('vote_average','?')}, "
        f"genres: {', '.join(c.get('genres', [])[:3])}, "
        f"overview: {(c.get('overview','') or '')[:120]})"
        for i, c in enumerate(candidates)
    )

    system = (
        "You are a film recommendation engine. "
        "Given a user's taste profile and a list of candidates, return ONLY a JSON array "
        "of objects ordered best-to-worst for this viewer. Each object must have:\n"
        '  {"title": "exact title", "reason": "one sentence (max 15 words) referencing their specific taste"}\n'
        "Use the taste profile language (moods, themes) in your reasons. "
        "Do not include titles from the weak_genres list. "
        "Return ONLY the JSON array, no markdown."
    )

    user_msg = f"Taste profile:\n{profile_text}\n\nCandidates:\n{candidate_lines}"

    raw = _llm(system, user_msg, max_tokens=800, temperature=0.5)
    rankings = _parse_json(raw, [])

    # Build lookup: title → reason from LLM output
    reason_map = {}
    if isinstance(rankings, list):
        for item in rankings:
            if isinstance(item, dict) and 'title' in item:
                reason_map[item['title'].lower().strip()] = item.get('reason', '')

    # Apply reasons and LLM ordering where possible
    genres_str = ', '.join(taste_profile.get('loved_genres', [])[:2]) or 'great cinema'
    for c in candidates:
        title_key = (c.get('title') or c.get('name', '')).lower().strip()
        c['ai_reason'] = reason_map.get(title_key) or f"Matches your love of {genres_str}"

    # Re-order by LLM ranking if we got a valid list
    if reason_map:
        def rank_key(c):
            title_key = (c.get('title') or c.get('name', '')).lower().strip()
            ranked_titles = [r['title'].lower().strip() for r in rankings if isinstance(r, dict) and 'title' in r]
            try:
                return ranked_titles.index(title_key)
            except ValueError:
                return len(ranked_titles) + 1
        candidates.sort(key=rank_key)

    return candidates


# ── Public interface ──────────────────────────────────────────────────────────

class MultiAgentRecommendationService:

    @staticmethod
    def get_recommendations(user, region: str = 'GLOBAL') -> Dict:
        cache_key = CACHE_KEY.format(user_id=user.id)
        cached = cache.get(cache_key)
        if cached:
            return cached

        user_context = UserContextService.build_context(user, top_n=20)

        if user_context['total_ratings'] < 3:
            from services.recommendation_service import RecommendationService
            result = RecommendationService._popular_fallback(region)
            cache.set(cache_key, result, timeout=600)
            return result

        try:
            rated_ids     = UserContextService.get_all_rated_ids(user)
            watchlist_ids = set(user_context['watchlist_ids'])

            # ── Agent 1: Taste Analysis ─────────────────────────────
            taste_profile = _run_taste_analyst(user_context['rated_content'])

            # ── Agent 2: Candidate Search ───────────────────────────
            candidates = _find_candidates(taste_profile, rated_ids, watchlist_ids)

            if not candidates:
                from services.recommendation_service import RecommendationService
                result = RecommendationService._popular_fallback(region)
                cache.set(cache_key, result, timeout=600)
                return result

            # Enrich with full TMDB details in parallel
            def fetch_details(c):
                try:
                    if c['content_type'] == 'movie':
                        data = TMDBService.get_movie_details(c['content_id'])
                    else:
                        data = TMDBService.get_tv_details(c['content_id'])
                    if data:
                        data['content_type']  = c['content_type']
                        data['similarity']    = c['similarity']
                        genres = data.get('genres', [])
                        if genres and isinstance(genres[0], dict):
                            data['genres'] = [g['name'] for g in genres]
                        return data
                except Exception:
                    pass
                return None

            enriched = []
            with ThreadPoolExecutor(max_workers=10) as ex:
                for fut in as_completed({ex.submit(fetch_details, c): c for c in candidates}):
                    val = fut.result()
                    if val:
                        enriched.append(val)

            enriched.sort(key=lambda x: x.get('similarity', 0), reverse=True)
            enriched = enriched[:20]

            # ── Agent 3: Rank + Explain ─────────────────────────────
            final = _run_ranker_explainer(taste_profile, enriched)

            result = {
                'type':          'ai',
                'region':        region,
                'taste_profile': taste_profile,
                'data':          final[:15],
            }
            cache.set(cache_key, result, timeout=CACHE_TTL)
            return result

        except Exception as e:
            logger.error(f"Multi-agent recommendation error: {e}")
            from services.recommendation_service import RecommendationService
            return RecommendationService._popular_fallback(region)
