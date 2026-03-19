from rest_framework import serializers
from movies.models import Movie, TVShow


class MovieSerializer(serializers.ModelSerializer):
    """Serializer for Movie model"""
    class Meta:
        model = Movie
        fields = [
            'id', 'title', 'tmdb_id', 'overview', 'poster_path', 
            'backdrop_path', 'genres', 'avg_rating', 'popularity_score',
            'region', 'duration', 'release_year', 'language', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class TVShowSerializer(serializers.ModelSerializer):
    """Serializer for TVShow model"""
    class Meta:
        model = TVShow
        fields = [
            'id', 'title', 'tmdb_id', 'overview', 'poster_path',
            'backdrop_path', 'genres', 'avg_rating', 'popularity_score',
            'region', 'seasons', 'episodes_per_season', 'status', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']
