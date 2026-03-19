import requests
from typing import Optional, List, Dict
from decouple import config


class TMDBService:
    """Service for TMDB API operations"""
    
    BASE_URL = "https://api.themoviedb.org/3"
    API_KEY = config('TMDB_API_KEY', default='')
    
    @staticmethod
    def _make_request(endpoint: str, params: dict = None) -> Optional[dict]:
        """Make request to TMDB API"""
        if params is None:
            params = {}
        params['api_key'] = TMDBService.API_KEY
        
        try:
            response = requests.get(f"{TMDBService.BASE_URL}{endpoint}", params=params)
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
        """Get detailed movie information"""
        data = TMDBService._make_request(f"/movie/{tmdb_id}")
        if data and 'genres' in data:
            data['genres'] = [genre['name'] for genre in data['genres']]
        if data:
            credits = TMDBService._make_request(f"/movie/{tmdb_id}/credits")
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
        """Get detailed TV show information"""
        data = TMDBService._make_request(f"/tv/{tmdb_id}")
        if data and 'genres' in data:
            data['genres'] = [genre['name'] for genre in data['genres']]
        if data:
            credits = TMDBService._make_request(f"/tv/{tmdb_id}/credits")
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
