import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeftIcon, ClockIcon, CalendarIcon, TrashIcon,
  SparklesIcon, PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import { getMovieDetail, getTVShowDetail, getReviews, submitReview, deleteReview, askQuestion } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { backdropUrl, posterUrl, formatRuntime, extractYear } from '../utils/helpers';
import RatingStars from '../components/RatingStars';
import WatchlistButton from '../components/WatchlistButton';

const MovieDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const isTVShow   = location.pathname.startsWith('/tvshow/');
  const contentType = isTVShow ? 'tvshow' : 'movie';

  const [movie, setMovie]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [posterFlipped, setPosterFlipped] = useState(false);

  // Reviews
  const [reviews, setReviews] = useState([]);
  const [reviewBody, setReviewBody] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState(null);

  // RAG Q&A
  const [question, setQuestion] = useState('');
  const [ragAnswer, setRagAnswer] = useState(null);   // {answer, sources, review_count}
  const [ragLoading, setRagLoading] = useState(false);
  const [ragError, setRagError] = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    (isTVShow ? getTVShowDetail(id) : getMovieDetail(id))
      .then(({ data }) => setMovie(data.data))
      .catch(() => setError(isTVShow ? 'TV show not found.' : 'Movie not found.'))
      .finally(() => setLoading(false));
  }, [id, isTVShow]);

  // Load reviews whenever id/contentType changes
  useEffect(() => {
    getReviews(id, contentType)
      .then(({ data }) => setReviews(data.data || []))
      .catch(() => {});
  }, [id, contentType]);

  const handleSubmitReview = async () => {
    if (!reviewBody.trim()) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const { data } = await submitReview(id, contentType, reviewBody.trim());
      if (data.success) {
        setReviewBody('');
        // refresh list
        const { data: fresh } = await getReviews(id, contentType);
        setReviews(fresh.data || []);
      }
    } catch (e) {
      setReviewError(e.response?.data?.error || 'Failed to submit review.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    try {
      await deleteReview(id, reviewId);
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } catch {
      // silent
    }
  };

  const handleAsk = async () => {
    if (!question.trim()) return;
    setRagLoading(true);
    setRagAnswer(null);
    setRagError(null);
    try {
      const { data } = await askQuestion(id, contentType, movie?.title || movie?.name || 'this title', question.trim());
      if (data.success) {
        setRagAnswer(data);
      } else {
        setRagError(data.error || 'Something went wrong.');
      }
    } catch {
      setRagError('Could not reach the server.');
    } finally {
      setRagLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-void">
        <div className="w-full skeleton" style={{ height: '60vh' }} />
        <div className="max-w-5xl mx-auto px-6 py-10 space-y-4">
          <div className="h-10 skeleton rounded-sm w-1/2" />
          <div className="h-4 skeleton rounded-sm w-1/4" />
          <div className="h-24 skeleton rounded-sm" />
        </div>
      </div>
    );
  }

  if (error || !movie) {
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center gap-4">
        <p className="text-ink-muted">{error || 'Unable to load.'}</p>
        <button onClick={() => navigate('/')} className="text-gold text-sm hover:text-gold-light transition-colors">
          Back to Home
        </button>
      </div>
    );
  }

  const {
    title: rawTitle, name, overview, backdrop_path, poster_path,
    vote_average, vote_count, release_date: rawRelease, first_air_date,
    runtime, genres = [], user_rating, in_watchlist, watchlist_id,
    cast = [], director, created_by = [], tagline,
  } = movie;

  const title        = rawTitle || name;
  const release_date = rawRelease || first_air_date;
  const bgImage      = backdropUrl(backdrop_path) || posterUrl(poster_path, 'w780');

  return (
    <div className="min-h-screen bg-void">

      {/* ── Hero backdrop ── */}
      <div className="relative w-full overflow-hidden" style={{ height: '65vh', minHeight: '480px' }}>
        <motion.img
          initial={{ scale: 1.04, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8 }}
          src={bgImage}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'brightness(0.45)' }}
        />
        {/* Gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-void via-void/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent" />

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-24 left-6 md:left-10 flex items-center gap-2 glass rounded-sm px-3 py-1.5 text-ink-secondary hover:text-ink-primary text-sm transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>
      </div>

      {/* ── Content ── */}
      <div className="max-w-5xl mx-auto px-6 md:px-10 -mt-32 relative z-10 pb-24">
        <div className="flex gap-8 items-start">

          {/* 3D Flip Poster */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="hidden md:block flex-shrink-0 cursor-pointer"
            style={{ perspective: '900px', width: '176px' }}
            onClick={() => setPosterFlipped((f) => !f)}
            title="Click to flip"
          >
            <motion.div
              animate={{ rotateY: posterFlipped ? 180 : 0 }}
              transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
              style={{ transformStyle: 'preserve-3d', position: 'relative', width: '176px' }}
            >
              {/* FRONT — poster image */}
              <div
                style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                className="rounded-sm shadow-deep border border-white/[0.08] overflow-hidden"
              >
                <img
                  src={posterUrl(poster_path)}
                  alt={title}
                  className="w-full"
                />
                {/* Flip hint */}
                <div className="absolute bottom-2 right-2 text-[9px] text-white/40 bg-black/40 px-1.5 py-0.5 rounded-sm pointer-events-none">
                  tap to flip
                </div>
              </div>

              {/* BACK — stats */}
              <div
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  position: 'absolute',
                  inset: 0,
                }}
                className="rounded-sm border border-gold/20 bg-elevated shadow-deep flex flex-col justify-center p-4 gap-3"
              >
                {/* Rating */}
                {vote_average && (
                  <div className="text-center">
                    <div className="text-gold font-display text-3xl font-semibold">
                      {Number(vote_average).toFixed(1)}
                    </div>
                    <div className="text-ink-muted text-[10px] mt-0.5 tracking-widest uppercase">TMDB Score</div>
                    {user_rating && (
                      <div className="mt-2 text-xs text-ink-secondary">
                        Your rating: <span className="text-gold font-medium">{user_rating}/10</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="h-px bg-white/[0.06]" />

                {/* Top cast */}
                {cast.slice(0, 3).map((p) => (
                  <div key={p.id} className="text-xs text-ink-muted truncate">
                    <span className="text-ink-secondary">{p.name}</span>
                    {p.character && <span className="ml-1 opacity-60">as {p.character}</span>}
                  </div>
                ))}

                {/* Genres */}
                {genres.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {genres.slice(0, 3).map((g) => (
                      <span key={g.id || g} className="text-[9px] border border-white/10 text-ink-muted px-1.5 py-0.5 rounded-sm">
                        {g.name || g}
                      </span>
                    ))}
                  </div>
                )}

                <div className="text-[9px] text-white/30 text-center mt-auto">tap to flip back</div>
              </div>
            </motion.div>
          </motion.div>

          {/* Details */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex-1 min-w-0"
          >
            {/* Title */}
            <h1 className="font-display text-5xl md:text-6xl font-semibold text-ink-primary leading-tight tracking-tight mb-3">
              {title}
            </h1>

            {/* Tagline */}
            {tagline && (
              <p className="font-display text-lg italic text-ink-muted mb-4 leading-snug">
                "{tagline}"
              </p>
            )}

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 mb-5">
              {vote_average && (
                <div className="flex items-center gap-1.5 bg-gold/10 border border-gold/25 px-3 py-1 rounded-sm">
                  <StarIcon className="w-3.5 h-3.5 text-gold" />
                  <span className="text-gold text-sm font-medium">{Number(vote_average).toFixed(1)}</span>
                  {vote_count && (
                    <span className="text-ink-muted text-xs ml-1">({vote_count.toLocaleString()})</span>
                  )}
                </div>
              )}
              {release_date && (
                <div className="flex items-center gap-1.5 text-ink-muted text-sm">
                  <CalendarIcon className="w-4 h-4" />
                  {extractYear(release_date)}
                </div>
              )}
              {runtime && (
                <div className="flex items-center gap-1.5 text-ink-muted text-sm">
                  <ClockIcon className="w-4 h-4" />
                  {formatRuntime(runtime)}
                </div>
              )}
            </div>

            {/* Genres */}
            {genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {genres.map((g) => (
                  <span
                    key={g.id || g}
                    className="border border-white/10 text-ink-muted text-xs px-3 py-1 rounded-sm"
                  >
                    {g.name || g}
                  </span>
                ))}
              </div>
            )}

            {/* Overview */}
            {overview && (
              <p className="text-ink-secondary text-sm leading-relaxed mb-6 max-w-2xl">
                {overview}
              </p>
            )}

            {/* Director */}
            {(director || created_by.length > 0) && (
              <p className="text-sm text-ink-muted mb-6">
                <span className="text-ink-muted">{director ? 'Director' : 'Created by'} </span>
                <span className="text-ink-secondary font-medium">
                  {director || created_by.map((c) => c.name).join(', ')}
                </span>
              </p>
            )}

            {/* Divider */}
            <div className="h-px bg-white/[0.06] mb-6" />

            {/* Rating */}
            <div className="mb-5">
              <p className="section-label mb-3">
                {isAuthenticated ? 'Your Rating' : 'Sign in to rate'}
              </p>
              <RatingStars
                contentId={id}
                contentType={contentType}
                initialRating={user_rating ?? null}
                readonly={!isAuthenticated}
                onRated={(score) => setMovie((m) => ({ ...m, user_rating: score }))}
              />
            </div>

            {/* Watchlist */}
            <WatchlistButton
              contentId={id}
              contentType={contentType}
              inWatchlist={in_watchlist}
              watchlistId={watchlist_id}
            />
          </motion.div>
        </div>

        {/* ── Cast ── */}
        {cast.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-14"
          >
            <div className="flex items-baseline gap-3 mb-6">
              <h2 className="font-display text-2xl font-semibold text-ink-primary">Cast</h2>
              <span className="h-px flex-1 bg-white/[0.06] max-w-[60px]" />
            </div>

            <div className="flex gap-4 overflow-x-auto pb-3 no-scrollbar">
              {cast.map((person, i) => (
                <motion.div
                  key={person.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.04 }}
                  className="flex-shrink-0 w-24 text-center group"
                >
                  <div className="w-24 h-32 rounded-sm overflow-hidden bg-elevated mb-2 border border-white/[0.06] group-hover:border-gold/20 transition-colors">
                    {person.profile_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                        alt={person.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-ink-muted text-2xl">
                        ◻
                      </div>
                    )}
                  </div>
                  <p className="text-ink-secondary text-xs font-medium leading-tight truncate">{person.name}</p>
                  {person.character && (
                    <p className="text-ink-muted text-[10px] truncate mt-0.5">{person.character}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Reviews ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="mt-14 max-w-5xl mx-auto px-6 md:px-10"
      >
        <div className="flex items-baseline gap-3 mb-6">
          <h2 className="font-display text-2xl font-semibold text-ink-primary">Reviews</h2>
          <span className="h-px flex-1 bg-white/[0.06] max-w-[60px]" />
          {reviews.length > 0 && (
            <span className="text-ink-muted text-sm">{reviews.length}</span>
          )}
        </div>

        {/* Write review form — auth only */}
        {isAuthenticated && (
          <div className="mb-8">
            <textarea
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
              placeholder="Share your thoughts…"
              rows={3}
              maxLength={4000}
              className="w-full bg-elevated border border-white/[0.08] rounded-sm px-4 py-3 text-sm text-ink-secondary placeholder:text-ink-muted resize-none focus:outline-none focus:border-gold/30 transition-colors"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-ink-muted text-xs">{reviewBody.length}/4000</span>
              <div className="flex items-center gap-3">
                {reviewError && <span className="text-red-400 text-xs">{reviewError}</span>}
                <button
                  onClick={handleSubmitReview}
                  disabled={reviewSubmitting || !reviewBody.trim()}
                  className="px-4 py-1.5 bg-gold/10 border border-gold/30 text-gold text-sm rounded-sm hover:bg-gold/20 disabled:opacity-40 transition-colors"
                >
                  {reviewSubmitting ? 'Posting…' : 'Post Review'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Review list */}
        {reviews.length === 0 ? (
          <p className="text-ink-muted text-sm">No reviews yet. Be the first!</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-elevated border border-white/[0.06] rounded-sm px-5 py-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-ink-secondary text-sm font-medium">{r.user}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-ink-muted text-xs">
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {isAuthenticated && (
                      <button
                        onClick={() => handleDeleteReview(r.id)}
                        className="text-ink-muted hover:text-red-400 transition-colors"
                        title="Delete review"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-ink-secondary text-sm leading-relaxed whitespace-pre-wrap">{r.body}</p>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ── RAG Q&A ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.7 }}
        className="mt-14 mb-24 max-w-5xl mx-auto px-6 md:px-10"
      >
        <div className="flex items-baseline gap-3 mb-6">
          <SparklesIcon className="w-5 h-5 text-gold flex-shrink-0" />
          <h2 className="font-display text-2xl font-semibold text-ink-primary">Ask the Reviews</h2>
        </div>
        <p className="text-ink-muted text-sm mb-4">
          Ask anything about this title — CineRater answers using community reviews as context.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !ragLoading && handleAsk()}
            placeholder="e.g. Is it worth watching for the performances?"
            className="flex-1 bg-elevated border border-white/[0.08] rounded-sm px-4 py-2.5 text-sm text-ink-secondary placeholder:text-ink-muted focus:outline-none focus:border-gold/30 transition-colors"
          />
          <button
            onClick={handleAsk}
            disabled={ragLoading || !question.trim()}
            className="px-4 py-2.5 bg-gold/10 border border-gold/30 text-gold rounded-sm hover:bg-gold/20 disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            {ragLoading
              ? <span className="text-sm">Thinking…</span>
              : <><PaperAirplaneIcon className="w-4 h-4" /><span className="text-sm">Ask</span></>
            }
          </button>
        </div>

        <AnimatePresence>
          {ragError && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-3 text-red-400 text-sm"
            >
              {ragError}
            </motion.p>
          )}
          {ragAnswer && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 bg-elevated border border-gold/15 rounded-sm px-5 py-4"
            >
              <p className="text-ink-secondary text-sm leading-relaxed mb-3">{ragAnswer.answer}</p>

              {/* Source attribution footer */}
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {ragAnswer.tmdb_used && (
                  <span className="text-[10px] border border-white/10 text-ink-muted px-2 py-0.5 rounded-sm">
                    TMDB data
                  </span>
                )}
                {ragAnswer.review_count > 0 && (
                  <span className="text-[10px] border border-white/10 text-ink-muted px-2 py-0.5 rounded-sm">
                    {ragAnswer.review_count} community review{ragAnswer.review_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {ragAnswer.sources?.length > 0 && (
                <details className="group mt-2">
                  <summary className="text-ink-muted text-xs cursor-pointer select-none hover:text-ink-secondary transition-colors">
                    show review sources
                  </summary>
                  <div className="mt-2 space-y-2">
                    {ragAnswer.sources.map((s, i) => (
                      <p key={i} className="text-ink-muted text-xs border-l-2 border-gold/20 pl-3 italic">
                        {s}
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

    </div>
  );
};

export default MovieDetail;
