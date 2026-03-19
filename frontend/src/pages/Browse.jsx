import { useState, useEffect, useCallback } from 'react';
import { FilmIcon, TvIcon } from '@heroicons/react/24/solid';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import MovieCard from '../components/MovieCard';
import { browseContent } from '../services/api';

const Browse = () => {
    const [contentType, setContentType] = useState('movie');
    const [selectedGenre, setSelectedGenre] = useState(0);
    const [genres, setGenres] = useState([]);
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);

    const fetchBrowse = useCallback((type, genre, pg) => {
        setLoading(true);
        browseContent(type, genre, pg)
            .then((res) => {
                setItems(res.data.results || []);
                setTotalPages(res.data.total_pages || 1);
                setGenres(res.data.genres || []);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // Fetch on any filter change
    useEffect(() => {
        fetchBrowse(contentType, selectedGenre, page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [contentType, selectedGenre, page, fetchBrowse]);

    const switchType = (type) => {
        setContentType(type);
        setSelectedGenre(0);
        setPage(1);
    };

    const switchGenre = (genreId) => {
        setSelectedGenre(genreId);
        setPage(1);
    };

    const SkeletonCard = () => (
        <div className="rounded-xl overflow-hidden bg-[#1f1f1f] animate-pulse">
            <div className="aspect-[2/3] bg-[#2a2a2a]" />
            <div className="p-2 space-y-1.5">
                <div className="h-3 bg-[#2a2a2a] rounded w-3/4" />
                <div className="h-2.5 bg-[#2a2a2a] rounded w-1/2" />
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#141414] pt-20 pb-16 px-6">

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-white mb-1">Browse</h1>
                <p className="text-gray-500 text-sm">Discover movies and TV shows by genre</p>
            </div>

            {/* Movie / TV Toggle */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => switchType('movie')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm transition-all duration-200 ${
                        contentType === 'movie'
                            ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
                            : 'bg-white/10 text-gray-400 hover:bg-white/15 hover:text-white'
                    }`}
                >
                    <FilmIcon className="w-4 h-4" />
                    Movies
                </button>
                <button
                    onClick={() => switchType('tvshow')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm transition-all duration-200 ${
                        contentType === 'tvshow'
                            ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
                            : 'bg-white/10 text-gray-400 hover:bg-white/15 hover:text-white'
                    }`}
                >
                    <TvIcon className="w-4 h-4" />
                    TV Shows
                </button>
            </div>

            {/* Genre Pills */}
            <div className="flex flex-wrap gap-2 mb-8">
                {genres.map((g) => (
                    <button
                        key={g.id}
                        onClick={() => switchGenre(g.id)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border ${
                            selectedGenre === g.id
                                ? 'bg-white text-black border-white'
                                : 'bg-transparent text-gray-400 border-white/20 hover:border-white/50 hover:text-white'
                        }`}
                    >
                        {g.name}
                    </button>
                ))}
            </div>

            {/* Grid */}
            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {Array.from({ length: 20 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
            ) : items.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {items.map((item) => (
                        <div key={item.id} className="flex-shrink-0">
                            <MovieCard item={item} contentType={contentType} />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-24 text-gray-600">
                    <span className="text-5xl mb-4">🎬</span>
                    <p>No results found for this filter.</p>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-12">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="flex items-center gap-1 px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-medium disabled:opacity-30 hover:bg-white/20 transition-colors"
                    >
                        <ChevronLeftIcon className="w-4 h-4" />
                        Prev
                    </button>
                    <span className="text-gray-400 text-sm">
                        Page <span className="text-white font-bold">{page}</span> of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="flex items-center gap-1 px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-medium disabled:opacity-30 hover:bg-white/20 transition-colors"
                    >
                        Next
                        <ChevronRightIcon className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default Browse;
