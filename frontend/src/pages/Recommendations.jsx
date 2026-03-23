import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SparklesIcon,
  ArrowPathIcon,
  StarIcon,
  FilmIcon,
  TvIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { getRecommendations } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { posterUrl, extractYear } from '../utils/helpers';
import toast from 'react-hot-toast';

// ─── Skeleton ──────────────────────────────────────────────────────────────────

const CardSkeleton = () => (
  <div className="flex gap-6 p-6 glass rounded-sm">
    <div className="w-[140px] flex-shrink-0 aspect-[2/3] skeleton rounded-sm" />
    <div className="flex-1 space-y-4 py-2">
      <div className="h-4 skeleton rounded-sm w-3/5" />
      <div className="h-3 skeleton rounded-sm w-2/5" />
      <div className="h-px bg-white/[0.04] my-4" />
      <div className="h-3 skeleton rounded-sm w-full" />
      <div className="h-3 skeleton rounded-sm w-5/6" />
      <div className="h-3 skeleton rounded-sm w-4/5" />
    </div>
  </div>
);

// ─── Recommendation Card ───────────────────────────────────────────────────────

const RecCard = ({ item, index, isAI }) => {
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);

  const contentType = item.content_type || 'movie';
  const title = item.title || item.name || 'Unknown';
  const year = extractYear(item.release_date || item.first_air_date);
  const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : null;
  const genres = item.genres || [];
  const reason = item.ai_reason;
  const overview = item.overview;

  const handleClick = () =>
    navigate(contentType === 'movie' ? `/movie/${item.id}` : `/tvshow/${item.id}`);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      className="relative flex gap-6 p-6 glass rounded-sm cursor-pointer group overflow-hidden"
    >
      {/* Gold left accent bar */}
      <motion.div
        className="absolute left-0 top-0 bottom-0 w-[2px] bg-gold origin-top"
        animate={{ scaleY: hovered ? 1 : 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />

      {/* Background glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.4 }}
        style={{
          background:
            'radial-gradient(ellipse at 0% 50%, rgba(201,168,76,0.07) 0%, transparent 65%)',
        }}
      />

      {/* Rank badge */}
      <div className="absolute top-5 right-5">
        <span className="font-display text-2xl font-bold text-white/[0.06] tabular-nums select-none">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      {/* Poster */}
      <div className="relative w-[140px] flex-shrink-0 aspect-[2/3] rounded-sm overflow-hidden bg-elevated shadow-lg">
        {!imgError ? (
          <motion.img
            src={posterUrl(item.poster_path)}
            alt={title}
            loading="lazy"
            onError={() => setImgError(true)}
            animate={{ scale: hovered ? 1.05 : 1 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-muted">
            <FilmIcon className="w-8 h-8 opacity-30" />
          </div>
        )}
        {/* Hover overlay */}
        <motion.div
          className="absolute inset-0 bg-black/30 pointer-events-none"
          animate={{ opacity: hovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        />
        {/* Type pill */}
        <div className="absolute bottom-2 left-2">
          <span className="text-[10px] font-semibold uppercase glass-dark text-ink-secondary px-2 py-1 rounded-sm flex items-center gap-1">
            {contentType === 'tvshow' ? (
              <><TvIcon className="w-3 h-3" /> Series</>
            ) : (
              <><FilmIcon className="w-3 h-3" /> Film</>
            )}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
        <div>
          {/* Title */}
          <h3 className="font-display text-xl font-semibold text-ink-primary leading-snug group-hover:text-gold-light transition-colors duration-200 pr-10">
            {title}
          </h3>

          {/* Year + rating + genres */}
          <div className="flex items-center flex-wrap gap-2 mt-2.5">
            {year && (
              <span className="text-sm text-ink-muted font-medium">{year}</span>
            )}
            {rating && (
              <span className="flex items-center gap-1 text-sm text-gold font-medium">
                <StarSolid className="w-3.5 h-3.5" />
                {rating}
              </span>
            )}
            {genres.slice(0, 3).map((g) => (
              <span
                key={g}
                className="text-xs font-medium text-ink-muted bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 rounded-sm"
              >
                {g}
              </span>
            ))}
          </div>

          {/* Overview */}
          {overview && (
            <p className="mt-3 text-sm text-ink-secondary leading-relaxed line-clamp-3">
              {overview}
            </p>
          )}
        </div>

        <div>
          {/* AI Reason */}
          {isAI && reason && (
            <div className="mt-4 pt-3.5 border-t border-white/[0.07]">
              <div className="flex items-start gap-2">
                <SparklesIcon className="w-3.5 h-3.5 text-gold flex-shrink-0 mt-0.5" />
                <p className="text-sm text-ink-secondary leading-relaxed italic">
                  {reason}
                </p>
              </div>
            </div>
          )}

          {/* CTA */}
          <motion.div
            className="mt-4 flex items-center gap-1.5 text-sm font-medium text-gold/60 group-hover:text-gold transition-colors duration-200"
            animate={{ x: hovered ? 5 : 0 }}
            transition={{ duration: 0.2 }}
          >
            View details
            <ChevronRightIcon className="w-4 h-4" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────────────

const Recommendations = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const fetchRecs = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);

    try {
      const { data: res } = await getRecommendations();
      if (res.success) {
        setData(res);
      } else {
        setError(true);
        toast.error('Could not load recommendations.');
      }
    } catch {
      setError(true);
      toast.error('Failed to fetch recommendations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      navigate('/login');
      return;
    }
    if (isAuthenticated) fetchRecs();
  }, [isAuthenticated, authLoading]);

  const isAI          = data?.type === 'ai';
  const items         = data?.data || [];
  const tasteProfile  = data?.taste_profile || null;

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-void pt-28 px-6 md:px-12 pb-20">
        <div className="max-w-3xl mx-auto">
          <div className="h-4 w-32 skeleton rounded-sm mb-3" />
          <div className="h-12 w-56 skeleton rounded-sm mb-12" />
          <div className="space-y-5">
            {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-sm border border-white/10 flex items-center justify-center mx-auto mb-6">
            <SparklesIcon className="w-6 h-6 text-ink-muted" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-ink-primary mb-2">
            Something went wrong
          </h2>
          <p className="text-ink-muted text-sm mb-8">
            Couldn't load recommendations right now.
          </p>
          <button onClick={() => fetchRecs()} className="btn-gold">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Main ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-void pt-28 px-6 md:px-12 pb-20">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <span className="section-label mb-3 block">Curated for you</span>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-5xl font-semibold text-ink-primary tracking-tight">
                For You
              </h1>
              <p className="text-ink-secondary text-base mt-2.5 max-w-sm">
                {isAI
                  ? 'AI-curated picks based on your taste profile.'
                  : 'Rate a few titles to unlock personalised AI picks.'}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 pb-1">
              {/* AI / Popular badge */}
              <div
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-sm border text-sm font-medium ${
                  isAI
                    ? 'border-gold/30 text-gold bg-gold/[0.06]'
                    : 'border-white/10 text-ink-muted bg-white/[0.04]'
                }`}
              >
                {isAI ? (
                  <><SparklesIcon className="w-4 h-4" /> AI Picks</>
                ) : (
                  <><StarIcon className="w-4 h-4" /> Popular</>
                )}
              </div>

              {/* Refresh */}
              <button
                onClick={() => fetchRecs(true)}
                disabled={refreshing}
                className="w-9 h-9 flex items-center justify-center glass rounded-sm text-ink-muted hover:text-ink-primary transition-colors disabled:opacity-40"
                title="Refresh recommendations"
              >
                <motion.span
                  animate={{ rotate: refreshing ? 360 : 0 }}
                  transition={{ duration: 0.8, repeat: refreshing ? Infinity : 0, ease: 'linear' }}
                >
                  <ArrowPathIcon className="w-4 h-4" />
                </motion.span>
              </button>
            </div>
          </div>

          <div className="mt-7 h-px bg-gradient-to-r from-gold/20 via-gold/5 to-transparent" />
        </motion.div>

        {/* Empty state */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-14 h-14 rounded-sm border border-white/10 flex items-center justify-center mb-6">
              <SparklesIcon className="w-6 h-6 text-ink-muted" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-ink-primary mb-2">
              Nothing to show yet
            </h2>
            <p className="text-ink-muted text-sm mb-8 max-w-xs">
              Start rating films and shows — the AI will learn your taste.
            </p>
            <button onClick={() => navigate('/')} className="btn-gold">
              Discover Content
            </button>
          </div>
        ) : (
          <>
            {/* Taste Profile Card — AI mode only */}
            <AnimatePresence>
              {isAI && tasteProfile && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-8 p-5 rounded-sm border border-gold/20 bg-gold/[0.04]"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <SparklesIcon className="w-4 h-4 text-gold flex-shrink-0" />
                    <span className="text-xs font-semibold tracking-widest text-gold uppercase">Your Taste Profile</span>
                  </div>

                  {tasteProfile.profile_summary && (
                    <p className="text-ink-secondary text-sm leading-relaxed mb-4">
                      {tasteProfile.profile_summary}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-4">
                    {tasteProfile.loved_moods?.length > 0 && (
                      <div>
                        <p className="text-[10px] tracking-widest text-ink-muted uppercase mb-1.5">Moods</p>
                        <div className="flex flex-wrap gap-1.5">
                          {tasteProfile.loved_moods.map(m => (
                            <span key={m} className="text-xs border border-gold/25 text-gold/80 px-2 py-0.5 rounded-sm">{m}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {tasteProfile.loved_themes?.length > 0 && (
                      <div>
                        <p className="text-[10px] tracking-widest text-ink-muted uppercase mb-1.5">Themes</p>
                        <div className="flex flex-wrap gap-1.5">
                          {tasteProfile.loved_themes.map(t => (
                            <span key={t} className="text-xs border border-white/10 text-ink-secondary px-2 py-0.5 rounded-sm">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {tasteProfile.loved_genres?.length > 0 && (
                      <div>
                        <p className="text-[10px] tracking-widest text-ink-muted uppercase mb-1.5">Top Genres</p>
                        <div className="flex flex-wrap gap-1.5">
                          {tasteProfile.loved_genres.map(g => (
                            <span key={g} className="text-xs border border-white/10 text-ink-secondary px-2 py-0.5 rounded-sm">{g}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Popular nudge banner */}
            <AnimatePresence>
              {!isAI && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-6 flex items-start gap-3 px-4 py-3.5 rounded-sm border border-gold/20 bg-gold/[0.04]"
                >
                  <SparklesIcon className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-ink-secondary leading-relaxed">
                    Rate a few films or shows to unlock your personalised AI picks.
                    Showing trending titles for now.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Cards */}
            <div className="space-y-5">
              {items.map((item, i) => (
                <RecCard
                  key={`${item.content_type}-${item.id}`}
                  item={item}
                  index={i}
                  isAI={isAI}
                />
              ))}
            </div>

            {/* Footer note */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-center text-ink-muted text-sm mt-12"
            >
              {isAI
                ? 'Recommendations refresh every 30 min as you rate more content.'
                : 'AI picks unlock after your first few ratings.'}
            </motion.p>
          </>
        )}
      </div>
    </div>
  );
};

export default Recommendations;
