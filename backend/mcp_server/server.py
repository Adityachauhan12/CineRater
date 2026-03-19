#!/usr/bin/env python3
"""
CineRater MCP Server
Exposes CineRater's movie database and user data as tools for MCP-compatible clients.

Usage:
  python mcp_server/server.py

Claude Desktop config (~/.config/Claude/claude_desktop_config.json on macOS):
  {
    "mcpServers": {
      "cinerater": {
        "command": "python",
        "args": ["/Users/adityachauhan/CineRater/backend/mcp_server/server.py"]
      }
    }
  }
"""

import sys
import os
import asyncio

# Bootstrap Django before importing any models or services
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

# Now safe to import Django-dependent modules
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types
from mcp_server.tools import (
    search_movies_tool,
    get_popular_tool,
    get_movie_details_tool,
    get_user_ratings_tool,
    get_user_watchlist_tool,
    add_to_watchlist_tool,
    get_recommendations_tool,
)

server = Server("cinerater")


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="search_movies",
            description=(
                "Search CineRater's movie and TV show catalog by title, genre, mood, or description. "
                "Returns matching content ranked by semantic similarity. "
                "Examples: 'mind-bending sci-fi', 'Nolan films', 'feel-good 90s comedies'."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query — title, genre, mood, description"},
                    "limit": {"type": "integer", "description": "Max results (default 5)", "default": 5}
                },
                "required": ["query"]
            }
        ),
        types.Tool(
            name="get_popular",
            description="Get currently trending movies and TV shows, optionally filtered by region (IN/US/GLOBAL).",
            inputSchema={
                "type": "object",
                "properties": {
                    "region": {"type": "string", "enum": ["IN", "US", "GLOBAL"], "default": "GLOBAL"},
                    "limit": {"type": "integer", "default": 10}
                }
            }
        ),
        types.Tool(
            name="get_movie_details",
            description="Get full details about a specific movie or TV show using its TMDB ID.",
            inputSchema={
                "type": "object",
                "properties": {
                    "tmdb_id": {"type": "integer", "description": "TMDB ID of the movie/show"},
                    "content_type": {"type": "string", "enum": ["movie", "tvshow"], "default": "movie"}
                },
                "required": ["tmdb_id"]
            }
        ),
        types.Tool(
            name="get_user_ratings",
            description="Get a CineRater user's rating history — what they've watched and scored.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string", "description": "User's email address on CineRater"},
                    "min_score": {"type": "number", "description": "Minimum score filter (1.0–5.0)"},
                    "limit": {"type": "integer", "default": 20}
                },
                "required": ["user_email"]
            }
        ),
        types.Tool(
            name="get_user_watchlist",
            description="Get a CineRater user's watchlist — content they saved to watch later.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string", "description": "User's email address on CineRater"}
                },
                "required": ["user_email"]
            }
        ),
        types.Tool(
            name="add_to_watchlist",
            description="Add a movie or TV show to a CineRater user's watchlist.",
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "content_id": {"type": "integer", "description": "TMDB ID of the content"},
                    "content_type": {"type": "string", "enum": ["movie", "tvshow"]}
                },
                "required": ["user_email", "content_id", "content_type"]
            }
        ),
        types.Tool(
            name="get_recommendations",
            description=(
                "Get personalized movie/show recommendations for a CineRater user. "
                "Analyzes their rating history to infer taste, then finds matching content. "
                "Optionally accepts a mood/preference string to refine suggestions."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_email": {"type": "string"},
                    "mood": {
                        "type": "string",
                        "description": "Optional mood or preference, e.g. 'something funny' or 'intense thriller'"
                    }
                },
                "required": ["user_email"]
            }
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    import json
    handlers = {
        "search_movies": search_movies_tool,
        "get_popular": get_popular_tool,
        "get_movie_details": get_movie_details_tool,
        "get_user_ratings": get_user_ratings_tool,
        "get_user_watchlist": get_user_watchlist_tool,
        "add_to_watchlist": add_to_watchlist_tool,
        "get_recommendations": get_recommendations_tool,
    }

    if name not in handlers:
        result = {"error": f"Unknown tool: {name}"}
    else:
        try:
            result = await handlers[name](arguments)
        except Exception as e:
            result = {"error": str(e)}

    return [types.TextContent(type="text", text=json.dumps(result, indent=2))]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
