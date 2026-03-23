"""
Review service — CRUD for user text reviews with auto-embedding.
Embeddings are stored on the Review record so RAG can retrieve them without
re-computing on every question.
"""

import logging
from movies.models import Review
from services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


class ReviewService:

    @staticmethod
    def create_or_update(user, content_id: int, content_type: str, body: str) -> Review:
        """
        Create a new review or replace an existing one for the same user+content.
        Auto-generates and stores an embedding of the review body.
        """
        if content_type not in ('movie', 'tvshow'):
            raise ValueError("content_type must be 'movie' or 'tvshow'")
        if not body or not body.strip():
            raise ValueError("Review body cannot be empty")
        if len(body) > 4000:
            raise ValueError("Review must be 4000 characters or fewer")

        embedding = EmbeddingService.embed_text(body.strip())

        review, _ = Review.objects.update_or_create(
            user=user,
            content_id=content_id,
            content_type=content_type,
            defaults={'body': body.strip(), 'embedding': embedding},
        )
        return review

    @staticmethod
    def list_reviews(content_id: int, content_type: str) -> list:
        """Return all reviews for a piece of content, newest first."""
        qs = (
            Review.objects
            .filter(content_id=content_id, content_type=content_type)
            .select_related('user')
            .order_by('-created_at')
        )
        return [
            {
                'id': r.id,
                'user': r.user.username or r.user.email.split('@')[0],
                'body': r.body,
                'created_at': r.created_at.isoformat(),
            }
            for r in qs
        ]

    @staticmethod
    def delete_review(user, review_id: int) -> bool:
        """Delete a review owned by the given user. Returns True if deleted."""
        deleted, _ = Review.objects.filter(id=review_id, user=user).delete()
        return deleted > 0

    @staticmethod
    def get_embedded_reviews(content_id: int, content_type: str) -> list:
        """
        Return reviews that have embeddings — used by RAG service.
        Returns list of dicts: {id, body, embedding}.
        """
        qs = Review.objects.filter(
            content_id=content_id,
            content_type=content_type,
            embedding__isnull=False,
        ).values('id', 'body', 'embedding')
        return list(qs)
