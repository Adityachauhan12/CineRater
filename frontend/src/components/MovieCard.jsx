import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { StarIcon } from '@heroicons/react/24/solid';
import { posterUrl, truncate, extractYear } from '../utils/helpers';
import WatchlistButton from './WatchlistButton';

const MovieCard = ({ item, contentType = 'movie' }) => {
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef(null);

  // 3D tilt motion values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [8, -8]), {
    stiffness: 300, damping: 30,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-8, 8]), {
    stiffness: 300, damping: 30,
  });

  // Shine radial gradient follows mouse
  const shineX = useTransform(mouseX, [-0.5, 0.5], ['20%', '80%']);
  const shineY = useTransform(mouseY, [-0.5, 0.5], ['20%', '80%']);
  const shineBackground = useTransform(
    [shineX, shineY],
    ([x, y]) => `radial-gradient(circle at ${x} ${y}, rgba(255,255,255,0.13) 0%, transparent 60%)`,
  );

  const handleMouseMove = useCallback((e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  }, [mouseX, mouseY]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
    setIsHovered(false);
  }, [mouseX, mouseY]);

  if (!item) return null;

  const {
    id, title, name, poster_path,
    vote_average, release_date, first_air_date,
    in_watchlist, watchlist_id, user_rating,
  } = item;

  const displayTitle = title || name || 'Unknown';
  const year = extractYear(release_date || first_air_date);
  const rating = vote_average ? Number(vote_average).toFixed(1) : null;

  const handleClick = () => navigate(contentType === 'movie' ? `/movie/${id}` : `/tvshow/${id}`);

  return (
    <motion.div
      ref={cardRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        width: '152px',
        minWidth: '152px',
      }}
      className="relative flex-shrink-0 cursor-pointer group"
    >
      {/* Gold glow aura behind card */}
      <motion.div
        className="absolute inset-0 rounded-sm -z-10 blur-xl"
        animate={{
          opacity: isHovered ? 0.55 : 0,
        }}
        transition={{ duration: 0.35 }}
        style={{
          background: 'radial-gradient(ellipse at center, rgba(201,168,76,0.45) 0%, transparent 70%)',
          transform: 'translateZ(-20px) scale(1.15)',
        }}
      />

      {/* Poster */}
      <div className="relative aspect-[2/3] overflow-hidden rounded-sm bg-elevated">

        {/* Skeleton shimmer while loading */}
        {!imgLoaded && !imgError && (
          <div className="absolute inset-0 skeleton" />
        )}

        {!imgError ? (
          <motion.img
            src={posterUrl(poster_path)}
            alt={displayTitle}
            loading="lazy"
            onError={() => setImgError(true)}
            onLoad={() => setImgLoaded(true)}
            animate={{ scale: isHovered ? 1.07 : 1 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={`w-full h-full object-cover ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-ink-muted p-4 text-center">
            <span className="text-4xl mb-2 opacity-40">⬜</span>
            <span className="text-xs leading-tight opacity-60">{truncate(displayTitle, 24)}</span>
          </div>
        )}

        {/* Shine / glare that follows mouse */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ background: shineBackground }}
        />

        {/* Hover gradient overlay */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none"
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        />

        {/* Gold top accent bar sweeps in */}
        <motion.div
          className="absolute top-0 left-0 right-0 h-px bg-gold origin-left pointer-events-none"
          animate={{ scaleX: isHovered ? 1 : 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />

        {/* Hover content */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 p-2.5"
          animate={{
            y: isHovered ? 0 : 10,
            opacity: isHovered ? 1 : 0,
          }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {rating && (
            <div className="flex items-center gap-1 mb-2">
              <StarIcon className="w-3 h-3 text-gold flex-shrink-0" />
              <span className="text-gold text-xs font-medium">{rating}</span>
              {user_rating && (
                <span className="text-ink-muted text-xs ml-auto">You: {user_rating}/10</span>
              )}
            </div>
          )}
          <div onClick={(e) => e.stopPropagation()}>
            <WatchlistButton
              contentId={id}
              contentType={contentType}
              inWatchlist={in_watchlist}
              watchlistId={watchlist_id}
              compact
            />
          </div>
        </motion.div>

        {/* User rated badge */}
        {user_rating && (
          <motion.div
            className="absolute top-2 right-2 bg-gold text-void text-[10px] font-bold rounded-sm min-w-[20px] h-5 px-1 flex items-center justify-center shadow-gold-sm"
            animate={{ scale: isHovered ? 1.2 : 1 }}
            transition={{ duration: 0.2, type: 'spring', stiffness: 400 }}
          >
            {user_rating}
          </motion.div>
        )}
      </div>

      {/* Footer lifts slightly on hover */}
      <motion.div
        className="mt-2 px-0.5"
        animate={{ y: isHovered ? -2 : 0 }}
        transition={{ duration: 0.25 }}
      >
        <p className="text-ink-primary text-xs font-medium leading-snug truncate">{displayTitle}</p>
        <p className="text-ink-muted text-[11px] mt-0.5">{year}</p>
      </motion.div>
    </motion.div>
  );
};

export default MovieCard;
