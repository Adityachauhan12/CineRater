from typing import Optional, Dict
from decimal import Decimal
from django.db.models import Avg, Count, Q
from movies.models import Rating


class RatingService:
    """Service for handling rating operations"""
    
    @staticmethod
    def validate_score(score: float) -> None:
        """
        Validate rating score is between 1.0 and 10.0

        Args:
            score: Rating score

        Raises:
            ValueError: If score is not between 1.0 and 10.0
        """
        if not isinstance(score, (int, float, Decimal)):
            raise ValueError("Score must be a number")

        score = float(score)
        if score < 1.0 or score > 10.0:
            raise ValueError("Score must be between 1.0 and 10.0")
    
    @staticmethod
    def get_user_rating(user, content_id: int, content_type: str) -> Optional[Rating]:
        """
        Get user's rating for specific content
        
        Args:
            user: User instance
            content_id: Content ID
            content_type: 'movie' or 'tvshow'
            
        Returns:
            Rating instance or None
        """
        try:
            return Rating.objects.get(
                user=user,
                content_id=content_id,
                content_type=content_type
            )
        except Rating.DoesNotExist:
            return None
    
    @staticmethod
    def submit_rating(user, content_id: int, content_type: str, score: float) -> Dict:
        """
        Submit or update rating for content
        
        Args:
            user: User instance
            content_id: Content ID
            content_type: 'movie' or 'tvshow'
            score: Rating score (1.0-10.0)
            
        Returns:
            Dict with rating info
            
        Raises:
            ValueError: If score invalid or content doesn't exist
        """
        # Validate score
        RatingService.validate_score(score)

        if content_type not in ['movie', 'tvshow']:
            raise ValueError("Invalid content_type. Must be 'movie' or 'tvshow'")

        # Check if user already rated
        existing_rating = RatingService.get_user_rating(user, content_id, content_type)

        if existing_rating:
            existing_rating.score = score
            existing_rating.save()
            is_update = True
        else:
            Rating.objects.create(
                user=user,
                content_id=content_id,
                content_type=content_type,
                score=score
            )
            is_update = False

        # Compute avg from Rating table (content may not be in local DB — TMDB is source of truth)
        avg = Rating.objects.filter(
            content_id=content_id, content_type=content_type
        ).aggregate(Avg('score'))['score__avg']
        avg_rating = round(float(avg), 1) if avg else float(score)

        return {
            'rating': float(score),
            'avg_rating': avg_rating,
            'is_update': is_update
        }
    
    @staticmethod
    def get_content_ratings(content_id: int, content_type: str) -> Dict:
        """
        Get rating statistics for content
        
        Args:
            content_id: Content ID
            content_type: 'movie' or 'tvshow'
            
        Returns:
            Dict with avg_rating, total_ratings, distribution
        """
        ratings = Rating.objects.filter(
            content_id=content_id,
            content_type=content_type
        )
        
        # Calculate average
        avg = ratings.aggregate(Avg('score'))['score__avg']
        avg_rating = round(float(avg), 1) if avg else 0.0
        
        # Total count
        total_ratings = ratings.count()
        
        # Distribution (count per score)
        distribution = {}
        for i in range(1, 11):
            count = ratings.filter(score__gte=i, score__lt=i+1).count()
            distribution[str(i)] = count
        
        return {
            'avg_rating': avg_rating,
            'total_ratings': total_ratings,
            'distribution': distribution
        }
    
    @staticmethod
    def delete_rating(user, content_id: int, content_type: str) -> bool:
        """
        Delete user's rating for content
        
        Args:
            user: User instance
            content_id: Content ID
            content_type: 'movie' or 'tvshow'
            
        Returns:
            True if deleted, False if rating didn't exist
        """
        rating = RatingService.get_user_rating(user, content_id, content_type)
        
        if rating:
            rating.delete()
            return True
        
        return False
