from typing import Optional, List
from django.db.models import Avg
from movies.models import Movie, TVShow, Rating


class MovieRepository:
    """Repository for Movie database operations"""
    
    @staticmethod
    def get_by_id(movie_id: int) -> Optional[Movie]:
        """Get movie by ID"""
        try:
            return Movie.objects.get(id=movie_id)
        except Movie.DoesNotExist:
            return None
    
    @staticmethod
    def get_by_tmdb_id(tmdb_id: int) -> Optional[Movie]:
        """Get movie by TMDB ID"""
        try:
            return Movie.objects.get(tmdb_id=tmdb_id)
        except Movie.DoesNotExist:
            return None
    
    @staticmethod
    def get_popular(region: str = 'GLOBAL', limit: int = 10) -> List[Movie]:
        """Get popular movies by region with fallback"""
        # Try specific region first
        movies = list(Movie.objects.filter(region=region).order_by('-popularity_score')[:limit])
        
        # If no movies in specific region, get from all regions
        if not movies:
            movies = list(Movie.objects.all().order_by('-popularity_score')[:limit])
        
        return movies
    
    @staticmethod
    def search(query: str) -> List[Movie]:
        """Search movies by title"""
        return list(Movie.objects.filter(title__icontains=query))
    
    @staticmethod
    def create_from_tmdb(tmdb_data: dict) -> Movie:
        """Create movie from TMDB API data"""
        return Movie.objects.create(
            title=tmdb_data['title'],
            tmdb_id=tmdb_data['id'],
            overview=tmdb_data.get('overview', ''),
            poster_path=tmdb_data.get('poster_path', ''),
            backdrop_path=tmdb_data.get('backdrop_path', ''),
            genres=tmdb_data.get('genres', []),
            popularity_score=tmdb_data.get('popularity', 0.0),
            region=tmdb_data.get('region', 'GLOBAL'),
            duration=tmdb_data.get('runtime', 0),
            release_year=int(tmdb_data.get('release_date', '2024')[:4]) if tmdb_data.get('release_date') else 2024,
            language=tmdb_data.get('original_language', 'en')
        )
    
    @staticmethod
    def update_avg_rating(content_id: int, content_type: str) -> None:
        """Update average rating for content"""
        avg = Rating.objects.filter(
            content_id=content_id,
            content_type=content_type
        ).aggregate(Avg('score'))['score__avg']
        
        if avg is not None:
            if content_type == 'movie':
                Movie.objects.filter(id=content_id).update(avg_rating=round(avg, 1))
            elif content_type == 'tvshow':
                TVShow.objects.filter(id=content_id).update(avg_rating=round(avg, 1))


class TVShowRepository:
    """Repository for TVShow database operations"""
    
    @staticmethod
    def get_by_id(tvshow_id: int) -> Optional[TVShow]:
        """Get TV show by ID"""
        try:
            return TVShow.objects.get(id=tvshow_id)
        except TVShow.DoesNotExist:
            return None
    
    @staticmethod
    def get_by_tmdb_id(tmdb_id: int) -> Optional[TVShow]:
        """Get TV show by TMDB ID"""
        try:
            return TVShow.objects.get(tmdb_id=tmdb_id)
        except TVShow.DoesNotExist:
            return None
    
    @staticmethod
    def get_popular(region: str = 'GLOBAL', limit: int = 10) -> List[TVShow]:
        """Get popular TV shows by region with fallback"""
        # Try specific region first
        tvshows = list(TVShow.objects.filter(region=region).order_by('-popularity_score')[:limit])
        
        # If no TV shows in specific region, get from all regions
        if not tvshows:
            tvshows = list(TVShow.objects.all().order_by('-popularity_score')[:limit])
        
        return tvshows
    
    @staticmethod
    def search(query: str) -> List[TVShow]:
        """Search TV shows by title"""
        return list(TVShow.objects.filter(title__icontains=query))
    
    @staticmethod
    def create_from_tmdb(tmdb_data: dict) -> TVShow:
        """Create TV show from TMDB API data"""
        return TVShow.objects.create(
            title=tmdb_data['name'],
            tmdb_id=tmdb_data['id'],
            overview=tmdb_data.get('overview', ''),
            poster_path=tmdb_data.get('poster_path', ''),
            backdrop_path=tmdb_data.get('backdrop_path', ''),
            genres=tmdb_data.get('genres', []),
            popularity_score=tmdb_data.get('popularity', 0.0),
            region=tmdb_data.get('region', 'GLOBAL'),
            seasons=tmdb_data.get('number_of_seasons', 1),
            episodes_per_season=tmdb_data.get('number_of_episodes', 10),
            status='ended' if tmdb_data.get('status') == 'Ended' else 'ongoing'
        )
