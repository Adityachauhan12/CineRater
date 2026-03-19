from typing import Dict, List
from collections import Counter
from movies.models import Rating, Watchlist, Movie, TVShow
from services.watchlist_service import WatchlistService


class UserContextService:
    """Service for building user context (MCP-style) for AI recommendations"""
    
    @staticmethod
    def build_context(user) -> Dict:
        """
        Build comprehensive user context for AI recommendations
        
        Args:
            user: User instance
            
        Returns:
            Dict with user preferences and history
        """
        # Get user's watchlist with details
        watchlist_data = WatchlistService.get_watchlist(user)
        
        # Get user's ratings with content details
        rated_content = UserContextService._get_rated_content(user)
        
        # Calculate favorite genres
        favorite_genres = UserContextService._calculate_favorite_genres(
            watchlist_data, rated_content
        )
        
        # Build context
        context = {
            'watchlist': [
                {
                    'title': item['title'],
                    'genres': item.get('genres', []),
                    'content_type': 'movie' if 'duration' in item else 'tvshow'
                }
                for item in watchlist_data
            ],
            'rated_content': rated_content,
            'favorite_genres': favorite_genres,
            'total_ratings': len(rated_content),
            'watchlist_count': len(watchlist_data)
        }
        
        return context
    
    @staticmethod
    def _get_rated_content(user) -> List[Dict]:
        """
        Get user's rated content with details
        
        Args:
            user: User instance
            
        Returns:
            List of rated content with details
        """
        ratings = Rating.objects.filter(user=user).select_related().order_by('-created_at')
        
        rated_content = []
        for rating in ratings:
            # Get content details
            if rating.content_type == 'movie':
                try:
                    content = Movie.objects.get(id=rating.content_id)
                    rated_content.append({
                        'title': content.title,
                        'score': float(rating.score),
                        'genres': content.genres,
                        'content_type': 'movie'
                    })
                except Movie.DoesNotExist:
                    continue
            elif rating.content_type == 'tvshow':
                try:
                    content = TVShow.objects.get(id=rating.content_id)
                    rated_content.append({
                        'title': content.title,
                        'score': float(rating.score),
                        'genres': content.genres,
                        'content_type': 'tvshow'
                    })
                except TVShow.DoesNotExist:
                    continue
        
        return rated_content
    
    @staticmethod
    def _calculate_favorite_genres(watchlist_data: List[Dict], rated_content: List[Dict]) -> List[str]:
        """
        Calculate user's favorite genres based on watchlist and high ratings
        
        Args:
            watchlist_data: User's watchlist
            rated_content: User's rated content
            
        Returns:
            List of top 3 favorite genres
        """
        genre_counter = Counter()
        
        # Count genres from watchlist (weight: 1)
        for item in watchlist_data:
            genres = item.get('genres', [])
            for genre in genres:
                genre_counter[genre] += 1
        
        # Count genres from highly rated content (score >= 4.0, weight: 2)
        for item in rated_content:
            if item['score'] >= 4.0:
                genres = item.get('genres', [])
                for genre in genres:
                    genre_counter[genre] += 2
        
        # Return top 3 genres
        return [genre for genre, count in genre_counter.most_common(3)]