import json
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from django.core.cache import cache
from decouple import config
from openai import OpenAI
from services.user_context_service import UserContextService
from services.embedding_service import EmbeddingService
from movies.models import ContentEmbedding
from services.tmdb_service import TMDBService

# Groq — OpenAI-compatible API
try:
    groq_client = OpenAI(
        api_key=config('GROQ_API_KEY'),
        base_url="https://api.groq.com/openai/v1",
    )
    USE_GROQ = True
except Exception:
    USE_GROQ = False


def _groq_json(system: str, user: str, max_tokens: int = 800) -> Optional[dict]:
    """Call Groq and parse JSON response. Returns None on failure."""
    try:
        response = groq_client.chat.completions.create(
            model=config('GROQ_MODEL', default='llama-3.3-70b-versatile'),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.5,
            max_tokens=max_tokens,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown code fences if present
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as e:
        print(f"[Groq] call failed: {e}")
        return None


class RecommendationService:
    AI_CACHE_TTL = 1800  # 30 min

    @staticmethod
    def get_ai_recommendations(user, region: str = 'GLOBAL') -> Dict:
        cache_key = f"recs_v3:{user.id}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        user_context = UserContextService.build_context(user, top_n=20)

        # Not enough data — return popular from TMDB
        if user_context['total_ratings'] < 3:
            result = RecommendationService._popular_fallback(region)
            cache.set(cache_key, result, timeout=600)
            return result

        try:
            rated_ids = UserContextService.get_all_rated_ids(user)
            watchlist_ids = set(user_context['watchlist_ids'])

            # Stage 1 — embedding-based candidate retrieval
            taste_vector = RecommendationService._build_taste_vector(
                user_context['rated_content'], rated_ids
            )
            if taste_vector is None:
                result = RecommendationService._popular_fallback(region)
                cache.set(cache_key, result, timeout=600)
                return result

            candidates = RecommendationService._find_similar(
                taste_vector, rated_ids, watchlist_ids, limit=20
            )
            if not candidates:
                result = RecommendationService._popular_fallback(region)
                cache.set(cache_key, result, timeout=600)
                return result

            candidates_with_details = RecommendationService._enrich_candidates(candidates)

            # Stage 2 — multi-agent pipeline
            if USE_GROQ and candidates_with_details:
                enriched = RecommendationService._run_multi_agent_pipeline(
                    user_context, candidates_with_details
                )
            else:
                enriched = RecommendationService._fallback_reasons(
                    user_context, candidates_with_details
                )

            result = {'type': 'ai', 'region': region, 'data': enriched}
            cache.set(cache_key, result, timeout=RecommendationService.AI_CACHE_TTL)
            return result

        except Exception as e:
            print(f"Recommendation error: {e}")
            return RecommendationService._popular_fallback(region)

    # ── Multi-Agent Pipeline ──────────────────────────────────────────────────

    @staticmethod
    def _run_multi_agent_pipeline(user_context: Dict, candidates: List[Dict]) -> List[Dict]:
        """
        Three-agent pipeline:
          Agent 1 — Taste Analyst   → deep taste profile from rating history
          Agent 2 — Candidate Selector → scores + filters candidates using taste profile
          Agent 3 — Reason Writer   → personalized one-liner per final recommendation
        """
        # Agent 1: build taste profile
        taste_profile = RecommendationService._agent_taste_analyst(user_context)
        if taste_profile is None:
            return RecommendationService._fallback_reasons(user_context, candidates)

        # Agent 2: select and rank candidates
        selected = RecommendationService._agent_candidate_selector(taste_profile, candidates)
        if not selected:
            selected = candidates[:10]  # fallback to top embedding matches

        # Agent 3: write personalized reasons
        final = RecommendationService._agent_reason_writer(taste_profile, selected)
        return final

    @staticmethod
    def _agent_taste_analyst(user_context: Dict) -> Optional[Dict]:
        """
        Agent 1 — Taste Analyst

        Analyzes the user's full rating history and produces a nuanced taste
        profile that goes beyond genre labels: themes, tone, era, pacing, etc.
        This profile is passed to subsequent agents as shared context.
        """
        rated_lines = "\n".join(
            f"- {r['title']} ({r['score']}/10) [{', '.join(r['genres'])}]"
            for r in user_context['rated_content']
        )

        system = (
            "You are a film critic and taste analyst. "
            "Your job is to extract a deep, nuanced taste profile from a user's rating history. "
            "Go beyond genre labels — identify recurring themes, tones, narrative styles, and eras. "
            "Reply ONLY with valid JSON, no markdown."
        )

        user_prompt = f"""Analyze this user's rating history and produce a taste profile.

Rated content:
{rated_lines}

Favorite genres (weighted): {', '.join(user_context['favorite_genres']) or 'unknown'}

Reply with JSON in exactly this shape:
{{
  "themes": ["list of 3-5 recurring themes, e.g. redemption, identity, survival"],
  "tone": ["list of 2-3 tonal descriptors, e.g. dark, comedic, contemplative"],
  "preferred_era": "e.g. 1990s-2000s, modern, classic",
  "pacing": "e.g. slow-burn, fast-paced, balanced",
  "avoid": ["list of 2-3 things this user clearly dislikes based on low scores"],
  "summary": "1-2 sentence plain-English description of this user's taste"
}}"""

        profile = _groq_json(system, user_prompt, max_tokens=500)
        if profile:
            print(f"[Agent 1] Taste profile: {profile.get('summary', '')}")
        return profile

    @staticmethod
    def _agent_candidate_selector(taste_profile: Dict, candidates: List[Dict]) -> List[Dict]:
        """
        Agent 2 — Candidate Selector

        Given the taste profile from Agent 1, scores each candidate and selects
        the top 10 that genuinely fit the user's taste. Drops weak matches.
        This agent has reasoning authority — it can override embedding similarity.
        """
        candidate_list = []
        for i, c in enumerate(candidates):
            genres = [g['name'] if isinstance(g, dict) else g for g in c.get('genres', [])]
            candidate_list.append({
                "id": i,
                "title": c.get('title') or c.get('name', ''),
                "type": c.get('content_type', 'movie'),
                "genres": genres,
                "overview": (c.get('overview', '') or '')[:200],
                "year": (c.get('release_date') or c.get('first_air_date') or '')[:4],
                "rating": c.get('vote_average', 0),
            })

        system = (
            "You are a film recommendation curator. "
            "Given a user's taste profile and a list of candidates, select the best matches. "
            "Reply ONLY with valid JSON, no markdown."
        )

        user_prompt = f"""User taste profile:
{json.dumps(taste_profile, indent=2)}

Candidate titles to evaluate:
{json.dumps(candidate_list, indent=2)}

Score each candidate 1-10 based on fit with the taste profile.
Select the top 10 with score >= 5. Drop weak matches.

Reply with JSON in exactly this shape:
{{
  "selected": [
    {{
      "id": <original id from candidate list>,
      "fit_score": <1-10>,
      "fit_reason": "one sentence why this fits the user's taste"
    }}
  ]
}}"""

        result = _groq_json(system, user_prompt, max_tokens=800)
        if not result or 'selected' not in result:
            return candidates[:10]

        # Map selected ids back to original candidate dicts
        id_to_candidate = {i: c for i, c in enumerate(candidates)}
        selected = []
        for item in result['selected']:
            idx = item.get('id')
            if idx is not None and idx in id_to_candidate:
                c = id_to_candidate[idx].copy()
                c['_fit_score'] = item.get('fit_score', 5)
                c['_fit_reason'] = item.get('fit_reason', '')
                selected.append(c)

        selected.sort(key=lambda x: x.get('_fit_score', 0), reverse=True)
        print(f"[Agent 2] Selected {len(selected)} candidates from {len(candidates)}")
        return selected

    @staticmethod
    def _agent_reason_writer(taste_profile: Dict, candidates: List[Dict]) -> List[Dict]:
        """
        Agent 3 — Reason Writer

        Uses the taste profile (Agent 1) and selected candidates (Agent 2)
        to write a personalized, specific one-liner for each recommendation.
        References the user's actual themes/tone preferences — not generic copy.
        """
        candidate_info = []
        for c in candidates:
            genres = [g['name'] if isinstance(g, dict) else g for g in c.get('genres', [])]
            candidate_info.append({
                "title": c.get('title') or c.get('name', ''),
                "genres": genres,
                "overview": (c.get('overview', '') or '')[:150],
                "fit_reason": c.get('_fit_reason', ''),
            })

        system = (
            "You are a film recommendation writer. "
            "Write short, specific, personalized reasons why each film fits this user. "
            "Reference their actual taste profile — themes, tone, era. Never be generic. "
            "Reply ONLY with valid JSON, no markdown."
        )

        user_prompt = f"""User taste profile:
- Themes: {', '.join(taste_profile.get('themes', []))}
- Tone: {', '.join(taste_profile.get('tone', []))}
- Era: {taste_profile.get('preferred_era', 'various')}
- Pacing: {taste_profile.get('pacing', 'balanced')}

Write a personalized reason (max 12 words) for each recommendation:
{json.dumps(candidate_info, indent=2)}

Reply with JSON mapping exact title strings to reason strings:
{{"Title A": "reason", "Title B": "reason"}}"""

        reasons = _groq_json(system, user_prompt, max_tokens=600)
        if not reasons:
            reasons = {}

        reasons_lower = {k.lower().strip(): v for k, v in reasons.items()}
        summary = taste_profile.get('summary', '')
        fallback = f"Matches your taste — {summary[:60]}" if summary else "Recommended for you"

        for c in candidates:
            title = (c.get('title') or c.get('name', '')).strip()
            reason = reasons_lower.get(title.lower()) or reasons.get(title)
            c['ai_reason'] = reason or fallback
            # Clean up internal agent fields
            c.pop('_fit_score', None)
            c.pop('_fit_reason', None)

        print(f"[Agent 3] Wrote reasons for {len(candidates)} recommendations")
        return candidates

    # ── Embedding Helpers ─────────────────────────────────────────────────────

    @staticmethod
    def _build_taste_vector(rated_content: List[Dict], rated_ids: set):
        """Average embeddings of high-rated content to form a taste vector."""
        high_rated = [r for r in rated_content if r['score'] >= 8.0]
        if not high_rated:
            high_rated = rated_content[:10]

        tmdb_ids = [r['content_id'] for r in high_rated]
        embeddings = ContentEmbedding.objects.filter(
            tmdb_id__in=tmdb_ids
        ).values_list('embedding', flat=True)

        valid = [e for e in embeddings if e and len(e) == 384]
        if not valid:
            return None

        dim = len(valid[0])
        avg = [sum(v[i] for v in valid) / len(valid) for i in range(dim)]
        norm = sum(x * x for x in avg) ** 0.5
        if norm == 0:
            return None
        return [x / norm for x in avg]

    @staticmethod
    def _find_similar(taste_vector: list, rated_ids: set, watchlist_ids: set, limit: int = 20) -> List[Dict]:
        """Return top `limit` items by cosine similarity, excluding already-rated."""
        exclude_ids = {cid for cid, _ in rated_ids}

        all_embeddings = ContentEmbedding.objects.exclude(
            tmdb_id__in=exclude_ids
        ).values('tmdb_id', 'content_type', 'title', 'embedding')

        scored = []
        for entry in all_embeddings:
            emb = entry['embedding']
            if not emb or len(emb) != 384:
                continue
            score = EmbeddingService.cosine_similarity(taste_vector, emb)
            scored.append({
                'content_id': entry['tmdb_id'],
                'content_type': entry['content_type'],
                'title': entry['title'],
                'similarity': score,
            })

        scored.sort(key=lambda x: x['similarity'], reverse=True)
        return scored[:limit]

    @staticmethod
    def _enrich_candidates(candidates: List[Dict]) -> List[Dict]:
        """Fetch TMDB details for candidate items in parallel."""
        def fetch(c):
            try:
                if c['content_type'] == 'movie':
                    data = TMDBService.get_movie_details(c['content_id'])
                else:
                    data = TMDBService.get_tv_details(c['content_id'])
                if data:
                    data['content_type'] = c['content_type']
                    data['similarity'] = c['similarity']
                    return data
            except Exception:
                pass
            return None

        result = []
        with ThreadPoolExecutor(max_workers=10) as ex:
            for fut in as_completed({ex.submit(fetch, c): c for c in candidates}):
                val = fut.result()
                if val:
                    result.append(val)

        result.sort(key=lambda x: x.get('similarity', 0), reverse=True)
        return result[:15]

    # ── Fallbacks ─────────────────────────────────────────────────────────────

    @staticmethod
    def _fallback_reasons(user_context: Dict, candidates: List[Dict]) -> List[Dict]:
        """Generic reasons when Groq is unavailable."""
        genres_str = ', '.join(user_context['favorite_genres'][:2]) or 'great cinema'
        for c in candidates:
            c['ai_reason'] = f"Matches your taste in {genres_str}"
        return candidates

    @staticmethod
    def _popular_fallback(region: str) -> Dict:
        """Fetch popular content from TMDB as fallback."""
        try:
            movies = TMDBService.get_popular_movies(region=region, page=1)[:8]
            tv = TMDBService.get_popular_tv(region=region, page=1)[:7]
            for m in movies:
                m['content_type'] = 'movie'
            for t in tv:
                t['content_type'] = 'tvshow'
            data = movies + tv
            data.sort(key=lambda x: x.get('popularity', 0), reverse=True)
        except Exception:
            data = []
        return {'type': 'popular', 'region': region, 'data': data[:15]}
