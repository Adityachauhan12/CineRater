from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from services.multi_agent_recommendation_service import MultiAgentRecommendationService
from services.location_service import LocationService
from services.tmdb_service import TMDBService


class RecommendationsView(APIView):
    """Get AI-powered recommendations for authenticated user"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Get user's region from IP
        client_ip = LocationService.get_client_ip(request)
        region = LocationService.get_region_from_ip(client_ip)
        
        try:
            # Get AI recommendations
            result = MultiAgentRecommendationService.get_recommendations(request.user, region)

            return Response({
                'success':       True,
                'type':          result['type'],
                'region':        result['region'],
                'count':         len(result['data']),
                'taste_profile': result.get('taste_profile'),
                'data':          result['data'],
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': 'internal_error',
                'message': 'Failed to generate recommendations'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PopularContentView(APIView):
    """Get popular content by region (no auth required) - fetches from TMDB"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        # Get region from query param or IP detection
        region = request.query_params.get('region')
        
        if not region:
            client_ip = LocationService.get_client_ip(request)
            region = LocationService.get_region_from_ip(client_ip)
        
        # Validate region
        if region not in ['IN', 'US', 'GLOBAL']:
            region = 'IN'
        
        try:
            # Fetch from TMDB API
            movies = TMDBService.get_popular_movies(region=region, page=1)[:10]
            tv_shows = TMDBService.get_popular_tv(region=region, page=1)[:10]
            
            # Add content_type field
            for movie in movies:
                movie['content_type'] = 'movie'
            for show in tv_shows:
                show['content_type'] = 'tvshow'
            
            # Merge and sort by popularity
            all_content = movies + tv_shows
            all_content.sort(key=lambda x: x.get('popularity', 0), reverse=True)
            popular = all_content[:10]
            
            return Response({
                'success': True,
                'type': 'popular',
                'region': region,
                'count': len(popular),
                'data': popular
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({
                'success': False,
                'error': 'internal_error',
                'message': 'Failed to fetch popular content'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)