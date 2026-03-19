import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StarIcon } from '@heroicons/react/24/solid';
import { posterUrl, truncate, extractYear } from '../utils/helpers';
import WatchlistButton from './WatchlistButton';

/**
 * Props:
 *  - item          {object}  – movie or tvshow object from API
 *  - contentType   {string}  – 'movie' | 'tvshow'
 */
const MovieCard = ({ item, contentType = 'movie' }) => {
    const navigate = useNavigate();
    const [imgError, setImgError] = useState(false);

    if (!item) return null;

    const {
        id,
        title,
        name,
        poster_path,
        vote_average,
        release_date,
        first_air_date,
        in_watchlist,
        watchlist_id,
        user_rating,
    } = item;

    const displayTitle = title || name || 'Unknown';
    const year = extractYear(release_date || first_air_date);
    const rating = vote_average ? Number(vote_average).toFixed(1) : null;

    const handleClick = () => {
        if (contentType === 'movie') navigate(`/movie/${id}`);
        else navigate(`/tvshow/${id}`);
    };

    return (
        <div
            onClick={handleClick}
            className="relative flex-shrink-0 w-40 cursor-pointer group rounded-xl overflow-hidden bg-[#1f1f1f] border border-white/5 transition-all duration-300 hover:scale-105 hover:border-white/20 hover:shadow-2xl hover:shadow-black/60"
            style={{ minWidth: '160px' }}
        >
            {/* Poster Image */}
            <div className="relative aspect-[2/3] overflow-hidden bg-[#2a2a2a]">
                {!imgError ? (
                    <img
                        src={posterUrl(poster_path)}
                        alt={displayTitle}
                        loading="lazy"
                        onError={() => setImgError(true)}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 p-2 text-center">
                        <span className="text-3xl mb-2">🎬</span>
                        <span className="text-xs">{truncate(displayTitle, 30)}</span>
                    </div>
                )}

                {/* Gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Hover Overlay Content */}
                <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                    {/* Rating badge */}
                    {rating && (
                        <div className="flex items-center gap-1 mb-1.5">
                            <StarIcon className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                            <span className="text-yellow-400 text-xs font-bold">{rating}</span>
                            {user_rating && (
                                <span className="text-gray-400 text-xs ml-1">· You: {user_rating}★</span>
                            )}
                        </div>
                    )}
                    {/* Watchlist btn */}
                    <div onClick={(e) => e.stopPropagation()}>
                        <WatchlistButton
                            contentId={id}
                            contentType={contentType}
                            inWatchlist={in_watchlist}
                            watchlistId={watchlist_id}
                            compact
                        />
                    </div>
                </div>

                {/* User rated badge */}
                {user_rating && (
                    <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                        {user_rating}
                    </div>
                )}
            </div>

            {/* Card footer */}
            <div className="p-2">
                <p className="text-white text-xs font-medium leading-tight truncate">{displayTitle}</p>
                <p className="text-gray-500 text-xs mt-0.5">{year}</p>
            </div>
        </div>
    );
};

export default MovieCard;
