# CineRater

> An AI-native movie & TV platform that actually understands your taste — multi-agent recommendations, agentic chat, RAG Q&A on reviews, and semantic search. Built with Django + React.

**Live demo:** [cinerater.vercel.app](https://cinerater.vercel.app) &nbsp;·&nbsp; **Backend:** [Railway](https://cinerater.up.railway.app)

![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-5.0-092E20?style=flat&logo=django&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)

---

## What this actually is

Most movie apps are TMDB wrappers with a star widget. CineRater has a real AI layer — not "we slapped GPT on it", but purpose-built pipelines:

| Feature | What's actually happening under the hood |
|---------|------------------------------------------|
| **Multi-agent recommendations** | 3 specialized agents in sequence: `TasteAnalyst` builds a taste profile from your ratings → `CandidateFinder` queries TMDB with derived preferences → `Ranker` scores each candidate for fit. Not a single prompt. |
| **CineBot — agentic chat** | SSE-streaming chatbot with a tool-calling loop. CineBot calls 4 tools (`search`, `get_ratings`, `add_to_watchlist`, `manage_watchlist`) in sequence, reasons about results, and chains calls — closer to an agent than a chatbot. |
| **RAG Q&A on any title** | User reviews are embedded (sentence-transformers, local) and stored. Ask "is the violence too intense for a 12-year-old?" — the system retrieves the most relevant reviews by cosine similarity and grounds the LLM answer in them. |
| **Semantic search** | Embed the query, embed TMDB results, re-rank by cosine similarity. Search "slow-burn psychological thriller with an unreliable narrator" and get results that match the *feeling*, not just the words. |
| **Mood-based discovery** | Same embedding infrastructure, different entry point — browse by vibe, not genre checkboxes. |
| **MCP server** | 7 tools exposed via Model Context Protocol — connect CineRater directly to Claude Desktop and manage your watchlist, get recommendations, or ask about a film from your AI client. |

---

## Screenshots

**Home — parallax hero, featured film carousel**

![Home](screenshots/home.png)

**Browse — mood discovery + semantic search + genre filter**

![Browse](screenshots/browse.png)

**CineBot — streaming agentic chat with session history**

![CineBot](screenshots/cinebot.png)

**For You — multi-agent personalized recommendations**

![Recommendations](screenshots/recommendations.png)

**Ratings — personal rating history with stats**

![Ratings](screenshots/ratings.png)

**Watchlist**

![Watchlist](screenshots/watchlist.png)

---

## Tech stack

**Backend**
- Django 5.0.1 + Django REST Framework — thin views, all logic in `/services/`
- PostgreSQL — stores ratings, reviews, embeddings; TMDB is source of truth for metadata
- Redis — OTP sessions, rate limiting, future caching layer
- Daphne / ASGI — required for SSE streaming (CineBot)
- `sentence-transformers/all-MiniLM-L6-v2` — local embeddings, no API key needed
- Groq (primary LLM) + Gemini (fallback) — automatic failover

**Frontend**
- React 18 + Vite + Tailwind CSS
- Framer Motion — page transitions, skeleton loaders, 3D card effects
- SSE (Server-Sent Events) — real-time streaming chat without WebSocket complexity

**Infrastructure**
- Railway — backend + PostgreSQL + Redis, single deploy config
- Vercel — frontend

---

## Architecture

```
CineRater/
├── backend/
│   ├── services/                              # All business logic — views are thin
│   │   ├── auth_service.py                    # OTP flow, Redis-backed rate limiting
│   │   ├── tmdb_service.py                    # TMDB as source of truth, connection pooling
│   │   ├── embedding_service.py               # sentence-transformers + cosine similarity
│   │   ├── ai_agent_service.py                # CineBot agentic loop, tool dispatch
│   │   ├── multi_agent_recommendation_service.py   # TasteAnalyst → CandidateFinder → Ranker
│   │   ├── rag_service.py                     # Review retrieval + grounded Q&A
│   │   ├── review_service.py                  # Review CRUD + auto-embedding on write
│   │   └── rating_service.py                  # Score validation, distribution stats
│   ├── movies/                                # DRF views (delegates to services)
│   ├── accounts/                              # Auth endpoints
│   ├── mcp_server/                            # MCP server — 7 tools for Claude Desktop
│   └── cinerate/                              # Django settings, URL routing
└── frontend/
    └── src/
        ├── pages/          # Home, Browse, MovieDetail, Chat, Recommendations, Watchlist, ...
        └── components/     # Navbar, RatingStars, WatchlistButton, skeletons, ...
```

**Key design decisions:**

**TMDB as source of truth** — `Movie`/`TVShow` rows in the DB are lightweight records (just a TMDB ID and a timestamp). All metadata — posters, cast, overview, trailers — is fetched live. This keeps the DB small and data always fresh without a sync job.

**Services pattern** — every view method is 10-15 lines that validate input and call a service. All logic lives in `/services/`. This makes each service independently testable and keeps views readable.

**SSE over WebSockets for chat** — CineBot streams tokens via Server-Sent Events. Simpler infrastructure than WebSockets (no connection upgrade, works on Railway without sticky sessions), and one-directional streaming is all chat needs.

**Local embeddings** — `sentence-transformers/all-MiniLM-L6-v2` runs on-process. No API key, no latency, no cost per embedding. 384-dimensional vectors stored as JSON in PostgreSQL (pgvector incompatibility with PG14 — Python-side cosine similarity instead).

---

## Local setup

**Prerequisites:** Python 3.11+, Node 18+, PostgreSQL, Redis

```bash
# Clone
git clone https://github.com/yourusername/CineRater.git
cd CineRater

# Backend
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env            # fill in the variables below

python manage.py migrate
python manage.py runserver      # or: daphne cinerate.asgi:application (for SSE)

# Frontend — new terminal
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

**`.env` variables:**

```env
SECRET_KEY=your-django-secret-key
DEBUG=True

DATABASE_URL=postgresql://user:password@localhost:5432/cinerater_db
REDIS_URL=redis://localhost:6379

TMDB_API_KEY=         # free — themoviedb.org/settings/api
GROQ_API_KEY=         # free — console.groq.com
GEMINI_API_KEY=       # free — aistudio.google.com (fallback LLM)

EMAIL_HOST_USER=your@gmail.com
EMAIL_HOST_PASSWORD=  # Gmail app password (for OTP emails)
```

> **No OpenAI key needed.** Groq is free and fast. Gemini is the fallback. Embeddings run locally.

---

## API reference

```
# Auth (email OTP, no passwords)
POST   /api/auth/otp/send/                # send 6-digit OTP to email
POST   /api/auth/otp/verify/              # verify OTP → JWT access + refresh tokens

# Content
GET    /api/movies/                       # trending movies (TMDB, region-aware)
GET    /api/tvshows/                      # trending TV shows
GET    /api/content/search/?q=            # title search
GET    /api/content/browse/               # filter by type + genre
POST   /api/content/semantic-search/      # embedding-based search

# Ratings
POST   /api/content/<id>/rate/            # rate 1–10
DELETE /api/content/<id>/rate/delete/     # remove rating
GET    /api/content/<id>/ratings/         # distribution + avg
GET    /api/user/ratings/                 # paginated personal ratings (filter + sort)

# Watchlist
GET    /api/watchlist/                    # your watchlist
POST   /api/watchlist/add/                # add item
DELETE /api/watchlist/<id>/               # remove item

# Reviews + RAG
POST   /api/content/<id>/reviews/         # write a review (auto-embedded)
GET    /api/content/<id>/reviews/         # get reviews
POST   /api/content/<id>/ask/             # ask a question → RAG answer

# AI
POST   /api/chat/                         # CineBot (SSE stream)
GET    /api/chat/sessions/                # chat history
GET    /api/chat/sessions/<id>/messages/  # messages in a session
GET    /api/recommendations/              # multi-agent recommendations
POST   /api/import/imdb/                  # import ratings from IMDB CSV export
```

---

## Auth flow

Email-only, no passwords:

1. `POST /api/auth/otp/send/` — sends a 6-digit OTP to the email (expires 10 min)
2. `POST /api/auth/otp/verify/` — returns `access` + `refresh` JWT tokens
3. Pass `Authorization: Bearer <access>` on all authenticated requests

Rate limiting: 3 sends per 15 min per email, 5 verify attempts per OTP, Redis-backed.

---

## MCP server — Claude Desktop integration

Connect CineRater directly to Claude Desktop:

```json
{
  "mcpServers": {
    "cinerater": {
      "command": "python",
      "args": ["/absolute/path/to/CineRater/backend/mcp_server/server.py"]
    }
  }
}
```

Available tools: `search_content` · `get_recommendations` · `get_user_ratings` · `rate_content` · `add_to_watchlist` · `get_watchlist` · `ask_about_content`

Once connected, you can ask Claude: *"What should I watch tonight based on my CineRater ratings?"* and it will call the pipeline directly.

---

## What's next

- **Taste DNA** — visual taste profile: radar chart across genres/moods, shareable card, generated from the existing `TasteAnalyst` output
- **"Convince Me" mode** — AI argues for or against watching a title using RAG over reviews + TMDB data
- **CineBot memory** — reference past sessions, proactive suggestions after a high rating
- **Test suite** — auth service, rating service, embedding math, view integration tests
- **Rate limiting on AI endpoints** — per-user throttling on chat + recommendations
