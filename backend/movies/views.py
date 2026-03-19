from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from movies.repositories import MovieRepository, TVShowRepository
from movies.serializers import MovieSerializer, TVShowSerializer
from services.tmdb_service import TMDBService
from services.rating_service import RatingService
from services.watchlist_service import WatchlistService


class MovieListView(APIView):
    """List movies with optional region filter - fetches from TMDB API"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        region = request.query_params.get('region', 'IN')
        page = int(request.query_params.get('page', 1))
        
        try:
            # Fetch from TMDB API directly
            tmdb_movies = TMDBService.get_popular_movies(region=region, page=page)
            
            if not tmdb_movies:
                return Response({
                    'success': True,
                    'count': 0,
                    'data': []
                }, status=status.HTTP_200_OK)
            
            # Add user-specific fields if authenticated
            if request.user and request.user.is_authenticated:
                try:
                    for movie in tmdb_movies:
                        movie_id = movie.get('id')
                        user_rating = RatingService.get_user_rating(request.user, movie_id, 'movie')
                        movie['user_rating'] = float(user_rating.score) if user_rating else None
                        movie['in_watchlist'] = WatchlistService.is_in_watchlist(request.user, movie_id, 'movie')
                except Exception as user_err:
                    print(f"User data enrichment error: {user_err}")
                    # Continue without user-specific data
            
            return Response({
                'success': True,
                'count': len(tmdb_movies),
                'data': tmdb_movies
            }, status=status.HTTP_200_OK)
        except Exception as e:
            print(f"MovieListView Error: {e}")
            import traceback
            traceback.print_exc()
            return Response({
                'success': False,
                'error': 'internal_error',
                'message': str(e),
                'data': []
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MovieDetailView(APIView):
    """Get movie details by TMDB ID"""
    permission_classes = [AllowAny]
    
    def get(self, request, pk):
        # pk is a TMDB ID — fetch directly from TMDB
        data = TMDBService.get_movie_details(pk)
        if not data:
            return Response({
                'success': False,
                'error': 'not_found',
                'message': 'Movie not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Add user-specific fields if authenticated
        if request.user and request.user.is_authenticated:
            try:
                user_rating = RatingService.get_user_rating(request.user, pk, 'movie')
                data['user_rating'] = float(user_rating.score) if user_rating else None
                watchlist_entry = WatchlistService.get_watchlist_entry(request.user, pk, 'movie')
                data['in_watchlist'] = watchlist_entry is not None
                data['watchlist_id'] = watchlist_entry.id if watchlist_entry else None
            except Exception as user_err:
                print(f"User data enrichment error: {user_err}")
                data['user_rating'] = None
                data['in_watchlist'] = False
                data['watchlist_id'] = None
        else:
            data['user_rating'] = None
            data['in_watchlist'] = False
            data['watchlist_id'] = None
        
        return Response({
            'success': True,
            'data': data
        }, status=status.HTTP_200_OK)


class TVShowListView(APIView):
    """List TV shows with optional region filter - fetches from TMDB API"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        region = request.query_params.get('region', 'IN')
        page = int(request.query_params.get('page', 1))
        
        # Fetch from TMDB API directly
        tmdb_shows = TMDBService.get_popular_tv(region=region, page=page)
        
        # Add user-specific fields if authenticated
        if request.user.is_authenticated:
            for show in tmdb_shows:
                show_id = show.get('id')
                user_rating = RatingService.get_user_rating(request.user, show_id, 'tvshow')
                show['user_rating'] = float(user_rating.score) if user_rating else None
                show['in_watchlist'] = WatchlistService.is_in_watchlist(request.user, show_id, 'tvshow')
        
        return Response({
            'success': True,
            'count': len(tmdb_shows),
            'data': tmdb_shows
        }, status=status.HTTP_200_OK)


class TVShowDetailView(APIView):
    """Get TV show details by TMDB ID"""
    permission_classes = [AllowAny]
    
    def get(self, request, pk):
        # pk is a TMDB ID — fetch directly from TMDB
        data = TMDBService.get_tv_details(pk)
        if not data:
            return Response({
                'success': False,
                'error': 'not_found',
                'message': 'TV show not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Add user-specific fields if authenticated
        if request.user and request.user.is_authenticated:
            try:
                user_rating = RatingService.get_user_rating(request.user, pk, 'tvshow')
                data['user_rating'] = float(user_rating.score) if user_rating else None
                watchlist_entry = WatchlistService.get_watchlist_entry(request.user, pk, 'tvshow')
                data['in_watchlist'] = watchlist_entry is not None
                data['watchlist_id'] = watchlist_entry.id if watchlist_entry else None
            except Exception as user_err:
                print(f"User data enrichment error: {user_err}")
                data['user_rating'] = None
                data['in_watchlist'] = False
                data['watchlist_id'] = None
        else:
            data['user_rating'] = None
            data['in_watchlist'] = False
            data['watchlist_id'] = None
        
        return Response({
            'success': True,
            'data': data
        }, status=status.HTTP_200_OK)


class ContentSearchView(APIView):
    """Search movies and TV shows"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        query = request.query_params.get('q', '')
        page = int(request.query_params.get('page', 1))
        
        if not query:
            return Response({
                'success': False,
                'error': 'validation_error',
                'message': 'Search query is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Search using TMDB API
            results = TMDBService.search_content(query, page=page)
            
            # Add user-specific fields if authenticated
            if request.user and request.user.is_authenticated:
                try:
                    for movie in results.get('movies', []):
                        movie_id = movie.get('id')
                        user_rating = RatingService.get_user_rating(request.user, movie_id, 'movie')
                        movie['user_rating'] = float(user_rating.score) if user_rating else None
                        movie['in_watchlist'] = WatchlistService.is_in_watchlist(request.user, movie_id, 'movie')
                    
                    for show in results.get('tvshows', []):
                        show_id = show.get('id')
                        user_rating = RatingService.get_user_rating(request.user, show_id, 'tvshow')
                        show['user_rating'] = float(user_rating.score) if user_rating else None
                        show['in_watchlist'] = WatchlistService.is_in_watchlist(request.user, show_id, 'tvshow')
                except Exception as user_err:
                    print(f"User data enrichment error: {user_err}")
            
            return Response({
                'success': True,
                'query': query,
                'results': results
            }, status=status.HTTP_200_OK)
        except Exception as e:
            print(f"ContentSearchView Error: {e}")
            return Response({
                'success': False,
                'error': 'internal_error',
                'message': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
