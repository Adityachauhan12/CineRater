"""
RAG Q&A service — answers questions about a movie/show.

Context layers (always combined):
  1. TMDB facts — overview, genres, cast, director/creator, tagline.
     Always present so questions work on day one with zero reviews.
  2. Community reviews — user-written, ranked by cosine similarity to the
     question. Injected when reviews exist, up to TOP_K snippets.

Flow:
  1. Fetch TMDB data + build a "facts" block
  2. Embed the question (sentence-transformers)
  3. Retrieve embedded reviews, rank by similarity, take top-k
  4. Build prompt: facts block + (optional) review block
  5. Call Groq (llama-3.3-70b-versatile) for a grounded answer
  6. Return {answer, sources, review_count, tmdb_used}
"""

import logging
from openai import OpenAI
from decouple import config
from services.embedding_service import EmbeddingService
from services.review_service import ReviewService
from services.tmdb_service import TMDBService

logger = logging.getLogger(__name__)

TOP_K = 5  # max review snippets to inject

try:
    _groq = OpenAI(
        api_key=config('GROQ_API_KEY'),
        base_url="https://api.groq.com/openai/v1",
    )
except Exception:
    _groq = None


def _build_tmdb_context(content_id: int, content_type: str) -> str:
    """
    Fetch TMDB data and return a compact facts block for the prompt.
    Returns empty string if TMDB is unavailable.
    """
    try:
        if content_type == 'tvshow':
            data = TMDBService.get_tv_details(content_id)
        else:
            data = TMDBService.get_movie_details(content_id)
    except Exception:
        return ''

    if not data:
        return ''

    lines = []
    if data.get('tagline'):
        lines.append(f"Tagline: {data['tagline']}")
    if data.get('overview'):
        lines.append(f"Overview: {data['overview'][:500]}")

    genres = data.get('genres', [])
    if genres:
        genre_str = ', '.join(g if isinstance(g, str) else g.get('name', '') for g in genres)
        lines.append(f"Genres: {genre_str}")

    if data.get('director'):
        lines.append(f"Director: {data['director']}")

    creators = data.get('created_by', [])
    if creators:
        lines.append(f"Created by: {', '.join(c.get('name', '') for c in creators)}")

    cast = data.get('cast', [])
    if cast:
        cast_str = ', '.join(
            f"{p.get('name', '')} as {p.get('character', '')}" if p.get('character') else p.get('name', '')
            for p in cast[:6]
        )
        lines.append(f"Cast: {cast_str}")

    release = data.get('release_date') or data.get('first_air_date', '')
    if release:
        lines.append(f"Released: {release[:4]}")

    vote = data.get('vote_average')
    if vote:
        lines.append(f"TMDB audience score: {round(float(vote), 1)}/10")

    return '\n'.join(lines)


def _build_prompt(
    title: str,
    content_type: str,
    question: str,
    tmdb_context: str,
    review_snippets: list[str],
) -> str:
    kind = "TV show" if content_type == "tvshow" else "movie"

    sections = []

    if tmdb_context:
        sections.append(f"--- OFFICIAL INFO (from TMDB) ---\n{tmdb_context}\n--- END OFFICIAL INFO ---")

    if review_snippets:
        block = "\n\n".join(f"Review {i + 1}: {s}" for i, s in enumerate(review_snippets))
        sections.append(f"--- COMMUNITY REVIEWS ---\n{block}\n--- END COMMUNITY REVIEWS ---")

    context = "\n\n".join(sections) if sections else "No additional context available."

    instruction = (
        "You are a helpful film critic assistant for CineRater. "
        f"Answer the user's question about the {kind} \"{title}\" "
        "using the context provided below. "
        "Prefer community reviews for subjective opinions (performances, pacing, feel). "
        "Use the official info for factual questions (plot, cast, genre, release year). "
        "Be concise (2–4 sentences). "
        "If the context doesn't contain enough information to answer confidently, say so briefly."
    )

    return f"{instruction}\n\n{context}\n\nQuestion: {question}"


class RAGService:

    @staticmethod
    def answer(
        content_id: int,
        content_type: str,
        title: str,
        question: str,
    ) -> dict:
        """
        Returns {answer, sources, review_count, tmdb_used}.
        `sources` are the review snippets (truncated) used as context.
        `tmdb_used` is True when TMDB data was injected.
        """
        if not question or not question.strip():
            raise ValueError("Question cannot be empty")

        # 1. TMDB context (always attempted)
        tmdb_context = _build_tmdb_context(content_id, content_type)

        # 2. Embed question + rank reviews
        q_embedding = EmbeddingService.embed_text(question.strip())
        reviews = ReviewService.get_embedded_reviews(content_id, content_type) if q_embedding else []

        top_snippets = []
        if q_embedding and reviews:
            scored = sorted(
                reviews,
                key=lambda r: EmbeddingService.cosine_similarity(q_embedding, r['embedding']),
                reverse=True,
            )
            top_snippets = [r['body'] for r in scored[:TOP_K]]

        # If we have nothing at all, bail early
        if not tmdb_context and not top_snippets:
            return {
                'answer': "No information is available for this title yet.",
                'sources': [],
                'review_count': 0,
                'tmdb_used': False,
            }

        # 3. Build prompt + call Groq
        prompt = _build_prompt(title, content_type, question.strip(), tmdb_context, top_snippets)

        answer_text = "Could not generate an answer. Please try again."
        if _groq:
            try:
                resp = _groq.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.4,
                    max_tokens=300,
                )
                answer_text = resp.choices[0].message.content.strip()
            except Exception as e:
                logger.error(f"RAG Groq call failed: {e}")
                answer_text = "Sorry, I couldn't generate an answer right now."

        return {
            'answer': answer_text,
            'sources': [s[:200] + ('…' if len(s) > 200 else '') for s in top_snippets],
            'review_count': len(reviews),
            'tmdb_used': bool(tmdb_context),
        }
