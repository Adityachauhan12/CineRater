"""
Tool handler functions for the CineRater MCP server.
Each async function receives an arguments dict and returns a serializable dict.

Django ORM is synchronous — all DB calls are wrapped with sync_to_async
so they can be safely awaited inside the async MCP handler.
"""

from asgiref.sync import sync_to_async
from movies.models import Rating, Watchlist
from services.tmdb_service import TMDBService
from services.embedding_service import EmbeddingService
from django.contrib.auth import get_user_model

User = get_user_model()


def _get_user(email: str):
    try:
        return User.objects.get(email=email)
    except User.DoesNotExist:
        return None


async def search_movies_tool(args: dict) -> dict:
    query = args.get("query", "")
    limit = min(args.get("limit", 5), 10)

    try:
        tmdb_results = TMDBService.search_content(query, page=1)
        movies = tmdb_results.get('movies', [])
        tvshows = tmdb_results.get('tvshows', [])

        if len(movies) + len(tvshows) < 3:
            popular_movies = TMDBService.get_popular_movies(page=1) + TMDBService.get_popular_movies(page=2)
            popular_tv = TMDBService.get_popular_tv(page=1) + TMDBService.get_popular_tv(page=2)
            seen = {m['id'] for m in movies}
            for m in popular_movies:
                if m['id'] not in seen:
                    movies.append(m)
                    seen.add(m['id'])
            seen = {t['id'] for t in tvshows}
            for t in popular_tv:
                if t['id'] not in seen:
                    tvshows.append(t)
                    seen.add(t['id'])
    except Exception as e:
        return {"error": f"TMDB search failed: {str(e)}"}

    query_embedding = EmbeddingService.embed_text(query)
    if query_embedding:
        movies = EmbeddingService.rank_by_similarity(query_embedding, movies, content_type='movie')
        tvshows = EmbeddingService.rank_by_similarity(query_embedding, tvshows, content_type='tvshow')

    results = []
    for m in (movies or [])[:limit]:
        results.append({
            "id": m.get('id'),
            "title": m.get('title', ''),
            "type": "movie",
            "overview": (m.get('overview') or '')[:200],
            "year": (m.get('release_date') or '')[:4],
            "tmdb_rating": m.get('vote_average'),
            "similarity": m.get('similarity'),
        })
    for s in (tvshows or [])[:limit]:
        results.append({
            "id": s.get('id'),
            "title": s.get('name') or s.get('title', ''),
            "type": "tvshow",
            "overview": (s.get('overview') or '')[:200],
            "tmdb_rating": s.get('vote_average'),
            "similarity": s.get('similarity'),
        })

    results.sort(key=lambda x: x.get('similarity') or 0, reverse=True)
    return {"query": query, "results": results[:limit], "total": len(results[:limit])}


async def get_popular_tool(args: dict) -> dict:
    region = args.get("region", "GLOBAL")
    limit = min(args.get("limit", 10), 20)
    try:
        movies = TMDBService.get_popular_movies(region=region, page=1)[:limit]
        shows = TMDBService.get_popular_tv(region=region, page=1)[:limit]
    except Exception as e:
        return {"error": str(e)}

    results = []
    for m in movies:
        results.append({
            "id": m.get('id'), "title": m.get('title', ''), "type": "movie",
            "tmdb_rating": m.get('vote_average'), "popularity": m.get('popularity'),
        })
    for s in shows:
        results.append({
            "id": s.get('id'), "title": s.get('name') or s.get('title', ''), "type": "tvshow",
            "tmdb_rating": s.get('vote_average'), "popularity": s.get('popularity'),
        })
    results.sort(key=lambda x: x.get('popularity') or 0, reverse=True)
    return {"region": region, "results": results[:limit]}


async def get_movie_details_tool(args: dict) -> dict:
    tmdb_id = args.get("tmdb_id")
    content_type = args.get("content_type", "movie")
    try:
        if content_type == "movie":
            data = TMDBService.get_movie_details(tmdb_id)
        else:
            data = TMDBService.get_tv_details(tmdb_id)
        return data or {"error": f"{content_type} {tmdb_id} not found"}
    except Exception as e:
        return {"error": str(e)}


async def get_user_ratings_tool(args: dict) -> dict:
    user = await sync_to_async(_get_user)(args.get("user_email", ""))
    if not user:
        return {"error": "User not found. Make sure the email is correct."}

    min_score = args.get("min_score", 0)
    limit = min(args.get("limit", 20), 50)

    ratings = await sync_to_async(list)(
        Rating.objects.filter(user=user, score__gte=min_score).order_by('-created_at')[:limit]
    )
    items = [
        {
            "content_id": r.content_id,
            "content_type": r.content_type,
            "score": float(r.score),
            "rated_at": r.created_at.strftime('%Y-%m-%d'),
        }
        for r in ratings
    ]
    return {"user": args["user_email"], "ratings": items, "total": len(items)}


async def get_user_watchlist_tool(args: dict) -> dict:
    user = await sync_to_async(_get_user)(args.get("user_email", ""))
    if not user:
        return {"error": "User not found. Make sure the email is correct."}

    watchlist = await sync_to_async(list)(
        Watchlist.objects.filter(user=user).order_by('-added_at')
    )
    items = [
        {
            "content_id": w.content_id,
            "content_type": w.content_type,
            "added_at": w.added_at.strftime('%Y-%m-%d'),
        }
        for w in watchlist
    ]
    return {"user": args["user_email"], "watchlist": items, "count": len(items)}


async def add_to_watchlist_tool(args: dict) -> dict:
    user = await sync_to_async(_get_user)(args.get("user_email", ""))
    if not user:
        return {"error": "User not found. Make sure the email is correct."}

    content_id = args.get("content_id")
    content_type = args.get("content_type")
    if not content_id or content_type not in ["movie", "tvshow"]:
        return {"error": "content_id and content_type (movie/tvshow) are required"}

    _, created = await sync_to_async(Watchlist.objects.get_or_create)(
        user=user, content_id=content_id, content_type=content_type
    )
    action = "Added to" if created else "Already in"
    return {"success": True, "message": f"{action} {args['user_email']}'s watchlist (content_id={content_id})"}


async def get_recommendations_tool(args: dict) -> dict:
    user = await sync_to_async(_get_user)(args.get("user_email", ""))
    if not user:
        return {"error": "User not found. Make sure the email is correct."}

    mood = args.get("mood", "")

    top_ratings = await sync_to_async(list)(
        Rating.objects.filter(user=user, score__gte=4.0).order_by('-score')[:30]
    )

    genre_counts = {}
    for r in top_ratings[:10]:
        try:
            if r.content_type == 'movie':
                data = TMDBService.get_movie_details(r.content_id)
            else:
                data = TMDBService.get_tv_details(r.content_id)
            if data:
                for g in data.get('genres', []):
                    name = g if isinstance(g, str) else g.get('name', '')
                    genre_counts[name] = genre_counts.get(name, 0) + 1
        except Exception:
            pass

    top_genres = sorted(genre_counts, key=lambda g: genre_counts[g], reverse=True)[:3]

    watchlist_ids = set(await sync_to_async(list)(
        Watchlist.objects.filter(user=user).values_list('content_id', flat=True)
    ))
    rated_ids = {r.content_id for r in top_ratings}
    exclude_ids = watchlist_ids | rated_ids

    search_query = mood if mood else (f"{' '.join(top_genres)} acclaimed" if top_genres else "popular movies")
    try:
        tmdb_results = TMDBService.search_content(search_query, page=1)
        candidates = tmdb_results.get('movies', []) + tmdb_results.get('tvshows', [])
    except Exception as e:
        return {"error": f"Could not fetch recommendations: {str(e)}"}

    candidates = [c for c in candidates if c.get('id') not in exclude_ids]

    query_embedding = EmbeddingService.embed_text(search_query)
    if query_embedding:
        candidates = EmbeddingService.rank_by_similarity(query_embedding, candidates)

    recs = [
        {
            "id": c.get('id'),
            "title": c.get('title') or c.get('name', ''),
            "type": "movie" if c.get('title') else "tvshow",
            "overview": (c.get('overview') or '')[:150],
            "tmdb_rating": c.get('vote_average'),
        }
        for c in candidates[:8]
    ]
    return {
        "user": args["user_email"],
        "based_on_genres": top_genres,
        "mood_filter": mood or None,
        "recommendations": recs,
    }
