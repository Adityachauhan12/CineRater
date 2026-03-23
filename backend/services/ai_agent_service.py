"""
AI Agent service with tool use.
Implements the agentic loop: LLM → decides tool → execute tool → feed result back → repeat.
Uses Groq (llama-3.3-70b-versatile) as primary, Gemini as fallback.
Tools available to the agent:
  - search_movies: semantic search via TMDB + embeddings
  - get_my_ratings: user's rating history
  - get_my_watchlist: user's watchlist
  - add_to_watchlist: save content to watchlist
"""

import json
import re
import logging
from typing import Generator
from openai import OpenAI
from decouple import config
from movies.models import Rating, Watchlist, ContentEmbedding
from services.tmdb_service import TMDBService
from services.embedding_service import EmbeddingService
from services.rating_service import RatingService
from services.watchlist_service import WatchlistService
logger = logging.getLogger(__name__)

# Groq is OpenAI-compatible — just different base_url and model
try:
    client = OpenAI(
        api_key=config('GROQ_API_KEY'),
        base_url="https://api.groq.com/openai/v1",
    )
    USE_OPENAI = True  # Groq uses the same OpenAI SDK path
except:
    USE_OPENAI = False

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_movies",
            "description": (
                "Search for movies and TV shows by title, genre, mood, or description. "
                "Use this when the user asks for recommendations, wants to find specific content, "
                "or asks about movies matching a vibe like 'slow burn thriller' or '90s comedies'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query — title, genre, mood, description, or director name"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_ratings",
            "description": (
                "Get the user's rating history from CineRater — what movies/shows they rated and their scores. "
                "Use this to understand the user's taste or answer questions about what they've watched."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "min_score": {
                        "type": "number",
                        "description": "Filter by minimum rating score (1.0 to 5.0). E.g. 4.0 for highly rated."
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_watchlist",
            "description": "Get the user's current watchlist — content they saved to watch later.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_to_watchlist",
            "description": (
                "Add a movie or TV show to the user's watchlist. "
                "Only call this when the user explicitly asks to save or add something."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "content_id": {
                        "type": "string",
                        "description": "The TMDB ID of the movie or TV show (numeric ID as string)"
                    },
                    "content_type": {
                        "type": "string",
                        "enum": ["movie", "tvshow"],
                        "description": "Whether it's a movie or TV show"
                    },
                    "title": {
                        "type": "string",
                        "description": "Title of the content (for confirmation message)"
                    }
                },
                "required": ["content_id", "content_type", "title"]
            }
        }
    }
]

SYSTEM_PROMPT = """You are CineBot, a friendly and knowledgeable movie and TV show assistant for CineRater.

You help users discover content, understand their viewing taste, and manage their watchlist.
You have access to tools to search movies, check their ratings, and manage their watchlist.

Guidelines:
- Be conversational, warm, and enthusiastic about movies and shows
- When recommending, briefly explain why each pick suits the user (1 sentence each)
- Reference specific titles from search results rather than making up suggestions
- Keep responses concise but engaging — no walls of text
- If asked to add something to watchlist, do it and confirm
- If the user's taste is unclear, check their ratings first before recommending"""


def _execute_tool(tool_name: str, tool_args: dict, user) -> str:
    """Execute a tool and return JSON string result."""
    try:
        if tool_name == "search_movies":
            query = tool_args.get("query", "")
            limit = min(int(tool_args.get("limit", 5)), 10)

            query_embedding = EmbeddingService.embed_text(query)

            # Build candidate pool: DB embeddings first, then TMDB keyword search
            movies = []
            tvshows = []
            seen_movie_ids = set()
            seen_tv_ids = set()

            db_items = ContentEmbedding.objects.all().order_by('-popularity')
            db_movies, db_tvshows = [], []
            for ce in db_items:
                item = {
                    'id': ce.tmdb_id, 'title': ce.title, 'name': ce.title,
                    'overview': ce.overview, 'genres': ce.genres,
                    'vote_average': ce.vote_average, 'release_date': ce.release_date,
                    '_db_embedding': ce.embedding,
                }
                if ce.content_type == 'movie':
                    db_movies.append(item)
                    seen_movie_ids.add(ce.tmdb_id)
                else:
                    db_tvshows.append(item)
                    seen_tv_ids.add(ce.tmdb_id)

            # Add TMDB keyword results (exact title matches)
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

            # Fallback to live popular if DB is empty
            if not db_movies and not db_tvshows and len(movies) + len(tvshows) < 3:
                for m in TMDBService.get_popular_movies(page=1) + TMDBService.get_popular_movies(page=2):
                    if m['id'] not in seen_movie_ids:
                        movies.append(m)
                        seen_movie_ids.add(m['id'])
                for t in TMDBService.get_popular_tv(page=1) + TMDBService.get_popular_tv(page=2):
                    if t['id'] not in seen_tv_ids:
                        tvshows.append(t)
                        seen_tv_ids.add(t['id'])

            # Rank — DB items use stored embeddings, others get embedded on the fly
            def _rank(items, content_type):
                scored = []
                for item in items:
                    if query_embedding:
                        if '_db_embedding' in item:
                            item_emb = item.pop('_db_embedding')
                        else:
                            item_emb = EmbeddingService.get_or_create_tmdb_embedding(
                                item.get('id'), content_type,
                                item.get('title') or item.get('name', ''),
                                item.get('overview', ''), item.get('genres', []),
                            )
                        sim = EmbeddingService.cosine_similarity(query_embedding, item_emb) if item_emb else 0.0
                    else:
                        sim = 0.0
                    scored.append({**item, 'similarity': round(sim, 4)})
                scored.sort(key=lambda x: x['similarity'], reverse=True)
                return scored

            movies = _rank(db_movies + movies, 'movie')
            tvshows = _rank(db_tvshows + tvshows, 'tvshow')

            results = []
            for m in (movies or [])[:limit]:
                results.append({
                    "id": m.get('id'),
                    "title": m.get('title', ''),
                    "type": "movie",
                    "genres": m.get('genres', []),
                    "overview": (m.get('overview') or '')[:150],
                    "year": m.get('release_year') or m.get('release_date', '')[:4],
                    "tmdb_rating": m.get('vote_average'),
                })
            for s in (tvshows or [])[:limit]:
                results.append({
                    "id": s.get('id'),
                    "title": s.get('name') or s.get('title', ''),
                    "type": "tvshow",
                    "genres": s.get('genres', []),
                    "overview": (s.get('overview') or '')[:150],
                    "tmdb_rating": s.get('vote_average'),
                })

            # Sort combined by similarity if available
            if query_embedding:
                results.sort(key=lambda x: x.get('similarity', 0), reverse=True)

            return json.dumps({"results": results[:limit], "count": len(results[:limit])})

        elif tool_name == "get_my_ratings":
            min_score = float(tool_args.get("min_score", 0))
            limit = int(tool_args.get("limit", 10))
            ratings = (
                Rating.objects
                .filter(user=user, score__gte=min_score)
                .order_by('-created_at')[:limit]
            )
            items = []
            for r in ratings:
                items.append({
                    "content_id": r.content_id,
                    "content_type": r.content_type,
                    "score": float(r.score),
                    "rated_at": r.created_at.strftime('%Y-%m-%d'),
                })
            return json.dumps({"ratings": items, "total": len(items)})

        elif tool_name == "get_my_watchlist":
            watchlist = Watchlist.objects.filter(user=user).order_by('-added_at')
            items = []
            for w in watchlist:
                items.append({
                    "content_id": w.content_id,
                    "content_type": w.content_type,
                    "added_at": w.added_at.strftime('%Y-%m-%d'),
                })
            return json.dumps({"watchlist": items, "count": len(items)})

        elif tool_name == "add_to_watchlist":
            content_id = int(tool_args.get("content_id")) if tool_args.get("content_id") else None
            content_type = tool_args.get("content_type")
            title = tool_args.get("title", f"{content_type} #{content_id}")
            if not content_id or content_type not in ["movie", "tvshow"]:
                return json.dumps({"success": False, "error": "Invalid parameters"})
            _, created = Watchlist.objects.get_or_create(
                user=user, content_id=content_id, content_type=content_type
            )
            msg = f"Added '{title}' to your watchlist" if created else f"'{title}' is already in your watchlist"
            return json.dumps({"success": True, "message": msg})

        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    except Exception as e:
        logger.error(f"Tool execution error [{tool_name}]: {e}")
        return json.dumps({"error": str(e)})


def run_agent_stream(messages: list, user) -> Generator[str, None, None]:
    """
    Agentic loop with SSE streaming output using Groq.
    Yields SSE-formatted strings (data: <json>\\n\\n).

    Flow:
      1. Call LLM with tools
      2. If LLM returns tool calls → execute them, add results, repeat
      3. If LLM returns text → stream it out and stop
    """
    conversation = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

    try:
        yield from _run_openai_agent(conversation, user)
    except Exception as e:
        logger.error(f"Agent failed: {e}")
        yield f"data: {json.dumps({'type': 'text', 'content': 'I ran into a problem. Please try again.'})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"


def _rescue_tool_call(error_str: str, conversation: list, user):
    """
    When Groq returns tool_use_failed, it includes the malformed generation in the error.
    Parse it, execute the tool for real, inject results, and get a proper final response.
    Returns a generator or None if parsing fails.
    """
    # Parse Llama's malformed tool call format — either:
    #   <function=tool_name {"arg": "val"}</function>   (old format)
    #   <function(tool_name){"arg": "val"}</function>   (newer Llama format)
    match = re.search(r'<function[=(](\w+)\)?\s*(\{.*?\})\s*</function>', error_str, re.DOTALL)
    if not match:
        logger.warning("Could not parse malformed tool call from error")
        return None

    tool_name = match.group(1)
    try:
        tool_args = json.loads(match.group(2))
    except json.JSONDecodeError:
        return None

    logger.info(f"Rescued malformed tool call: {tool_name}({tool_args})")

    def _rescued_stream():
        # Execute the tool and stream the result event
        yield f"data: {json.dumps({'type': 'tool_call', 'tool': tool_name, 'args': tool_args})}\n\n"
        result_str = _execute_tool(tool_name, tool_args, user)
        result_data = json.loads(result_str)
        yield f"data: {json.dumps({'type': 'tool_result', 'tool': tool_name, 'result': result_data})}\n\n"

        # Inject results as context and get final response without tools
        augmented = [m if isinstance(m, dict) else {"role": m.role, "content": m.content or ""} for m in conversation]
        augmented.append({
            "role": "user",
            "content": f"[Tool result from {tool_name}: {result_str}]\n\nPlease answer based on these results."
        })
        try:
            resp = client.chat.completions.create(
                model=config('GROQ_MODEL', default='llama-3.3-70b-versatile'),
                messages=augmented,
            )
            yield from _stream_text(resp.choices[0].message.content or "Here are the results above.")
        except Exception as ex:
            logger.error(f"Rescue final response failed: {ex}")
            yield from _stream_text("I found some results — check the tool output above!")

    return _rescued_stream()


def _run_openai_agent(conversation: list, user) -> Generator[str, None, None]:
    """Run agent with OpenAI (full tool calling support)"""
    max_iterations = 5
    iteration = 0

    while iteration < max_iterations:
        iteration += 1

        try:
            response = client.chat.completions.create(
                model=config('GROQ_MODEL', default='llama-3.3-70b-versatile'),
                messages=conversation,
                tools=TOOLS,
                tool_choice="auto",
            )
        except Exception as e:
            if "tool_use_failed" in str(e) or (hasattr(e, 'status_code') and e.status_code == 400):
                # Llama generated malformed XML-style tool call — parse and rescue it
                rescued = _rescue_tool_call(str(e), conversation, user)
                if rescued is not None:
                    yield from rescued
                else:
                    yield from _stream_text("I had trouble with that. Please try rephrasing your question.")
                return
            raise  # re-raise 429 etc so outer handler can fall back to Gemini

        msg = response.choices[0].message

        # Tool calls — execute and continue loop
        if msg.tool_calls:
            conversation.append(msg)

            for tool_call in msg.tool_calls:
                tool_name = tool_call.function.name
                try:
                    tool_args = json.loads(tool_call.function.arguments)
                except json.JSONDecodeError:
                    tool_args = {}

                # Notify frontend: tool is being called
                yield f"data: {json.dumps({'type': 'tool_call', 'tool': tool_name, 'args': tool_args})}\n\n"

                result_str = _execute_tool(tool_name, tool_args, user)
                result_data = json.loads(result_str)

                # Notify frontend: tool result
                yield f"data: {json.dumps({'type': 'tool_result', 'tool': tool_name, 'result': result_data})}\n\n"

                conversation.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result_str,
                })

            continue  # go back to LLM with tool results

        # Final text response — but check if Llama smuggled a tool call in as plain text
        final_text = msg.content or ""
        if '<function' in final_text:
            rescued = _rescue_tool_call(final_text, conversation, user)
            if rescued is not None:
                yield from rescued
                return
        yield from _stream_text(final_text)
        return

    # Fallback if we hit max iterations
    yield f"data: {json.dumps({'type': 'text', 'content': 'Sorry, I ran into an issue. Please try again.'})}\n\n"
    yield f"data: {json.dumps({'type': 'done'})}\n\n"



def _stream_text(text: str) -> Generator[str, None, None]:
    """Stream text in chunks"""
    chunk_size = 30
    for i in range(0, len(text), chunk_size):
        chunk = text[i:i + chunk_size]
        yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"
    yield f"data: {json.dumps({'type': 'done'})}\n\n"
