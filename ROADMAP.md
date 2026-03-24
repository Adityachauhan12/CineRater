# CineRater — Master Roadmap

## Current Status
| Feature | Status |
|---|---|
| Auth (OTP + JWT) | ✅ Complete |
| Browse + Search (TMDB live) | ✅ Complete |
| Ratings + Watchlist | ✅ Complete |
| Semantic Search (embeddings) | ✅ Complete |
| CineBot (AI Chat + SSE streaming) | ✅ Complete |
| MCP Server (7 tools) | ✅ Built (untested with Claude Desktop) |
| Recommendations UI + Multi-agent pipeline | ✅ Complete |
| Text Reviews + RAG Q&A | ✅ Complete |
| Mood-based Discovery | ✅ Complete |
| Persistent CineBot Chat History | ✅ Complete |
| Google OAuth | ⚠️ Frontend button exists, backend missing |
| WebSockets infrastructure | ⚠️ Django Channels + Redis configured, no consumers |
| User Profiles | ❌ No public profile page |
| Docker / CI | ❌ Not started |

---

## DB Gaps (from audit — 2026-03-23)
| Missing Model | Needed For |
|---|---|
| `Review` | Text reviews + RAG Q&A |
| `ChatSession` + `ChatMessage` | Persistent CineBot history |
| `UserProfile` | Preferences, mood-based discovery, public pages |
| Google OAuth fields on `User` | `google_id`, `avatar_url` |
| `Movie.embedding` / `TVShow.embedding` | Currently NULL — either populate or drop |

---

## Implementation Plan

### Phase 1 — Quick Wins (Low effort, High visual impact)

#### 1.1 Recommendation UI Page
- **What**: Frontend page for `/api/recommendations/` (API already works)
- **DB changes**: None
- **Frontend**: New `Recommendations.jsx` page, route in App.jsx, card grid layout
- **Backend**: None needed
- **Effort**: Small (1 session)

#### 1.2 Google OAuth Backend *(Deferred)*
- Skipped for now — revisit after core features are done

---

### Phase 2 — Core AI Features (Portfolio differentiators)

#### 2.1 Text Reviews + RAG Q&A
- **What**: Users write text reviews. Q&A box on movie detail: "What do people say about this?"
- **DB changes**:
  - New `Review` model: `user`, `content_id`, `content_type`, `text`, `embedding` (JSONField), `created_at`
  - UNIQUE_TOGETHER: `(user, content_id, content_type)`
- **Backend**:
  - `POST /api/reviews/` — create review, auto-embed with existing embedding pipeline
  - `GET /api/reviews/?content_id=&content_type=` — list reviews for content
  - `POST /api/reviews/qa/` — RAG: embed question → cosine similarity over review embeddings → Gemini answers
- **Frontend**: Review form + list on `MovieDetail.jsx`, Q&A box
- **Effort**: Large (2–3 sessions)

#### 2.2 Mood-based Discovery
- **What**: Input box "I want something thrilling and dark" → matches against `ContentEmbedding` corpus (839 rows)
- **DB changes**: None (reuses `ContentEmbedding`)
- **Backend**: `POST /api/content/mood-search/` — embed mood string → cosine similarity → return top N results (same pattern as semantic search)
- **Frontend**: New UI section on Home or Browse page — mood input + result row
- **Effort**: Small–Medium (1 session, reuses existing code heavily)

#### 2.3 Multi-agent Recommendation Pipeline
- **What**: Replace single OpenAI call in `recommendation_service.py` with 3-agent pipeline
  - Agent 1: Analyze user taste profile (from ratings)
  - Agent 2: Search TMDB candidates
  - Agent 3: Rank + explain recommendations
- **DB changes**: None
- **Backend**: Refactor `recommendation_service.py`, use existing agentic loop pattern from `ai_agent_service.py`
- **Effort**: Medium (1–2 sessions)

#### 2.4 Persistent CineBot Chat History
- **What**: Save chat messages so conversations can be resumed
- **DB changes**:
  - `ChatSession`: `id`, `user`, `title` (auto-generated), `created_at`
  - `ChatMessage`: `session`, `role` (`user`/`assistant`), `content`, `created_at`
- **Backend**: Update `chat_views.py` to create/append to session, new `GET /api/chat/sessions/` and `GET /api/chat/sessions/<id>/` endpoints
- **Frontend**: Session list sidebar in `Chat.jsx`, load previous sessions
- **Effort**: Medium (1–2 sessions)

---

### Phase 3 — Social + Profile Features

#### 3.1 User Profile Page
- **What**: Public profile showing a user's ratings, watchlist, review count
- **DB changes**: Optional `UserProfile` model with bio, avatar; or extend `User` model
- **Backend**: `GET /api/accounts/profile/<user_id>/`
- **Frontend**: New `Profile.jsx` page
- **Effort**: Medium (1–2 sessions)

#### 3.2 "Because You Liked X" Personalized Rows
- **What**: Home page rows based on user's top-rated content
- **DB changes**: None
- **Backend**: Use existing recommendation API + embedding similarity
- **Frontend**: Dynamic rows on `Home.jsx`
- **Effort**: Medium (1 session)

#### 3.3 WebSocket Real-time Notifications
- **What**: Live notification bell — alerts when someone rates/reviews the same content
- **DB changes**: `Notification` model: `user`, `type`, `message`, `read`, `created_at`
- **Backend**: Django Channels consumer, send on Rating/Review save signal
- **Frontend**: Notification bell in `Navbar.jsx`, live badge count
- **Effort**: Large (2–3 sessions)

---

### Phase 4 — DevOps & SDE Maturity

#### 4.1 Docker + docker-compose
- **What**: Containerize the full stack
- **Files to create**:
  - `backend/Dockerfile` — Django + Daphne
  - `frontend/Dockerfile` — Vite build + nginx
  - `docker-compose.yml` — Postgres + Redis + backend + frontend
  - `.env.example`
- **Effort**: Medium (1 session)

#### 4.2 GitHub Actions CI Pipeline
- **What**: Lint + test on every push/PR
- **Files**: `.github/workflows/ci.yml`
- **Steps**: flake8 (backend), eslint (frontend), Django test runner, frontend build check
- **Effort**: Small (1 session)

#### 4.3 API Documentation (Swagger)
- **What**: Auto-generated OpenAPI docs at `/api/docs/`
- **Package**: `drf-spectacular`
- **Effort**: Small (1 session)

---

### Phase 5 — Nice to Have

- [ ] Watch history tracking (new `WatchHistory` model)
- [ ] Personalized weekly digest email (Celery beat + Django email)
- [ ] Rate limiting middleware (beyond auth endpoints)
- [ ] MCP server testing + Claude Desktop integration docs
- [ ] `Movie.embedding` / `TVShow.embedding` cleanup (either populate or remove)

---

## Suggested Implementation Order

| # | Feature | Phase | Effort | Why |
|---|---|---|---|---|
| 1 | Recommendation UI Page | 1 | Small | Zero backend work, instant visual win |
| 2 | Mood-based Discovery | 2 | Small | Reuses embeddings, high portfolio value |
| 3 | Text Reviews + RAG Q&A | 2 | Large | Best AI showcase, needs new DB model |
| 4 | Persistent Chat History | 2 | Medium | Makes CineBot production-quality |
| 5 | Multi-agent Recommendations | 2 | Medium | Upgrades existing feature |
| 6 | User Profile Page | 3 | Medium | Social layer |
| 7 | Docker + docker-compose | 4 | Medium | Deployment-ready |
| 8 | GitHub Actions CI | 4 | Small | SDE credibility |
| 9 | WebSocket Notifications | 3 | Large | Real-time feature, high complexity |
| 10 | API Docs (Swagger) | 4 | Small | Professional polish |
| 11 | "Because You Liked X" rows | 3 | Medium | Home page personalization |
| — | Google OAuth Backend | 1 | Medium | Deferred — revisit later |
