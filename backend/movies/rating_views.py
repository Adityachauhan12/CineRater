from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from services.rating_service import RatingService
from services.watchlist_service import WatchlistService
from services.tmdb_service import TMDBService
from movies.models import Rating
from movies.rating_serializers import (
    RatingSubmitSerializer,
    RatingDeleteSerializer,
    WatchlistAddSerializer
)


class ContentRateView(APIView):
    """Submit or update rating for content"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request, pk):
        # Get content_type from request body or query params
        content_type = request.data.get('content_type') or request.query_params.get('content_type', 'movie')
        score = request.data.get('score')
        
        # Validate
        if not score:
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': {'score': ['This field is required.']}
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if content_type not in ['movie', 'tvshow']:
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': {'content_type': ['Must be movie or tvshow']}
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            score = float(score)
            if score < 1.0 or score > 10.0:
                return Response({
                    'success': False,
                    'error': 'validation_error',
                    'message': {'score': ['Score must be between 1.0 and 10.0']}
                }, status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, TypeError):
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': {'score': ['Invalid score value']}
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = RatingService.submit_rating(
                user=request.user,
                content_id=pk,
                content_type=content_type,
                score=score
            )
            
            return Response({
                'success': True,
                'rating': result['rating'],
                'avg_rating': result['avg_rating'],
                'is_update': result['is_update']
            }, status=status.HTTP_200_OK)
            
        except ValueError as e:
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': 'internal_error',
                'message': 'An unexpected error occurred'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ContentRateDeleteView(APIView):
    """Delete rating for content"""
    permission_classes = [IsAuthenticated]
    
    def delete(self, request, pk):
        serializer = RatingDeleteSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        content_type = serializer.validated_data['content_type']
        
        deleted = RatingService.delete_rating(
            user=request.user,
            content_id=pk,
            content_type=content_type
        )
        
        if deleted:
            return Response({
                'success': True,
                'message': 'Rating removed'
            }, status=status.HTTP_200_OK)
        else:
            return Response({
                'success': False,
                'error': 'not_found',
                'message': 'Rating not found'
            }, status=status.HTTP_404_NOT_FOUND)


class ContentRatingsView(APIView):
    """Get rating statistics for content"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, pk):
        content_type = request.query_params.get('content_type', 'movie')
        
        if content_type not in ['movie', 'tvshow']:
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': 'Invalid content_type'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            stats = RatingService.get_content_ratings(pk, content_type)
            return Response({
                'success': True,
                'avg_rating': stats['avg_rating'],
                'total': stats['total_ratings'],
                'distribution': stats['distribution']
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': 'internal_error',
                'message': 'An unexpected error occurred'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class UserRatingsView(APIView):
    """Get user ratings — server-side filter/sort/pagination + overall stats."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from concurrent.futures import ThreadPoolExecutor, as_completed
        from django.db.models import Avg

        PAGE_SIZE = 60
        page        = max(1, int(request.query_params.get('page', 1)))
        filter_type = request.query_params.get('filter', 'all')   # all | movie | tvshow
        sort_by     = request.query_params.get('sort', 'recent')  # recent | high | low

        # Base queryset
        qs = Rating.objects.filter(user=request.user)

        # Filter
        if filter_type == 'movie':
            qs = qs.filter(content_type='movie')
        elif filter_type == 'tvshow':
            qs = qs.filter(content_type='tvshow')

        # Sort
        if sort_by == 'high':
            qs = qs.order_by('-score', '-created_at')
        elif sort_by == 'low':
            qs = qs.order_by('score', '-created_at')
        else:
            qs = qs.order_by('-created_at')

        total = qs.count()
        offset = (page - 1) * PAGE_SIZE
        ratings = list(qs[offset:offset + PAGE_SIZE])

        # Overall stats (across all ratings, ignoring filter for counts)
        all_qs = Rating.objects.filter(user=request.user)
        stats = {
            'total':    all_qs.count(),
            'movies':   all_qs.filter(content_type='movie').count(),
            'tvshows':  all_qs.filter(content_type='tvshow').count(),
            'avg':      round(float(all_qs.aggregate(a=Avg('score'))['a'] or 0), 1),
        }

        def fetch(r):
            try:
                if r.content_type == 'movie':
                    content = TMDBService.get_movie_details(r.content_id)
                else:
                    content = TMDBService.get_tv_details(r.content_id)
                if content:
                    content['user_rating'] = float(r.score)
                    content['content_type'] = r.content_type
                    content['rated_at'] = r.created_at.isoformat()
                    return content
            except Exception:
                pass
            return None

        result = []
        with ThreadPoolExecutor(max_workers=15) as executor:
            futures = {executor.submit(fetch, r): r for r in ratings}
            for fut in as_completed(futures):
                item = fut.result()
                if item:
                    result.append(item)

        # Re-sort to match DB order (parallel fetch scrambles it)
        if sort_by == 'high':
            result.sort(key=lambda x: x.get('user_rating', 0), reverse=True)
        elif sort_by == 'low':
            result.sort(key=lambda x: x.get('user_rating', 0))
        else:
            result.sort(key=lambda x: x.get('rated_at', ''), reverse=True)

        return Response({
            'success': True,
            'count': len(result),
            'total': total,
            'page': page,
            'total_pages': max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE),
            'stats': stats,
            'data': result,
        })


class WatchlistView(APIView):
    """Get user's watchlist"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        watchlist = WatchlistService.get_watchlist(request.user)
        return Response({
            'success': True,
            'count': len(watchlist),
            'data': watchlist
        }, status=status.HTTP_200_OK)


class WatchlistAddView(APIView):
    """Add content to watchlist"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = WatchlistAddSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        content_id = serializer.validated_data['content_id']
        content_type = serializer.validated_data['content_type']
        
        try:
            result = WatchlistService.add_to_watchlist(
                user=request.user,
                content_id=content_id,
                content_type=content_type
            )
            
            return Response({
                'success': True,
                'added': result['added'],
                'message': result['message']
            }, status=status.HTTP_200_OK)
            
        except ValueError as e:
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': 'internal_error',
                'message': 'An unexpected error occurred'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WatchlistRemoveView(APIView):
    """Remove content from watchlist"""
    permission_classes = [IsAuthenticated]
    
    def delete(self, request, pk):
        content_type = request.query_params.get('content_type', 'movie')
        
        if content_type not in ['movie', 'tvshow']:
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': 'Invalid content_type'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        removed = WatchlistService.remove_from_watchlist(
            user=request.user,
            content_id=pk,
            content_type=content_type
        )
        
        if removed:
            return Response({
                'success': True,
                'removed': True,
                'message': 'Removed from watchlist'
            }, status=status.HTTP_200_OK)
        else:
            return Response({
                'success': False,
                'error': 'not_found',
                'message': 'Not in watchlist'
            }, status=status.HTTP_404_NOT_FOUND)
