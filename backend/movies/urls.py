from django.urls import path
from movies.views import (
    MovieListView, MovieDetailView,
    TVShowListView, TVShowDetailView,
    ContentSearchView
)
from movies.rating_views import (
    ContentRateView, ContentRateDeleteView, ContentRatingsView,
    UserRatingsView,
    WatchlistView, WatchlistAddView, WatchlistRemoveView
)
from movies.recommendation_views import (
    RecommendationsView, PopularContentView
)
from movies.semantic_search_view import SemanticSearchView
from movies.browse_view import BrowseView, GenreListView
from movies.chat_views import chat_stream

urlpatterns = [
    path('movies/', MovieListView.as_view(), name='movie-list'),
    path('movies/<int:pk>/', MovieDetailView.as_view(), name='movie-detail'),
    path('tvshows/', TVShowListView.as_view(), name='tvshow-list'),
    path('tvshows/<int:pk>/', TVShowDetailView.as_view(), name='tvshow-detail'),
    path('content/search/', ContentSearchView.as_view(), name='content-search'),

    # Semantic search (AI-powered re-ranking)
    path('content/semantic-search/', SemanticSearchView.as_view(), name='semantic-search'),

    # Browse with type + genre filters
    path('content/browse/', BrowseView.as_view(), name='browse'),
    path('content/genres/', GenreListView.as_view(), name='genre-list'),

    # AI chat agent (SSE streaming)
    path('chat/', chat_stream, name='chat'),

    # User ratings list
    path('user/ratings/', UserRatingsView.as_view(), name='user-ratings'),

    # Rating endpoints
    path('content/<int:pk>/rate/', ContentRateView.as_view(), name='content-rate'),
    path('content/<int:pk>/rate/delete/', ContentRateDeleteView.as_view(), name='content-rate-delete'),
    path('content/<int:pk>/ratings/', ContentRatingsView.as_view(), name='content-ratings'),

    # Watchlist endpoints
    path('watchlist/', WatchlistView.as_view(), name='watchlist'),
    path('watchlist/add/', WatchlistAddView.as_view(), name='watchlist-add'),
    path('watchlist/<int:pk>/', WatchlistRemoveView.as_view(), name='watchlist-remove'),

    # Recommendation endpoints
    path('recommendations/', RecommendationsView.as_view(), name='recommendations'),
    path('recommendations/popular/', PopularContentView.as_view(), name='popular-content'),
]
