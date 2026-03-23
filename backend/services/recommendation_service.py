import json
from typing import List, Dict
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
    openai_client = OpenAI(
        api_key=config('GROQ_API_KEY'),
        base_url="https://api.groq.com/openai/v1",
    )
    USE_GROQ = True
except Exception:
    USE_GROQ = False


class RecommendationService:
    GROQ_MODEL = config('GROQ_MODEL', default='llama-3.3-70b-versatile')
    AI_CACHE_TTL = 1800  # 30 min

    @staticmethod
    def get_ai_recommendations(user, region: str = 'GLOBAL') -> Dict:
        cache_key = f"recs_v2:{user.id}"
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
            # Get content the user has already rated (to exclude)
            rated_ids = UserContextService.get_all_rated_ids(user)
            watchlist_ids = set(user_context['watchlist_ids'])

            # Build taste vector from top-rated items' embeddings
            taste_vector = RecommendationService._build_taste_vector(
                user_context['rated_content'], rated_ids
            )

            if taste_vector is None:
                result = RecommendationService._popular_fallback(region)
                cache.set(cache_key, result, timeout=600)
                return result

            # Find similar content via cosine similarity across ContentEmbedding
            candidates = RecommendationService._find_similar(
                taste_vector, rated_ids, watchlist_ids, limit=20
            )

            if not candidates:
                result = RecommendationService._popular_fallback(region)
                cache.set(cache_key, result, timeout=600)
                return result

            # Fetch TMDB details for candidates in parallel
            candidates_with_details = RecommendationService._enrich_candidates(candidates)

            # Call Groq to generate personalised reasons
            enriched = RecommendationService._add_ai_reasons(
                user_context, candidates_with_details
            )

            result = {'type': 'ai', 'region': region, 'data': enriched}
            cache.set(cache_key, result, timeout=RecommendationService.AI_CACHE_TTL)
            return result

        except Exception as e:
            print(f"Recommendation error: {e}")
            result = RecommendationService._popular_fallback(region)
            return result

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _build_taste_vector(rated_content: List[Dict], rated_ids: set):
        """
        Average the embeddings of the user's highest-rated content
        to form a single taste vector.
        """
        # Only use items rated 8+ for the taste vector
        high_rated = [r for r in rated_content if r['score'] >= 8.0]
        if not high_rated:
            high_rated = rated_content[:10]  # fall back to top 10

        tmdb_ids = [r['content_id'] for r in high_rated]
        embeddings = ContentEmbedding.objects.filter(
            tmdb_id__in=tmdb_ids
        ).values_list('embedding', flat=True)

        valid = [e for e in embeddings if e and len(e) == 384]
        if not valid:
            return None

        # Average the vectors
        dim = len(valid[0])
        avg = [sum(v[i] for v in valid) / len(valid) for i in range(dim)]
        # Normalise
        norm = sum(x * x for x in avg) ** 0.5
        if norm == 0:
            return None
        return [x / norm for x in avg]

    @staticmethod
    def _find_similar(taste_vector: list, rated_ids: set, watchlist_ids: set, limit: int = 20) -> List[Dict]:
        """
        Scan ContentEmbedding table and return the top `limit` entries
        by cosine similarity to taste_vector, excluding already-rated items.
        """
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

    @staticmethod
    def _add_ai_reasons(user_context: Dict, candidates: List[Dict]) -> List[Dict]:
        """Call Groq once to add one-line reasons for each recommendation."""
        if not USE_GROQ or not candidates:
            for c in candidates:
                c['ai_reason'] = f"Matches your taste in {', '.join(user_context['favorite_genres'][:2]) or 'great cinema'}"
            return candidates

        top_rated_titles = [
            f"{r['title']} ({r['score']}/10)"
            for r in user_context['rated_content'][:8]
        ]
        candidate_titles = [
            c.get('title') or c.get('name', '') for c in candidates
        ]

        prompt = f"""You are a film recommendation assistant. The user loves:
Genres: {', '.join(user_context['favorite_genres']) or 'various'}
Top rated films: {', '.join(top_rated_titles)}

For each recommended title below, write ONE short sentence (max 12 words) explaining why it fits their taste.
Titles: {json.dumps(candidate_titles)}

Reply ONLY with a JSON object mapping exact title strings to reason strings.
Example: {{"Title A": "reason", "Title B": "reason"}}"""

        try:
            response = openai_client.chat.completions.create(
                model=RecommendationService.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": "Reply only with valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.6,
                max_tokens=600,
            )
            raw = response.choices[0].message.content.strip()
            if raw.startswith('```'):
                raw = raw.split('```')[1]
                if raw.startswith('json'):
                    raw = raw[4:]
            reasons: dict = json.loads(raw)
        except Exception as e:
            print(f"Groq reason generation failed: {e}")
            reasons = {}

        # Fuzzy match reasons (case-insensitive)
        reasons_lower = {k.lower().strip(): v for k, v in reasons.items()}
        genres_str = ', '.join(user_context['favorite_genres'][:2]) or 'great cinema'
        for c in candidates:
            title = (c.get('title') or c.get('name', '')).strip()
            reason = reasons_lower.get(title.lower()) or reasons.get(title)
            c['ai_reason'] = reason or f"Recommended based on your love of {genres_str}"

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
            data = (movies + tv)
            data.sort(key=lambda x: x.get('popularity', 0), reverse=True)
        except Exception:
            data = []
        return {'type': 'popular', 'region': region, 'data': data[:15]}
