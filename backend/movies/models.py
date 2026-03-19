from django.db import models
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator, MaxValueValidator

User = get_user_model()


class AbstractContent(models.Model):
    """Abstract base model for Movie and TVShow"""
    title = models.CharField(max_length=255)
    tmdb_id = models.IntegerField(unique=True)
    overview = models.TextField()
    poster_path = models.CharField(max_length=255, blank=True)
    backdrop_path = models.CharField(max_length=255, blank=True)
    genres = models.JSONField(default=list)
    avg_rating = models.DecimalField(max_digits=3, decimal_places=1, default=0.0)
    popularity_score = models.FloatField(default=0.0)
    region = models.CharField(max_length=10, default='GLOBAL')
    created_at = models.DateTimeField(auto_now_add=True)
    embedding = models.JSONField(null=True, blank=True)

    class Meta:
        abstract = True
        ordering = ['-popularity_score']

    def __str__(self):
        return self.title


class Movie(AbstractContent):
    """Movie model"""
    duration = models.IntegerField(help_text="Duration in minutes")
    release_year = models.IntegerField()
    language = models.CharField(max_length=10)

    class Meta:
        db_table = 'movies'
        indexes = [
            models.Index(fields=['tmdb_id']),
            models.Index(fields=['region']),
        ]


class TVShow(AbstractContent):
    """TV Show model"""
    seasons = models.IntegerField()
    episodes_per_season = models.IntegerField()
    status = models.CharField(
        max_length=20,
        choices=[('ongoing', 'Ongoing'), ('ended', 'Ended')],
        default='ongoing'
    )

    class Meta:
        db_table = 'tvshows'
        indexes = [
            models.Index(fields=['tmdb_id']),
            models.Index(fields=['region']),
        ]


class Rating(models.Model):
    """User ratings for movies and TV shows"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ratings')
    content_id = models.IntegerField()
    content_type = models.CharField(
        max_length=10,
        choices=[('movie', 'Movie'), ('tvshow', 'TV Show')]
    )
    score = models.DecimalField(
        max_digits=2,
        decimal_places=1,
        validators=[MinValueValidator(1.0), MaxValueValidator(5.0)]
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ratings'
        unique_together = ('user', 'content_id', 'content_type')
        indexes = [
            models.Index(fields=['content_id', 'content_type']),
            models.Index(fields=['user']),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.content_type} {self.content_id} - {self.score}"


class ContentEmbedding(models.Model):
    """
    Lightweight store for pre-computed TMDB content embeddings.
    Populated by the seed_embeddings management command.
    Used by semantic search instead of the live popular-movies fallback.
    """
    tmdb_id = models.IntegerField()
    content_type = models.CharField(max_length=10, choices=[('movie', 'Movie'), ('tvshow', 'TV Show')])
    title = models.CharField(max_length=255)
    overview = models.TextField(blank=True)
    genres = models.JSONField(default=list)
    poster_path = models.CharField(max_length=255, blank=True)
    popularity = models.FloatField(default=0.0)
    vote_average = models.FloatField(default=0.0)
    release_date = models.CharField(max_length=20, blank=True)
    embedding = models.JSONField()  # list of floats from Gemini text-embedding-004

    class Meta:
        db_table = 'content_embeddings'
        unique_together = ('tmdb_id', 'content_type')
        indexes = [
            models.Index(fields=['content_type']),
            models.Index(fields=['popularity']),
        ]

    def __str__(self):
        return f"{self.content_type}:{self.tmdb_id} — {self.title}"


class Watchlist(models.Model):
    """User watchlist for movies and TV shows"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='watchlist')
    content_id = models.IntegerField()
    content_type = models.CharField(
        max_length=10,
        choices=[('movie', 'Movie'), ('tvshow', 'TV Show')]
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'watchlist'
        unique_together = ('user', 'content_id', 'content_type')
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['content_id', 'content_type']),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.content_type} {self.content_id}"
