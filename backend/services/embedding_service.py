"""
Embedding service for semantic search.
Uses sentence-transformers (all-MiniLM-L6-v2) — local model, no API key required.
Embeddings are cached in Redis. Cache keys prefixed 'emb:st:' to avoid collisions
with any old OpenAI-based embeddings stored under 'emb:'.
"""

import math
import logging
from typing import Optional
from django.core.cache import cache

logger = logging.getLogger(__name__)

# Lazy singleton — model is downloaded once (~22 MB) and kept in memory
_model = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading sentence-transformers model all-MiniLM-L6-v2 ...")
        _model = SentenceTransformer('all-MiniLM-L6-v2')
        logger.info("Embedding model ready.")
    return _model


EMBEDDING_CACHE_TTL = 60 * 60 * 24 * 7  # 7 days
_CACHE_PREFIX = "emb:st"


class EmbeddingService:

    @staticmethod
    def embed_text(text: str) -> Optional[list]:
        """
        Generate a 384-dim embedding vector for text using all-MiniLM-L6-v2.
        Returns list of floats or None on failure.
        """
        text = text.strip().replace('\n', ' ')
        if not text:
            return None
        try:
            model = _get_model()
            vec = model.encode(text, normalize_embeddings=True)
            return vec.tolist()
        except Exception as e:
            logger.error(f"Embedding failed: {e}")
            return None

    @staticmethod
    def cosine_similarity(a: list, b: list) -> float:
        """
        Cosine similarity between two equal-length vectors.
        Returns float in [-1, 1]; higher = more similar.
        """
        if not a or not b or len(a) != len(b):
            return 0.0
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    @staticmethod
    def build_content_text(title: str, overview: str, genres: list) -> str:
        """Build rich text for embedding a movie/show (title + genres + overview)."""
        genre_str = ', '.join(genres) if genres else ''
        parts = [title]
        if genre_str:
            parts.append(f"Genres: {genre_str}")
        if overview:
            parts.append(overview[:300])
        return '. '.join(parts)

    @staticmethod
    def get_or_create_tmdb_embedding(
        tmdb_id: int,
        content_type: str,
        title: str,
        overview: str,
        genres: list,
    ) -> Optional[list]:
        """Get cached embedding for a TMDB item or generate and cache it."""
        cache_key = f"{_CACHE_PREFIX}:{content_type}:{tmdb_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        text = EmbeddingService.build_content_text(title, overview, genres)
        embedding = EmbeddingService.embed_text(text)
        if embedding:
            cache.set(cache_key, embedding, timeout=EMBEDDING_CACHE_TTL)
        return embedding

    @staticmethod
    def rank_by_similarity(
        query_embedding: list,
        items: list,
        tmdb_id_field: str = 'id',
        content_type: str = 'movie',
    ) -> list:
        """
        Re-rank TMDB items by semantic similarity to the query embedding.
        Returns items sorted descending with a 'similarity' field added.
        """
        scored = []
        for item in items:
            tmdb_id = item.get(tmdb_id_field)
            title = item.get('title') or item.get('name', '')
            overview = item.get('overview', '')
            genres = item.get('genres', [])
            if genres and isinstance(genres[0], dict):
                genres = [g.get('name', '') for g in genres]

            item_emb = EmbeddingService.get_or_create_tmdb_embedding(
                tmdb_id, content_type, title, overview, genres
            )
            sim = EmbeddingService.cosine_similarity(query_embedding, item_emb) if item_emb else 0.0
            scored.append({**item, 'similarity': round(sim, 4)})

        scored.sort(key=lambda x: x['similarity'], reverse=True)
        return scored
