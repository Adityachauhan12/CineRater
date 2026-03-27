import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Optional, List, Dict
from decouple import config


def _build_session() -> requests.Session:
    """Create a session with connection pooling and automatic retries."""
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=0.4,          # waits 0s, 0.4s, 0.8s between retries
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(
        max_retries=retry,
        pool_connections=4,
        pool_maxsize=10,
    )
    session.mount("https://", adapter)
    session.headers.update({
        "User-Agent": "CineRater/1.0",
        "Accept": "application/json",
    })
    return session


# Module-level session — reused across all requests (connection pooling)
_session = _build_session()


class TMDBService:
    """Service for TMDB API operations"""

    BASE_URL = "https://api.themoviedb.org/3"
    API_KEY = config('TMDB_API_KEY', default='')
    TIMEOUT = 10  # seconds

    @staticmethod
    def _make_request(endpoint: str, params: dict = None) -> Optional[dict]:
        """Make request to TMDB API with retries and connection reuse."""
        if params is None:
            params = {}
        params['api_key'] = TMDBService.API_KEY

        try:
            response = _session.get(
                f"{TMDBService.BASE_URL}{endpoint}",
                params=params,
                timeout=TMDBService.TIMEOUT,
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"TMDB API Error: {e}")
            return None

    @staticmethod
    def get_popular_movies(region: str = "IN", page: int = 1) -> List[Dict]:
        """Get popular movies by region"""
        data = TMDBService._make_request(
            "/movie/popular",
            params={'region': region, 'page': page}
        )
        return data.get('results', []) if data else []

    @staticmethod
    def get_movie_details(tmdb_id: int) -> Optional[Dict]:
        """Get detailed movie information including cast, trailer, and similar titles."""
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=4) as executor:
            main_fut    = executor.submit(TMDBService._make_request, f"/movie/{tmdb_id}")
            credits_fut = executor.submit(TMDBService._make_request, f"/movie/{tmdb_id}/credits")
            videos_fut  = executor.submit(TMDBService._make_request, f"/movie/{tmdb_id}/videos")
            similar_fut = executor.submit(TMDBService._make_request, f"/movie/{tmdb_id}/similar")

        data    = main_fut.result()
        credits = credits_fut.result()
        videos  = videos_fut.result()
        similar = similar_fut.result()

        if not data:
            return None

        if 'genres' in data:
            data['genres'] = [genre['name'] for genre in data['genres']]

        if credits:
            cast = credits.get('cast', [])
            data['cast'] = [
                {
                    'id': m.get('id'),
                    'name': m.get('name'),
                    'character': m.get('character'),
                    'profile_path': m.get('profile_path'),
                }
                for m in cast[:10]
            ]
            crew = credits.get('crew', [])
            directors = [c for c in crew if c.get('job') == 'Director']
            data['director'] = directors[0].get('name') if directors else None

        # First YouTube trailer, falling back to teaser
        trailer_key = None
        if videos:
            all_vids = videos.get('results', [])
            trailers = [v for v in all_vids if v.get('site') == 'YouTube' and v.get('type') == 'Trailer']
            teasers  = [v for v in all_vids if v.get('site') == 'YouTube' and v.get('type') == 'Teaser']
            picked = trailers or teasers
            if picked:
                trailer_key = picked[0].get('key')
        data['trailer_key'] = trailer_key

        # Similar movies (poster, title, score)
        data['similar'] = []
        if similar:
            data['similar'] = [
                {
                    'id': m.get('id'),
                    'title': m.get('title'),
                    'poster_path': m.get('poster_path'),
                    'vote_average': m.get('vote_average'),
                    'release_date': m.get('release_date'),
                }
                for m in similar.get('results', [])[:10]
                if m.get('poster_path')
            ]

        return data

    @staticmethod
    def get_popular_tv(region: str = "IN", page: int = 1) -> List[Dict]:
        """Get popular TV shows"""
        data = TMDBService._make_request(
            "/tv/popular",
            params={'region': region, 'page': page}
        )
        return data.get('results', []) if data else []

    @staticmethod
    def get_tv_details(tmdb_id: int) -> Optional[Dict]:
        """Get detailed TV show information including cast, trailer, and similar titles."""
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=4) as executor:
            main_fut    = executor.submit(TMDBService._make_request, f"/tv/{tmdb_id}")
            credits_fut = executor.submit(TMDBService._make_request, f"/tv/{tmdb_id}/credits")
            videos_fut  = executor.submit(TMDBService._make_request, f"/tv/{tmdb_id}/videos")
            similar_fut = executor.submit(TMDBService._make_request, f"/tv/{tmdb_id}/similar")

        data    = main_fut.result()
        credits = credits_fut.result()
        videos  = videos_fut.result()
        similar = similar_fut.result()

        if not data:
            return None

        if 'genres' in data:
            data['genres'] = [genre['name'] for genre in data['genres']]

        if credits:
            cast = credits.get('cast', [])
            data['cast'] = [
                {
                    'id': m.get('id'),
                    'name': m.get('name'),
                    'character': m.get('character'),
                    'profile_path': m.get('profile_path'),
                }
                for m in cast[:10]
            ]

        # First YouTube trailer, falling back to teaser
        trailer_key = None
        if videos:
            all_vids = videos.get('results', [])
            trailers = [v for v in all_vids if v.get('site') == 'YouTube' and v.get('type') == 'Trailer']
            teasers  = [v for v in all_vids if v.get('site') == 'YouTube' and v.get('type') == 'Teaser']
            picked = trailers or teasers
            if picked:
                trailer_key = picked[0].get('key')
        data['trailer_key'] = trailer_key

        # Similar shows (poster, name, score)
        data['similar'] = []
        if similar:
            data['similar'] = [
                {
                    'id': m.get('id'),
                    'name': m.get('name'),
                    'poster_path': m.get('poster_path'),
                    'vote_average': m.get('vote_average'),
                    'first_air_date': m.get('first_air_date'),
                }
                for m in similar.get('results', [])[:10]
                if m.get('poster_path')
            ]

        return data

    @staticmethod
    def discover(content_type: str = 'movie', genre_id: int = None, sort_by: str = 'popularity.desc', page: int = 1) -> Dict:
        """Discover movies or TV shows, optionally filtered by genre."""
        endpoint = '/discover/movie' if content_type == 'movie' else '/discover/tv'
        params = {'sort_by': sort_by, 'page': page, 'vote_count.gte': 50}
        if genre_id:
            params['with_genres'] = genre_id
        data = TMDBService._make_request(endpoint, params=params)
        return data if data else {'results': [], 'total_pages': 0, 'total_results': 0}

    @staticmethod
    def find_by_imdb_id(imdb_id: str) -> Optional[Dict]:
        """
        Look up a movie or TV show by IMDB ID (e.g. 'tt0468569').
        Returns {'id': tmdb_id, 'content_type': 'movie'|'tvshow', 'title': ...} or None.
        """
        data = TMDBService._make_request(f"/find/{imdb_id}", params={'external_source': 'imdb_id'})
        if not data:
            return None
        movies = data.get('movie_results', [])
        if movies:
            m = movies[0]
            return {'id': m['id'], 'content_type': 'movie', 'title': m.get('title', '')}
        tv = data.get('tv_results', [])
        if tv:
            t = tv[0]
            return {'id': t['id'], 'content_type': 'tvshow', 'title': t.get('name', '')}
        return None

    @staticmethod
    def get_genre_map(content_type: str = 'movie') -> dict:
        """Return {genre_id: genre_name} mapping for movies or TV shows."""
        endpoint = '/genre/movie/list' if content_type == 'movie' else '/genre/tv/list'
        data = TMDBService._make_request(endpoint)
        if not data:
            return {}
        return {g['id']: g['name'] for g in data.get('genres', [])}

    @staticmethod
    def get_top_rated_movies(page: int = 1) -> List[Dict]:
        """Get top-rated movies."""
        data = TMDBService._make_request('/movie/top_rated', params={'page': page})
        return data.get('results', []) if data else []

    @staticmethod
    def get_top_rated_tv(page: int = 1) -> List[Dict]:
        """Get top-rated TV shows."""
        data = TMDBService._make_request('/tv/top_rated', params={'page': page})
        return data.get('results', []) if data else []

    @staticmethod
    def search_content(query: str, page: int = 1) -> Dict:
        """Search movies and TV shows"""
        data = TMDBService._make_request(
            "/search/multi",
            params={'query': query, 'page': page}
        )

        if not data:
            return {'movies': [], 'tvshows': []}

        results = data.get('results', [])
        movies = [r for r in results if r.get('media_type') == 'movie']
        tvshows = [r for r in results if r.get('media_type') == 'tv']

        return {'movies': movies, 'tvshows': tvshows}
