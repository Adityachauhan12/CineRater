from typing import Dict, List
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from movies.models import Rating, Watchlist
from services.tmdb_service import TMDBService


class UserContextService:
    """Build user taste context from actual ratings via TMDB lookup."""

    @staticmethod
    def build_context(user, top_n: int = 20) -> Dict:
        """
        Build user context from their top-rated content.
        Uses TMDB for title/genre data, not the sparse DB models.
        Only fetches `top_n` highest-rated items to keep it fast.
        """
        rated_content = UserContextService._get_rated_content(user, top_n=top_n)
        favorite_genres = UserContextService._calculate_favorite_genres(rated_content)

        watchlist_ids = list(
            Watchlist.objects.filter(user=user).values_list('content_id', flat=True)[:50]
        )

        return {
            'watchlist_ids': watchlist_ids,
            'rated_content': rated_content,
            'favorite_genres': favorite_genres,
            'total_ratings': Rating.objects.filter(user=user).count(),
            'watchlist_count': len(watchlist_ids),
        }

    @staticmethod
    def _get_rated_content(user, top_n: int = 20) -> List[Dict]:
        """
        Fetch user's top-N highest-rated items with TMDB metadata.
        Parallel TMDB calls — fast even at top_n=20.
        """
        ratings = list(
            Rating.objects.filter(user=user)
            .order_by('-score', '-created_at')[:top_n]
        )

        def fetch(r):
            try:
                if r.content_type == 'movie':
                    data = TMDBService.get_movie_details(r.content_id)
                else:
                    data = TMDBService.get_tv_details(r.content_id)
                if data:
                    genres = [g['name'] if isinstance(g, dict) else g for g in data.get('genres', [])]
                    return {
                        'content_id': r.content_id,
                        'content_type': r.content_type,
                        'title': data.get('title') or data.get('name', ''),
                        'score': float(r.score),
                        'genres': genres,
                    }
            except Exception:
                pass
            return None

        result = []
        with ThreadPoolExecutor(max_workers=10) as ex:
            for fut in as_completed({ex.submit(fetch, r): r for r in ratings}):
                val = fut.result()
                if val:
                    result.append(val)

        result.sort(key=lambda x: x['score'], reverse=True)
        return result

    @staticmethod
    def _calculate_favorite_genres(rated_content: List[Dict]) -> List[str]:
        """Top genres weighted by rating score."""
        genre_counter: Counter = Counter()
        for item in rated_content:
            weight = int(item['score'])
            for genre in item.get('genres', []):
                genre_counter[genre] += weight
        return [g for g, _ in genre_counter.most_common(5)]

    @staticmethod
    def get_all_rated_ids(user) -> set:
        """Return set of (content_id, content_type) tuples the user has rated."""
        return set(
            Rating.objects.filter(user=user).values_list('content_id', 'content_type')
        )
