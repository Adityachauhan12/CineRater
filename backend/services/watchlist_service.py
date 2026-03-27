import logging
from typing import List, Dict
from movies.models import Watchlist
from services.tmdb_service import TMDBService

logger = logging.getLogger(__name__)


class WatchlistService:
    """Service for handling watchlist operations"""
    
    @staticmethod
    def get_watchlist(user) -> List[Dict]:
        """
        Get user's watchlist with content details from TMDB
        
        Args:
            user: User instance
            
        Returns:
            List of content with details from TMDB
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed

        watchlist_items = list(Watchlist.objects.filter(user=user).order_by('-added_at'))

        def fetch(item):
            try:
                # Use basic endpoint (just poster/title/year) — full details not needed for list view
                if item.content_type == 'movie':
                    content = TMDBService._make_request(f"/movie/{item.content_id}")
                elif item.content_type == 'tvshow':
                    content = TMDBService._make_request(f"/tv/{item.content_id}")
                else:
                    return None
                if content:
                    content['watchlist_id'] = item.id
                    content['added_at'] = item.added_at.isoformat()
                    content['content_type'] = item.content_type
                    return content
            except Exception as e:
                logger.warning("Error fetching content %s: %s", item.content_id, e)
            return None

        result = []
        with ThreadPoolExecutor(max_workers=15) as executor:
            futures = {executor.submit(fetch, item): item for item in watchlist_items}
            for fut in as_completed(futures):
                item = fut.result()
                if item:
                    result.append(item)

        result.sort(key=lambda x: x.get('added_at', ''), reverse=True)
        return result
    
    @staticmethod
    def add_to_watchlist(user, content_id: int, content_type: str) -> Dict:
        """
        Add content to user's watchlist
        
        Args:
            user: User instance
            content_id: Content ID
            content_type: 'movie' or 'tvshow'
            
        Returns:
            Dict with added status and message
            
        Raises:
            ValueError: If content doesn't exist or invalid content_type
        """
        # Validate content_type
        if content_type not in ['movie', 'tvshow']:
            raise ValueError("Invalid content_type. Must be 'movie' or 'tvshow'")
        
        # Check if already in watchlist
        if WatchlistService.is_in_watchlist(user, content_id, content_type):
            return {
                'added': False,
                'message': 'Already in watchlist'
            }
        
        # Add to watchlist (content lives on TMDB, not necessarily in local DB)
        Watchlist.objects.create(
            user=user,
            content_id=content_id,
            content_type=content_type
        )
        
        return {
            'added': True,
            'message': 'Added to watchlist'
        }
    
    @staticmethod
    def remove_from_watchlist(user, content_id: int, content_type: str) -> bool:
        """
        Remove content from user's watchlist
        
        Args:
            user: User instance
            content_id: Content ID
            content_type: 'movie' or 'tvshow'
            
        Returns:
            True if removed, False if not in watchlist
        """
        try:
            watchlist_item = Watchlist.objects.get(
                user=user,
                content_id=content_id,
                content_type=content_type
            )
            watchlist_item.delete()
            return True
        except Watchlist.DoesNotExist:
            return False
    
    @staticmethod
    def is_in_watchlist(user, content_id: int, content_type: str) -> bool:
        """
        Check if content is in user's watchlist

        Args:
            user: User instance
            content_id: Content ID (TMDB ID)
            content_type: 'movie' or 'tvshow'

        Returns:
            True if in watchlist, False otherwise
        """
        return Watchlist.objects.filter(
            user=user,
            content_id=content_id,
            content_type=content_type
        ).exists()

    @staticmethod
    def get_watchlist_entry(user, content_id: int, content_type: str):
        """
        Get the watchlist entry for a content item, or None if not present.

        Args:
            user: User instance
            content_id: Content ID (TMDB ID)
            content_type: 'movie' or 'tvshow'

        Returns:
            Watchlist instance or None
        """
        try:
            return Watchlist.objects.get(
                user=user,
                content_id=content_id,
                content_type=content_type
            )
        except Watchlist.DoesNotExist:
            return None
