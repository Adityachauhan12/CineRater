import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FilmIcon, TvIcon, ChevronLeftIcon, ChevronRightIcon, SparklesIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import MovieCard from '../components/MovieCard';
import { browseContent, semanticSearch } from '../services/api';

const SkeletonCard = () => (
  <div className="rounded-sm overflow-hidden">
    <div className="aspect-[2/3] skeleton rounded-sm" />
    <div className="mt-2 space-y-1.5">
      <div className="h-2.5 skeleton rounded-sm w-4/5" />
      <div className="h-2 skeleton rounded-sm w-2/5" />
    </div>
  </div>
);

const MOOD_SUGGESTIONS = [
  { emoji: '🌑', label: 'dark psychological thriller like Parasite' },
  { emoji: '☀️', label: 'cozy feel-good rainy day' },
  { emoji: '🌀', label: 'mind-bending sci-fi with a twist' },
  { emoji: '💛', label: 'heartwarming coming-of-age story' },
  { emoji: '🔪', label: 'gritty crime drama like The Wire' },
  { emoji: '⚔️', label: 'epic fantasy adventure' },
];

const Browse = () => {
  const [contentType, setContentType]     = useState('movie');
  const [selectedGenre, setSelectedGenre] = useState(0);
  const [genres, setGenres]               = useState([]);
  const [items, setItems]                 = useState([]);
  const [page, setPage]                   = useState(1);
  const [totalPages, setTotalPages]       = useState(1);
  const [loading, setLoading]             = useState(true);

  // Mood discovery state
  const [moodInput, setMoodInput]   = useState('');
  const [moodResults, setMoodResults] = useState([]);
  const [moodLoading, setMoodLoading] = useState(false);
  const [moodMode, setMoodMode]       = useState(false);
  const [moodQuery, setMoodQuery]     = useState('');
  const [moodError, setMoodError]     = useState('');
  const inputRef = useRef(null);

  const fetchBrowse = useCallback((type, genre, pg) => {
    setLoading(true);
    browseContent(type, genre, pg)
      .then((res) => {
        setItems(res.data.results || []);
        setTotalPages(res.data.total_pages || 1);
        // Filter out any blank genre entries from TMDB
        setGenres((res.data.genres || []).filter((g) => g.name));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchBrowse(contentType, selectedGenre, page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [contentType, selectedGenre, page, fetchBrowse]);

  const switchType  = (type) => { setContentType(type); setSelectedGenre(0); setPage(1); };
  const switchGenre = (id)   => { setSelectedGenre(id); setPage(1); };

  const runMoodSearch = useCallback((query) => {
    const q = query.trim();
    if (!q) return;
    setMoodMode(true);
    setMoodQuery(q);
    setMoodLoading(true);
    setMoodError('');
    setMoodResults([]);
    semanticSearch(q, 20)
      .then((res) => setMoodResults(res.data.results || []))
      .catch(() => setMoodError('Search failed — check your API keys or try again.'))
      .finally(() => setMoodLoading(false));
  }, []);

  const handleMoodSubmit = (e) => { e.preventDefault(); runMoodSearch(moodInput); };

  const clearMoodMode = () => {
    setMoodMode(false);
    setMoodInput('');
    setMoodQuery('');
    setMoodResults([]);
    setMoodError('');
  };

  return (
    <div className="min-h-screen bg-void pt-28 pb-20 px-6 md:px-10">

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-12"
      >
        <span className="section-label mb-3 block">Catalogue</span>
        <h1 className="font-display text-5xl font-semibold text-ink-primary tracking-tight">Browse</h1>
      </motion.div>

      {/* ── Mood Discovery Section ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mb-12"
      >
        {/* Section label */}
        <div className="flex items-center gap-2 mb-4">
          <SparklesIcon className="w-4 h-4 text-gold" />
          <span className="text-sm font-medium text-ink-secondary tracking-wide uppercase" style={{ letterSpacing: '0.08em' }}>
            Mood Discovery
          </span>
        </div>

        {/* Search input */}
        <form onSubmit={handleMoodSubmit}>
          <div className="relative flex items-center gap-3 px-5 py-4 rounded-sm border border-white/10 bg-white/[0.03] focus-within:border-gold/50 focus-within:bg-white/[0.05] transition-all duration-250">
            <MagnifyingGlassIcon className="w-5 h-5 text-ink-muted flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={moodInput}
              onChange={(e) => setMoodInput(e.target.value)}
              placeholder="Describe a vibe — dark and psychological, cozy feel-good, epic sci-fi…"
              className="flex-1 bg-transparent text-base text-ink-primary placeholder-ink-muted/60 outline-none"
            />
            <AnimatePresence>
              {moodMode && (
                <motion.button
                  type="button"
                  onClick={clearMoodMode}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  className="p-1.5 rounded-sm hover:bg-white/10 text-ink-muted hover:text-ink-primary transition-colors flex-shrink-0"
                >
                  <XMarkIcon className="w-4 h-4" />
                </motion.button>
              )}
            </AnimatePresence>
            <motion.button
              type="submit"
              whileTap={{ scale: 0.95 }}
              disabled={!moodInput.trim() || moodLoading}
              className="px-5 py-2 bg-gold text-void text-sm font-semibold rounded-sm disabled:opacity-40 hover:bg-gold/90 transition-colors flex-shrink-0"
            >
              {moodLoading ? 'Searching…' : 'Discover'}
            </motion.button>
          </div>
        </form>

        {/* Suggestion chips */}
        <AnimatePresence mode="wait">
          {!moodMode ? (
            <motion.div
              key="chips"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex flex-wrap gap-2 mt-3"
            >
              {MOOD_SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => { setMoodInput(s.label); runMoodSearch(s.label); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ink-secondary border border-white/[0.08] rounded-sm hover:border-gold/40 hover:text-gold hover:bg-gold/[0.05] transition-all duration-150"
                >
                  <span className="text-sm leading-none">{s.emoji}</span>
                  {s.label}
                </motion.button>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="active-mood"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2.5 mt-3"
            >
              <span className="text-xs text-ink-muted">Showing results for</span>
              <span className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-gold/10 text-gold border border-gold/25 rounded-sm">
                <SparklesIcon className="w-3 h-3" />
                {moodQuery}
              </span>
              <button
                onClick={clearMoodMode}
                className="text-xs text-ink-muted hover:text-ink-primary transition-colors"
              >
                ← Back to browse
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Type toggle + Genre pills — hidden in mood mode ── */}
      <AnimatePresence>
        {!moodMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Films / Series toggle */}
            <div className="flex items-center gap-1 p-1 glass rounded-sm w-fit mb-8 relative">
              {[
                { type: 'movie',  label: 'Films',  Icon: FilmIcon },
                { type: 'tvshow', label: 'Series', Icon: TvIcon },
              ].map(({ type, label, Icon }) => (
                <button
                  key={type}
                  onClick={() => switchType(type)}
                  className="relative flex items-center gap-2 px-5 py-2 rounded-sm text-sm font-medium z-10 transition-colors duration-200"
                  style={{ color: contentType === type ? 'var(--color-void, #080808)' : '' }}
                >
                  {contentType === type && (
                    <motion.div
                      layoutId="type-pill"
                      className="absolute inset-0 rounded-sm bg-gold shadow-gold-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      style={{ zIndex: -1 }}
                    />
                  )}
                  <Icon className={`w-4 h-4 transition-colors duration-200 ${contentType === type ? 'text-void' : 'text-ink-secondary'}`} />
                  <span className={contentType === type ? 'text-void' : 'text-ink-secondary hover:text-ink-primary'}>
                    {label}
                  </span>
                </button>
              ))}
            </div>

            {/* Genre pills — "All" explicit + TMDB genres */}
            <div className="flex flex-wrap gap-2 mb-10">
              {/* Explicit "All" pill */}
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                onClick={() => switchGenre(0)}
                className={`relative px-4 py-1.5 rounded-sm text-xs font-medium tracking-wide border transition-colors duration-200 ${
                  selectedGenre === 0
                    ? 'border-gold/50 text-void'
                    : 'border-white/10 text-ink-muted hover:border-white/25 hover:text-ink-secondary'
                }`}
              >
                {selectedGenre === 0 && (
                  <motion.div
                    layoutId="genre-pill"
                    className="absolute inset-0 rounded-sm bg-gold/90"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    style={{ zIndex: -1 }}
                  />
                )}
                All
              </motion.button>

              {genres.map((g, i) => (
                <motion.button
                  key={g.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: (i + 1) * 0.02, duration: 0.2 }}
                  onClick={() => switchGenre(g.id)}
                  className={`relative px-4 py-1.5 rounded-sm text-xs font-medium tracking-wide border transition-colors duration-200 ${
                    selectedGenre === g.id
                      ? 'border-gold/50 text-void'
                      : 'border-white/10 text-ink-muted hover:border-white/25 hover:text-ink-secondary'
                  }`}
                >
                  {selectedGenre === g.id && (
                    <motion.div
                      layoutId="genre-pill"
                      className="absolute inset-0 rounded-sm bg-gold/90"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      style={{ zIndex: -1 }}
                    />
                  )}
                  {g.name}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Grid — mood mode or normal browse ── */}
      <AnimatePresence mode="wait">
        {moodMode ? (
          moodLoading ? (
            <motion.div
              key="mood-skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-5"
            >
              {Array.from({ length: 20 }).map((_, i) => <SkeletonCard key={i} />)}
            </motion.div>
          ) : moodError ? (
            <motion.div
              key="mood-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-32 text-ink-muted"
            >
              <SparklesIcon className="w-8 h-8 mb-4 opacity-40" />
              <p className="text-sm">{moodError}</p>
            </motion.div>
          ) : moodResults.length > 0 ? (
            <motion.div
              key="mood-results"
              initial={{ opacity: 0, filter: 'blur(6px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(6px)' }}
              transition={{ duration: 0.35 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-5"
            >
              {moodResults.map((item, i) => (
                <motion.div
                  key={`${item.content_type}-${item.id}`}
                  initial={{ opacity: 0, y: 20, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.025, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <MovieCard item={item} contentType={item.content_type || 'movie'} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="mood-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-32 text-ink-muted"
            >
              <SparklesIcon className="w-8 h-8 mb-4 opacity-40" />
              <p className="text-sm">No matches found. Try a different vibe.</p>
            </motion.div>
          )
        ) : (
          loading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-5"
            >
              {Array.from({ length: 20 }).map((_, i) => <SkeletonCard key={i} />)}
            </motion.div>
          ) : items.length > 0 ? (
            <motion.div
              key={`${contentType}-${selectedGenre}-${page}`}
              initial={{ opacity: 0, filter: 'blur(6px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(6px)' }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-5"
            >
              {items.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.025, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <MovieCard item={item} contentType={contentType} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-32 text-ink-muted"
            >
              <div className="w-12 h-12 rounded-sm border border-white/10 flex items-center justify-center mb-4">
                <FilmIcon className="w-5 h-5" />
              </div>
              <p className="text-sm">No results for this filter.</p>
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* ── Pagination ── */}
      {!moodMode && totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="flex items-center justify-center gap-4 mt-14"
        >
          <motion.button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-4 py-2 glass rounded-sm text-ink-secondary text-sm font-medium disabled:opacity-25 hover:text-ink-primary transition-colors"
          >
            <ChevronLeftIcon className="w-4 h-4" />
            Previous
          </motion.button>

          <AnimatePresence mode="wait">
            <motion.span
              key={page}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="text-ink-muted text-sm min-w-[60px] text-center"
            >
              <span className="text-ink-primary font-medium">{page}</span>
              <span className="mx-1.5">/</span>
              {totalPages}
            </motion.span>
          </AnimatePresence>

          <motion.button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-4 py-2 glass rounded-sm text-ink-secondary text-sm font-medium disabled:opacity-25 hover:text-ink-primary transition-colors"
          >
            Next
            <ChevronRightIcon className="w-4 h-4" />
          </motion.button>
        </motion.div>
      )}
    </div>
  );
};

export default Browse;
