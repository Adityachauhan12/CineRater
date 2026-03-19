"""
Browse view — paginated content discovery with type and genre filters.
Uses TMDB's /discover endpoint which supports proper genre filtering.

GET /api/content/browse/?type=movie&genre=28&page=1
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from services.tmdb_service import TMDBService
from services.rating_service import RatingService
from services.watchlist_service import WatchlistService

# TMDB genre ID → name mapping (movies and TV share many, TV-only ones included)
MOVIE_GENRES = [
    {"id": 0,     "name": "All"},
    {"id": 28,    "name": "Action"},
    {"id": 12,    "name": "Adventure"},
    {"id": 16,    "name": "Animation"},
    {"id": 35,    "name": "Comedy"},
    {"id": 80,    "name": "Crime"},
    {"id": 99,    "name": "Documentary"},
    {"id": 18,    "name": "Drama"},
    {"id": 10751, "name": "Family"},
    {"id": 14,    "name": "Fantasy"},
    {"id": 27,    "name": "Horror"},
    {"id": 9648,  "name": "Mystery"},
    {"id": 10749, "name": "Romance"},
    {"id": 878,   "name": "Sci-Fi"},
    {"id": 53,    "name": "Thriller"},
]

TV_GENRES = [
    {"id": 0,     "name": "All"},
    {"id": 10759, "name": "Action & Adventure"},
    {"id": 16,    "name": "Animation"},
    {"id": 35,    "name": "Comedy"},
    {"id": 80,    "name": "Crime"},
    {"id": 99,    "name": "Documentary"},
    {"id": 18,    "name": "Drama"},
    {"id": 10751, "name": "Family"},
    {"id": 9648,  "name": "Mystery"},
    {"id": 10765, "name": "Sci-Fi & Fantasy"},
    {"id": 10764, "name": "Reality"},
    {"id": 10766, "name": "Soap"},
]


class BrowseView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        content_type = request.query_params.get('type', 'movie')
        if content_type not in ('movie', 'tvshow'):
            content_type = 'movie'

        genre_id = request.query_params.get('genre', None)
        if genre_id:
            try:
                genre_id = int(genre_id)
                if genre_id == 0:
                    genre_id = None
            except ValueError:
                genre_id = None

        page = max(1, int(request.query_params.get('page', 1)))

        data = TMDBService.discover(
            content_type=content_type,
            genre_id=genre_id,
            page=page,
        )
        items = data.get('results', [])

        # Enrich with user data
        for item in items:
            content_id = item.get('id')
            try:
                user_rating = RatingService.get_user_rating(request.user, content_id, content_type)
                item['user_rating'] = float(user_rating.score) if user_rating else None
                item['in_watchlist'] = WatchlistService.is_in_watchlist(request.user, content_id, content_type)
            except Exception:
                item['user_rating'] = None
                item['in_watchlist'] = False

            # Normalise title field
            if content_type == 'tvshow' and 'name' in item and 'title' not in item:
                item['title'] = item['name']

        genres = MOVIE_GENRES if content_type == 'movie' else TV_GENRES

        return Response({
            'results': items,
            'page': page,
            'total_pages': min(data.get('total_pages', 1), 50),
            'total_results': data.get('total_results', 0),
            'content_type': content_type,
            'genres': genres,
        })


class GenreListView(APIView):
    """Returns genre lists for movies and TV shows."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'movie': MOVIE_GENRES, 'tvshow': TV_GENRES})
