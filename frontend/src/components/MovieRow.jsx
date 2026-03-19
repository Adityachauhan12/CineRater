import { useRef } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import MovieCard from './MovieCard';

/**
 * Props:
 *  - title        {string}  – Row heading
 *  - items        {Array}   – list of movie/tvshow objects
 *  - contentType  {string}  – 'movie' | 'tvshow'
 *  - loading      {boolean}
 */
const MovieRow = ({ title, items = [], contentType = 'movie', loading = false }) => {
    const rowRef = useRef(null);

    const scroll = (direction) => {
        if (!rowRef.current) return;
        const scrollAmount = 600;
        rowRef.current.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth',
        });
    };

    const SkeletonCard = () => (
        <div className="flex-shrink-0 w-40 rounded-xl overflow-hidden bg-[#1f1f1f] animate-pulse" style={{ minWidth: '160px' }}>
            <div className="aspect-[2/3] bg-[#2a2a2a]" />
            <div className="p-2 space-y-1.5">
                <div className="h-3 bg-[#2a2a2a] rounded w-3/4" />
                <div className="h-2.5 bg-[#2a2a2a] rounded w-1/2" />
            </div>
        </div>
    );

    return (
        <div className="mb-10">
            {/* Row Header */}
            <div className="flex items-center justify-between px-6 mb-4">
                <h2 className="text-xl font-bold text-white tracking-tight">
                    {title}
                    <span className="ml-2 text-red-500">›</span>
                </h2>
            </div>

            {/* Scrollable Container */}
            <div className="relative group/row">
                {/* Left chevron */}
                <button
                    onClick={() => scroll('left')}
                    className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-[#141414] to-transparent flex items-center justify-start pl-1 opacity-0 group-hover/row:opacity-100 transition-opacity duration-200"
                    aria-label="Scroll left"
                >
                    <ChevronLeftIcon className="w-7 h-7 text-white drop-shadow-lg" />
                </button>

                {/* Cards Row */}
                <div
                    ref={rowRef}
                    className="flex gap-3 overflow-x-auto px-6 no-scrollbar scroll-smooth"
                >
                    {loading
                        ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
                        : items.length > 0
                            ? items.map((item) => (
                                <MovieCard key={item.id} item={item} contentType={contentType} />
                            ))
                            : (
                                <p className="text-gray-600 text-sm py-8 px-2">No results found.</p>
                            )
                    }
                </div>

                {/* Right chevron */}
                <button
                    onClick={() => scroll('right')}
                    className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-[#141414] to-transparent flex items-center justify-end pr-1 opacity-0 group-hover/row:opacity-100 transition-opacity duration-200"
                    aria-label="Scroll right"
                >
                    <ChevronRightIcon className="w-7 h-7 text-white drop-shadow-lg" />
                </button>
            </div>
        </div>
    );
};

export default MovieRow;
