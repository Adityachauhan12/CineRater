"""
Embedding service for semantic search.
Uses OpenAI embeddings with Gemini fallback + Python cosine similarity.
Embeddings are cached in Redis by TMDB content ID to avoid redundant API calls.
"""

import math
import json
import logging
from typing import Optional
from openai import OpenAI
from decouple import config
from django.core.cache import cache
from services.gemini_service import GeminiService

logger = logging.getLogger(__name__)

try:
    client = OpenAI(api_key=config('OPENAI_API_KEY'))
    USE_OPENAI = True
except:
    USE_OPENAI = False

# Circuit breakers — flipped to False on first quota error, stay off until restart
_openai_ok = USE_OPENAI
_gemini_ok = True

EMBEDDING_MODEL = config('EMBEDDING_MODEL', default='text-embedding-3-small')
EMBEDDING_CACHE_TTL = 60 * 60 * 24 * 7  # 7 days — embeddings don't change


class EmbeddingService:

    @staticmethod
    def embed_text(text: str) -> Optional[list[float]]:
        """
        Generate embedding vector for a text string.
        Uses OpenAI first, falls back to Gemini if quota exceeded.
        Circuit breakers prevent repeated calls to quota-exceeded providers.
        Returns list of floats or None on failure.
        """
        global _openai_ok, _gemini_ok

        text = text.strip().replace('\n', ' ')
        if not text:
            return None

        # Try OpenAI
        if _openai_ok:
            try:
                response = client.embeddings.create(input=text, model=EMBEDDING_MODEL)
                return response.data[0].embedding
            except Exception as e:
                if "429" in str(e) or "quota" in str(e).lower() or "insufficient_quota" in str(e):
                    logger.warning("OpenAI embeddings quota exceeded — disabling for this session")
                    _openai_ok = False  # stop trying OpenAI until restart
                else:
                    logger.error(f"OpenAI embedding failed: {e}")
                    return None

        # Fallback to Gemini
        if _gemini_ok:
            try:
                result = GeminiService.embed_text(text)
                return result
            except Exception as e:
                if "429" in str(e) or "quota" in str(e).lower() or "RESOURCE_EXHAUSTED" in str(e):
                    logger.warning("Gemini embeddings quota exceeded — disabling for this session")
                    _gemini_ok = False
                else:
                    logger.error(f"Gemini embedding failed: {e}")

        return None

    @staticmethod
    def cosine_similarity(a: list[float], b: list[float]) -> float:
        """
        Compute cosine similarity between two vectors.
        Returns float in [-1, 1], higher = more similar.
        """
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    @staticmethod
    def build_content_text(title: str, overview: str, genres: list) -> str:
        """
        Build rich text for embedding a movie/show.
        Combines title, genres, and overview for better semantic coverage.
        """
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
        genres: list
    ) -> Optional[list[float]]:
        """
        Get cached embedding for a TMDB item, or generate and cache it.
        Cache key: emb:{content_type}:{tmdb_id}
        """
        cache_key = f"emb:{content_type}:{tmdb_id}"
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
        query_embedding: list[float],
        items: list[dict],
        tmdb_id_field: str = 'id',
        content_type: str = 'movie'
    ) -> list[dict]:
        """
        Re-rank a list of TMDB items by semantic similarity to query.
        Each item must have: id, title, overview, genres fields.
        Returns items sorted by similarity descending, with 'similarity' field added.
        """
        scored = []
        for item in items:
            tmdb_id = item.get(tmdb_id_field)
            title = item.get('title') or item.get('name', '')
            overview = item.get('overview', '')
            genres = item.get('genres', [])
            # genres from TMDB can be list of dicts or list of strings
            if genres and isinstance(genres[0], dict):
                genres = [g.get('name', '') for g in genres]

            item_embedding = EmbeddingService.get_or_create_tmdb_embedding(
                tmdb_id, content_type, title, overview, genres
            )
            if item_embedding:
                sim = EmbeddingService.cosine_similarity(query_embedding, item_embedding)
            else:
                sim = 0.0

            scored.append({**item, 'similarity': round(sim, 4)})

        scored.sort(key=lambda x: x['similarity'], reverse=True)
        return scored
