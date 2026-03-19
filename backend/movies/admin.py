from django.contrib import admin
from movies.models import Movie, TVShow, Rating, Watchlist


@admin.register(Movie)
class MovieAdmin(admin.ModelAdmin):
    list_display = ('title', 'tmdb_id', 'release_year', 'avg_rating', 'region', 'created_at')
    list_filter = ('region', 'release_year', 'language')
    search_fields = ('title', 'tmdb_id')
    readonly_fields = ('created_at',)


@admin.register(TVShow)
class TVShowAdmin(admin.ModelAdmin):
    list_display = ('title', 'tmdb_id', 'seasons', 'status', 'avg_rating', 'region', 'created_at')
    list_filter = ('region', 'status')
    search_fields = ('title', 'tmdb_id')
    readonly_fields = ('created_at',)


@admin.register(Rating)
class RatingAdmin(admin.ModelAdmin):
    list_display = ('user', 'content_type', 'content_id', 'score', 'created_at')
    list_filter = ('content_type', 'score')
    search_fields = ('user__email',)
    readonly_fields = ('created_at',)


@admin.register(Watchlist)
class WatchlistAdmin(admin.ModelAdmin):
    list_display = ('user', 'content_type', 'content_id', 'added_at')
    list_filter = ('content_type',)
    search_fields = ('user__email',)
    readonly_fields = ('added_at',)
