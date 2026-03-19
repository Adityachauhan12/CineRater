# CineRater - Movie & TV Show Rating Platform

Production-grade movie and TV show rating and recommendation web app (IMDb + Netflix style).

## Tech Stack

- **Frontend**: React + Tailwind CSS
- **Backend**: Django + Django REST Framework
- **Database**: PostgreSQL (cinerater_db)
- **Cache + OTP**: Redis (127.0.0.1:6379)
- **Real-time**: Django Channels + WebSockets
- **AI**: Gemini 2.5 Flash API
- **MCP**: Filesystem, Git, Postgres, Redis, Fetch servers

## Project Structure

```
CineRater/
├── backend/         # Django project
├── frontend/        # React project (coming soon)
├── docs/            # Architecture docs
└── .aws/amazonq/    # MCP configuration
```

## Phase 1 - COMPLETED ✅

### What's Been Set Up:

1. ✅ Django project initialized inside `/backend`
2. ✅ PostgreSQL connected (cinerater_db)
3. ✅ Custom User model (email-based, no username)
4. ✅ Redis configuration ready
5. ✅ JWT authentication configured
6. ✅ Django Channels + WebSockets ready
7. ✅ CORS configured for React frontend

### Database Models Created:

- **User** (email, location, created_at, last_login)

### Backend Setup Instructions:

```bash
# Navigate to backend
cd backend

# Activate virtual environment
source venv/bin/activate

# Run development server
python manage.py runserver

# Create superuser (optional)
python manage.py createsuperuser
```

### Environment Variables:

Copy `.env.example` to `.env` and fill in:
- EMAIL_HOST_USER (for OTP emails)
- EMAIL_HOST_PASSWORD (Gmail app password)
- GEMINI_API_KEY (for AI recommendations)

### Database Verification:

```bash
# Check PostgreSQL tables
psql -U adityachauhan -d cinerater_db -c "\dt"

# Verify User table
psql -U adityachauhan -d cinerater_db -c "SELECT * FROM users;"
```

## Next Steps (Phase 2):

1. OTP Authentication Flow:
   - POST /api/auth/otp/send/
   - POST /api/auth/otp/verify/
2. Rate limiting implementation
3. AuthService with OOP design pattern
4. Content models (Movie, TVShow, Rating, Watchlist)

## Architecture Principles:

- Services pattern for business logic
- Repository pattern for DB queries
- No business logic in views
- Production-ready error handling
- Environment-based configuration
