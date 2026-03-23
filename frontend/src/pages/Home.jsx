import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'framer-motion';
import { StarIcon, PlayIcon, InformationCircleIcon } from '@heroicons/react/24/solid';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import MovieRow from '../components/MovieRow';
import { getMovies, getTVShows, getRecommendations, getPopularContent } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { backdropUrl, posterUrl, truncate, extractYear } from '../utils/helpers';

const HERO_INTERVAL = 7000; // ms per slide

// ── Hero progress bar ───────────────────────────────────────────────────────
const HeroProgress = ({ active, total, onDotClick, duration }) => (
  <div className="absolute bottom-28 right-10 flex items-center gap-2 z-10">
    {Array.from({ length: total }).map((_, i) => (
      <button
        key={i}
        onClick={() => onDotClick(i)}
        className="relative h-0.5 overflow-hidden rounded-full transition-all duration-300"
        style={{ width: i === active ? 32 : 16, background: 'rgba(255,255,255,0.2)' }}
      >
        {i === active && (
          <motion.div
            key={active}
            className="absolute inset-y-0 left-0 bg-gold rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: duration / 1000, ease: 'linear' }}
          />
        )}
        {i !== active && <div className="absolute inset-0 bg-white/25 rounded-full" />}
      </button>
    ))}
  </div>
);

// ── Floating ambient orbs ───────────────────────────────────────────────────
const FloatingOrb = ({ delay, x, y, size, opacity }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{
      left: `${x}%`,
      top: `${y}%`,
      width: size,
      height: size,
      background: 'radial-gradient(circle, rgba(201,168,76,0.12) 0%, transparent 70%)',
      filter: 'blur(50px)',
    }}
    animate={{ y: [0, -24, 0], opacity: [opacity * 0.5, opacity, opacity * 0.5], scale: [1, 1.12, 1] }}
    transition={{ duration: 7 + delay, delay, repeat: Infinity, ease: 'easeInOut' }}
  />
);

const Home = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const heroRef = useRef(null);

  const [movies, setMovies]               = useState([]);
  const [tvShows, setTvShows]             = useState([]);
  const [recommended, setRecommended]     = useState([]);
  const [heroItems, setHeroItems]         = useState([]);
  const [heroIndex, setHeroIndex]         = useState(0);
  const [heroDirection, setHeroDirection] = useState(1); // 1=forward, -1=back
  const [loadingMovies, setLoadingMovies] = useState(true);
  const [loadingTV, setLoadingTV]         = useState(true);
  const [loadingRec, setLoadingRec]       = useState(true);
  const [showLetterbox, setShowLetterbox] = useState(true);
  const intervalRef = useRef(null);

  // Parallax
  const { scrollY } = useScroll();
  const rawParallax   = useTransform(scrollY, [0, 600], [0, 120]);
  const parallaxY     = useSpring(rawParallax, { stiffness: 60, damping: 20 });
  const backdropScale = useTransform(scrollY, [0, 600], [1.04, 1.12]);
  const heroOpacity   = useTransform(scrollY, [0, 400], [1, 0]);
  const contentY      = useTransform(scrollY, [0, 400], [0, 50]);
  const orbsY         = useTransform(scrollY, [0, 600], [0, 50]);

  // Fetch movies
  useEffect(() => {
    setLoadingMovies(true);
    getMovies('IN')
      .then((res) => {
        const items = res.data?.data || [];
        setMovies(items);
        const withBackdrop = items.filter((m) => m.backdrop_path);
        setHeroItems(withBackdrop.slice(0, 6));
      })
      .catch(() => {})
      .finally(() => setLoadingMovies(false));
  }, []);

  // Fetch TV shows
  useEffect(() => {
    setLoadingTV(true);
    getTVShows('IN')
      .then((res) => setTvShows(res.data?.data || []))
      .catch(() => {})
      .finally(() => setLoadingTV(false));
  }, []);

  // Fetch recommendations / popular
  useEffect(() => {
    setLoadingRec(true);
    const fetch = isAuthenticated ? getRecommendations : () => getPopularContent('IN');
    fetch()
      .then((res) => setRecommended(res.data?.data || []))
      .catch(() => {})
      .finally(() => setLoadingRec(false));
  }, [isAuthenticated]);

  // Letterbox intro
  useEffect(() => {
    const t = setTimeout(() => setShowLetterbox(false), 1800);
    return () => clearTimeout(t);
  }, []);

  // Auto-rotate hero
  const goNext = useCallback(() => {
    setHeroDirection(1);
    setHeroIndex((i) => (i + 1) % heroItems.length);
  }, [heroItems.length]);

  const goPrev = useCallback(() => {
    setHeroDirection(-1);
    setHeroIndex((i) => (i - 1 + heroItems.length) % heroItems.length);
  }, [heroItems.length]);

  const goTo = useCallback((idx) => {
    setHeroDirection(idx > heroIndex ? 1 : -1);
    setHeroIndex(idx);
    // Reset interval
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(goNext, HERO_INTERVAL);
  }, [heroIndex, goNext]);

  useEffect(() => {
    if (heroItems.length < 2) return;
    intervalRef.current = setInterval(goNext, HERO_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [heroItems.length, goNext]);

  const hero = heroItems[heroIndex] || null;
  const heroType = hero?.title ? 'movie' : 'tvshow';

  const variants = {
    enter:  (d) => ({ opacity: 0, x: d > 0 ? 60 : -60 }),
    center: { opacity: 1, x: 0 },
    exit:   (d) => ({ opacity: 0, x: d > 0 ? -60 : 60 }),
  };

  return (
    <div className="min-h-screen bg-void">

      {/* ── Hero ── */}
      <div
        ref={heroRef}
        className="relative w-full overflow-hidden"
        style={{ height: '92vh', minHeight: '600px' }}
      >
        {/* Cinematic letterbox intro */}
        <AnimatePresence>
          {showLetterbox && (
            <>
              <motion.div className="absolute top-0 left-0 right-0 z-30 bg-black"
                initial={{ height: '12%' }} exit={{ height: 0 }}
                transition={{ duration: 0.7, delay: 0.8, ease: [0.76, 0, 0.24, 1] }} />
              <motion.div className="absolute bottom-0 left-0 right-0 z-30 bg-black"
                initial={{ height: '12%' }} exit={{ height: 0 }}
                transition={{ duration: 0.7, delay: 0.8, ease: [0.76, 0, 0.24, 1] }} />
            </>
          )}
        </AnimatePresence>

        {/* Backdrop layer — crossfade between slides */}
        <AnimatePresence mode="sync">
          {hero ? (
            <motion.div
              key={hero.id + '-bg'}
              className="absolute inset-0 w-full h-full"
              style={{ y: parallaxY, scale: backdropScale }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9 }}
            >
              <img
                src={backdropUrl(hero.backdrop_path) || posterUrl(hero.poster_path, 'w780')}
                alt={hero.title || hero.name}
                className="w-full h-full object-cover"
                style={{ filter: 'brightness(0.6)' }}
              />
            </motion.div>
          ) : (
            <div key="bg-skeleton" className="absolute inset-0 skeleton" />
          )}
        </AnimatePresence>

        {/* Ambient orbs */}
        <motion.div className="absolute inset-0 pointer-events-none" style={{ y: orbsY }}>
          <FloatingOrb delay={0}   x={12} y={25} size="380px" opacity={0.5} />
          <FloatingOrb delay={2}   x={72} y={15} size="260px" opacity={0.35} />
          <FloatingOrb delay={1.5} x={50} y={55} size="220px" opacity={0.25} />
        </motion.div>

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-void via-void/60 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-black/25 to-transparent pointer-events-none" />

        {/* Text content — slides in/out */}
        <motion.div
          className="absolute inset-0 flex items-end"
          style={{ opacity: heroOpacity, y: contentY }}
        >
          <div className="px-10 md:px-16 pb-28 w-full max-w-3xl">
            <AnimatePresence mode="wait" custom={heroDirection}>
              {hero && (
                <motion.div
                  key={hero.id + '-text'}
                  custom={heroDirection}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  {/* Label */}
                  <div className="flex items-center gap-2 mb-5">
                    <span className="section-label">Featured Film</span>
                    <motion.span
                      className="h-px bg-gold/40"
                      initial={{ width: 0 }}
                      animate={{ width: 32 }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>

                  {/* Title */}
                  <h1 className="font-display text-5xl md:text-7xl font-semibold text-ink-primary leading-[1.05] tracking-tight mb-4">
                    {hero.title || hero.name}
                  </h1>

                  {/* Meta row */}
                  <div className="flex items-center gap-4 mb-5 flex-wrap">
                    {hero.vote_average && (
                      <div className="flex items-center gap-1.5">
                        <StarIcon className="w-4 h-4 text-gold" />
                        <span className="text-gold text-sm font-semibold">{Number(hero.vote_average).toFixed(1)}</span>
                      </div>
                    )}
                    {(hero.release_date || hero.first_air_date) && (
                      <span className="text-ink-muted text-sm">{extractYear(hero.release_date || hero.first_air_date)}</span>
                    )}
                    {hero.genres?.slice(0, 2).map((g) => (
                      <span key={g} className="text-xs font-medium text-ink-muted bg-white/[0.08] border border-white/[0.1] px-2 py-0.5 rounded-sm">
                        {g}
                      </span>
                    ))}
                  </div>

                  {/* Overview */}
                  <p className="text-ink-secondary text-base leading-relaxed mb-8 max-w-xl">
                    {truncate(hero.overview, 180)}
                  </p>

                  {/* CTAs */}
                  <div className="flex items-center gap-3">
                    <motion.button
                      onClick={() => navigate(`/${heroType}/${hero.id}`)}
                      className="btn-gold"
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <InformationCircleIcon className="w-4 h-4" />
                      View Details
                    </motion.button>
                    <motion.button
                      onClick={() => navigate('/browse')}
                      className="btn-ghost"
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      Browse All
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Progress dots */}
        {heroItems.length > 1 && (
          <HeroProgress
            active={heroIndex}
            total={heroItems.length}
            onDotClick={goTo}
            duration={HERO_INTERVAL}
          />
        )}

        {/* Prev / Next arrows */}
        {heroItems.length > 1 && (
          <>
            <button
              onClick={() => { goPrev(); if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = setInterval(goNext, HERO_INTERVAL); } }}
              className="absolute left-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-sm glass text-ink-secondary hover:text-ink-primary transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
              style={{ opacity: 0.55 }}
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => { goNext(); if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = setInterval(goNext, HERO_INTERVAL); } }}
              className="absolute right-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-sm glass text-ink-secondary hover:text-ink-primary transition-colors"
              style={{ opacity: 0.55 }}
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-void to-transparent pointer-events-none" />
      </div>

      {/* ── Content Rows ── */}
      <div className="-mt-8 relative z-10 pb-20 space-y-4">
        <MovieRow
          title="Trending in India"
          items={movies}
          contentType="movie"
          loading={loadingMovies}
        />
        <MovieRow
          title="Top Series"
          items={tvShows}
          contentType="tvshow"
          loading={loadingTV}
        />
        <MovieRow
          title={isAuthenticated ? 'Recommended for You' : 'Popular Right Now'}
          items={recommended}
          contentType="movie"
          loading={loadingRec}
        />
      </div>
    </div>
  );
};

export default Home;
