"""
Semantic search view.
Fetches TMDB search results then re-ranks them by cosine similarity
to the user's query embedding. Embeddings are cached per TMDB item.

Candidate pool priority:
  1. DB ContentEmbedding table (pre-computed, large pool)
  2. TMDB keyword search results (for exact title matches)
  3. Live popular movies fallback (if both above are empty)
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from rest_framework.throttling import UserRateThrottle
from services.tmdb_service import TMDBService


class AISearchThrottle(UserRateThrottle):
    scope = 'ai_search'
from services.embedding_service import EmbeddingService
from services.rating_service import RatingService
from services.watchlist_service import WatchlistService
from movies.models import ContentEmbedding


class SemanticSearchView(APIView):
    """
    POST /api/content/semantic-search/
    Body: { "query": "nostalgic feel-good movies", "limit": 10 }

    Ranks candidates by embedding cosine similarity.
    Uses pre-computed DB embeddings for broad coverage, merged with
    any exact TMDB keyword hits.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [AISearchThrottle]

    def post(self, request):
        query = request.data.get('query', '').strip()
        limit = min(int(request.data.get('limit', 10)), 20)

        if not query:
            return Response({'error': 'query is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Step 1: Embed the query
        query_embedding = EmbeddingService.embed_text(query)
        if query_embedding is None:
            return Response(
                {'error': 'Failed to embed query. Check your API keys.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Step 2: Build candidate pool
        movies = []
        tvshows = []
        seen_movie_ids = set()
        seen_tv_ids = set()

        # 2a: Pull from pre-computed DB embeddings (large pool, fast)
        db_embeddings = ContentEmbedding.objects.all().order_by('-popularity')
        db_movies = []
        db_tvshows = []
        for ce in db_embeddings:
            item = {
                'id': ce.tmdb_id,
                'title': ce.title,
                'name': ce.title,
                'overview': ce.overview,
                'genres': ce.genres,
                'poster_path': ce.poster_path,
                'popularity': ce.popularity,
                'vote_average': ce.vote_average,
                'release_date': ce.release_date,
                '_db_embedding': ce.embedding,  # already computed, skip re-embed
            }
            if ce.content_type == 'movie':
                db_movies.append(item)
                seen_movie_ids.add(ce.tmdb_id)
            else:
                db_tvshows.append(item)
                seen_tv_ids.add(ce.tmdb_id)

        # 2b: TMDB keyword search — adds exact title matches not in DB
        try:
            tmdb_results = TMDBService.search_content(query, page=1)
            for m in tmdb_results.get('movies', []):
                if m['id'] not in seen_movie_ids:
                    movies.append(m)
                    seen_movie_ids.add(m['id'])
            for t in tmdb_results.get('tvshows', []):
                if t['id'] not in seen_tv_ids:
                    tvshows.append(t)
                    seen_tv_ids.add(t['id'])
        except Exception:
            pass

        # 2c: If DB is empty AND keyword search is empty, fall back to live popular
        if not db_movies and not db_tvshows and len(movies) + len(tvshows) < 3:
            popular_movies = TMDBService.get_popular_movies(page=1) + TMDBService.get_popular_movies(page=2)
            popular_tv = TMDBService.get_popular_tv(page=1) + TMDBService.get_popular_tv(page=2)
            for m in popular_movies:
                if m['id'] not in seen_movie_ids:
                    movies.append(m)
                    seen_movie_ids.add(m['id'])
            for t in popular_tv:
                if t['id'] not in seen_tv_ids:
                    tvshows.append(t)
                    seen_tv_ids.add(t['id'])

        # Step 3: Rank — DB items use stored embeddings, others get embedded on the fly
        def rank_with_db_embeddings(items, content_type):
            scored = []
            for item in items:
                if '_db_embedding' in item:
                    item_emb = item.pop('_db_embedding')
                    sim = EmbeddingService.cosine_similarity(query_embedding, item_emb)
                else:
                    item_emb = EmbeddingService.get_or_create_tmdb_embedding(
                        item.get('id'),
                        content_type,
                        item.get('title') or item.get('name', ''),
                        item.get('overview', ''),
                        item.get('genres', []),
                    )
                    sim = EmbeddingService.cosine_similarity(query_embedding, item_emb) if item_emb else 0.0
                scored.append({**item, 'similarity': round(sim, 4)})
            scored.sort(key=lambda x: x['similarity'], reverse=True)
            return scored

        ranked_movies = rank_with_db_embeddings(db_movies + movies, 'movie')
        ranked_shows = rank_with_db_embeddings(db_tvshows + tvshows, 'tvshow')

        # Step 4: Add content_type markers and merge
        for item in ranked_movies:
            item['content_type'] = 'movie'
        for item in ranked_shows:
            item['content_type'] = 'tvshow'

        combined = ranked_movies + ranked_shows
        combined.sort(key=lambda x: x.get('similarity', 0), reverse=True)

        # Step 5: Enrich with user-specific data
        for item in combined:
            content_id = item.get('id')
            content_type = item.get('content_type', 'movie')
            try:
                user_rating = RatingService.get_user_rating(request.user, content_id, content_type)
                item['user_rating'] = float(user_rating.score) if user_rating else None
                item['in_watchlist'] = WatchlistService.is_in_watchlist(
                    request.user, content_id, content_type
                )
            except Exception:
                item['user_rating'] = None
                item['in_watchlist'] = False

        return Response({
            'success': True,
            'query': query,
            'db_pool_size': len(db_movies) + len(db_tvshows),
            'results': combined[:limit]
        }, status=status.HTTP_200_OK)
