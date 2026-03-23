import { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import MovieCard from './MovieCard';

const CARD_WIDTH = 152 + 16; // card + gap

const SkeletonCard = () => (
  <div className="flex-shrink-0 rounded-sm overflow-hidden" style={{ width: '152px', minWidth: '152px' }}>
    <div className="aspect-[2/3] skeleton rounded-sm" />
    <div className="mt-2 space-y-1.5 px-0.5">
      <div className="h-2.5 skeleton rounded-sm w-4/5" />
      <div className="h-2 skeleton rounded-sm w-2/5" />
    </div>
  </div>
);

// Wraps each card with a perspective-depth transform based on distance from center
const PerspectiveCard = ({ children, index, scrollLeft, containerWidth }) => {
  const cardCenter = index * CARD_WIDTH + CARD_WIDTH / 2;
  const viewCenter = scrollLeft + containerWidth / 2;
  const distance   = cardCenter - viewCenter;
  const maxDist    = containerWidth / 2 + CARD_WIDTH;

  // Normalise -1..1
  const norm = Math.max(-1, Math.min(1, distance / maxDist));

  const rotateY = norm * 8;            // max ±8° tilt
  const scale   = 1 - Math.abs(norm) * 0.04; // center = 1, edges = 0.96
  const opacity = 1;                          // always full opacity
  const translateZ = -Math.abs(norm) * 10;    // subtle depth only

  return (
    <motion.div
      animate={{ rotateY, scale, opacity, z: translateZ }}
      transition={{ type: 'spring', stiffness: 200, damping: 30 }}
      style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
    >
      {children}
    </motion.div>
  );
};

const MovieRow = ({ title, items = [], contentType = 'movie', loading = false }) => {
  const rowRef       = useRef(null);
  const [scrollLeft, setScrollLeft]         = useState(0);
  const [containerWidth, setContainerWidth] = useState(800);

  // Track scroll position for perspective calculation
  const handleScroll = useCallback(() => {
    if (rowRef.current) setScrollLeft(rowRef.current.scrollLeft);
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    el.addEventListener('scroll', handleScroll, { passive: true });
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    return () => { el.removeEventListener('scroll', handleScroll); ro.disconnect(); };
  }, [handleScroll]);

  const scroll = (dir) => {
    if (!rowRef.current) return;
    rowRef.current.scrollBy({ left: dir === 'left' ? -560 : 560, behavior: 'smooth' });
  };

  return (
    <div className="mb-12">
      {/* Header */}
      <div className="flex items-baseline gap-3 px-6 md:px-10 mb-5">
        <h2 className="font-display text-2xl font-semibold text-ink-primary tracking-tight">{title}</h2>
        <span className="h-px flex-1 bg-white/[0.06] max-w-[60px]" />
      </div>

      {/* Scrollable with 3D perspective container */}
      <div
        className="relative group/row"
        style={{ perspective: '1200px', perspectiveOrigin: '50% 50%' }}
      >
        {/* Left fade + button */}
        <div className="absolute left-0 top-0 bottom-0 z-10 w-16 bg-gradient-to-r from-void to-transparent flex items-center justify-start pl-2 opacity-0 group-hover/row:opacity-100 transition-opacity duration-200 pointer-events-none">
          <button
            onClick={() => scroll('left')}
            className="pointer-events-auto w-8 h-8 flex items-center justify-center glass rounded-sm text-ink-secondary hover:text-gold hover:border-gold/20 transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Cards */}
        <div
          ref={rowRef}
          className="flex gap-4 overflow-x-auto px-6 md:px-10 no-scrollbar pb-2"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
            : items.length > 0
              ? items.map((item, i) => (
                  <PerspectiveCard
                    key={item.id}
                    index={i}
                    scrollLeft={scrollLeft}
                    containerWidth={containerWidth}
                  >
                    <MovieCard item={item} contentType={contentType} />
                  </PerspectiveCard>
                ))
              : <p className="text-ink-muted text-sm py-10">Nothing here yet.</p>
          }
        </div>

        {/* Right fade + button */}
        <div className="absolute right-0 top-0 bottom-0 z-10 w-16 bg-gradient-to-l from-void to-transparent flex items-center justify-end pr-2 opacity-0 group-hover/row:opacity-100 transition-opacity duration-200 pointer-events-none">
          <button
            onClick={() => scroll('right')}
            className="pointer-events-auto w-8 h-8 flex items-center justify-center glass rounded-sm text-ink-secondary hover:text-gold hover:border-gold/20 transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MovieRow;
