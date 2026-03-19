from rest_framework import serializers


class RatingSubmitSerializer(serializers.Serializer):
    """Serializer for submitting a rating"""
    content_type = serializers.ChoiceField(choices=['movie', 'tvshow'], required=True)
    score = serializers.DecimalField(max_digits=2, decimal_places=1, required=True)


class RatingDeleteSerializer(serializers.Serializer):
    """Serializer for deleting a rating"""
    content_type = serializers.ChoiceField(choices=['movie', 'tvshow'], required=True)


class WatchlistAddSerializer(serializers.Serializer):
    """Serializer for adding to watchlist"""
    content_id = serializers.IntegerField(required=True)
    content_type = serializers.ChoiceField(choices=['movie', 'tvshow'], required=True)
