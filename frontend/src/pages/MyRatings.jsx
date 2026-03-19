import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StarIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';
import { getUserRatings, deleteRating } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { posterUrl, extractYear } from '../utils/helpers';
import toast from 'react-hot-toast';

const FILTERS = ['All', 'Movies', 'TV Shows'];
const SORT_OPTIONS = ['Recently Rated', 'Highest Rated', 'Lowest Rated'];

const StarDisplay = ({ score }) => (
    <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
            s <= score
                ? <StarIcon key={s} className="w-3.5 h-3.5 text-yellow-400" />
                : <StarOutlineIcon key={s} className="w-3.5 h-3.5 text-gray-600" />
        ))}
    </div>
);

const MyRatings = () => {
    const navigate = useNavigate();
    const { isAuthenticated, loading: authLoading } = useAuth();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [removing, setRemoving] = useState(null);
    const [filter, setFilter] = useState('All');
    const [sort, setSort] = useState('Recently Rated');

    useEffect(() => {
        if (!isAuthenticated && !authLoading) { navigate('/login'); return; }
        if (isAuthenticated) {
            setLoading(true);
            getUserRatings()
                .then(({ data }) => setItems(data.data || []))
                .catch(() => toast.error('Failed to load ratings.'))
                .finally(() => setLoading(false));
        }
    }, [isAuthenticated, authLoading, navigate]);

    const handleRemove = async (item) => {
        const id = item.id || item.content_id;
        const type = item.content_type || 'movie';
        setRemoving(id);
        try {
            await deleteRating(id, type);
            setItems((prev) => prev.filter((i) => (i.id || i.content_id) !== id));
            toast.success('Rating removed');
        } catch {
            toast.error('Failed to remove rating.');
        } finally {
            setRemoving(null);
        }
    };

    const filtered = items.filter((i) => {
        if (filter === 'Movies') return i.content_type === 'movie';
        if (filter === 'TV Shows') return i.content_type === 'tvshow';
        return true;
    });

    const sorted = [...filtered].sort((a, b) => {
        if (sort === 'Highest Rated') return b.user_rating - a.user_rating;
        if (sort === 'Lowest Rated') return a.user_rating - b.user_rating;
        return new Date(b.rated_at) - new Date(a.rated_at); // Recently Rated
    });

    // Stats
    const avgRating = items.length
        ? (items.reduce((s, i) => s + i.user_rating, 0) / items.length).toFixed(1)
        : null;
    const movieCount = items.filter((i) => i.content_type === 'movie').length;
    const tvCount = items.filter((i) => i.content_type === 'tvshow').length;

    if (loading || authLoading) {
        return (
            <div className="min-h-screen bg-[#141414] pt-24 px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="h-8 w-48 bg-[#1f1f1f] rounded mb-8 animate-pulse" />
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div key={i} className="bg-[#1f1f1f] rounded-xl overflow-hidden animate-pulse">
                                <div className="aspect-[2/3] bg-[#2a2a2a]" />
                                <div className="p-3 space-y-2">
                                    <div className="h-3 bg-[#2a2a2a] rounded w-3/4" />
                                    <div className="h-2.5 bg-[#2a2a2a] rounded w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#141414] pt-24 px-6 pb-20">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <StarIcon className="w-6 h-6 text-yellow-400" />
                    <h1 className="text-2xl font-bold text-white">My Ratings</h1>
                    {items.length > 0 && (
                        <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
                            {items.length}
                        </span>
                    )}
                </div>

                {/* Stats bar */}
                {items.length > 0 && (
                    <div className="flex items-center gap-6 mb-6 p-4 bg-[#1a1a1a] rounded-xl border border-white/5">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-yellow-400">{avgRating}</p>
                            <p className="text-gray-500 text-xs mt-0.5">Avg Rating</p>
                        </div>
                        <div className="w-px h-10 bg-white/10" />
                        <div className="text-center">
                            <p className="text-2xl font-bold text-white">{movieCount}</p>
                            <p className="text-gray-500 text-xs mt-0.5">Movies</p>
                        </div>
                        <div className="w-px h-10 bg-white/10" />
                        <div className="text-center">
                            <p className="text-2xl font-bold text-white">{tvCount}</p>
                            <p className="text-gray-500 text-xs mt-0.5">TV Shows</p>
                        </div>
                    </div>
                )}

                {/* Filters + Sort */}
                {items.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                        <div className="flex gap-2">
                            {FILTERS.map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                        filter === f
                                            ? 'bg-yellow-500 text-black'
                                            : 'bg-[#1f1f1f] text-gray-400 hover:text-white border border-white/5'
                                    }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value)}
                            className="bg-[#1f1f1f] border border-white/10 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-yellow-500"
                        >
                            {SORT_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                        </select>
                    </div>
                )}

                {/* Empty state */}
                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center">
                        <div className="text-6xl mb-6">⭐</div>
                        <h2 className="text-xl font-semibold text-white mb-2">No ratings yet</h2>
                        <p className="text-gray-500 text-sm mb-6">
                            Rate movies and shows to track what you've watched and loved.
                        </p>
                        <button
                            onClick={() => navigate('/')}
                            className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-6 py-2.5 rounded-xl transition-colors"
                        >
                            Browse Content
                        </button>
                    </div>
                ) : sorted.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">No {filter.toLowerCase()} rated yet.</div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {sorted.map((item) => {
                            const id = item.id || item.content_id;
                            const title = item.title || item.name || 'Unknown';
                            const year = extractYear(item.release_date || item.first_air_date);
                            const isRemoving = removing === id;

                            return (
                                <div
                                    key={`${item.content_type}-${id}`}
                                    className={`relative bg-[#1f1f1f] rounded-xl overflow-hidden border border-white/5 group cursor-pointer hover:border-white/20 hover:scale-105 transition-all duration-300 ${isRemoving ? 'opacity-40 pointer-events-none' : ''}`}
                                    onClick={() => navigate(item.content_type === 'movie' ? `/movie/${id}` : `/tvshow/${id}`)}
                                >
                                    {/* Poster */}
                                    <div className="aspect-[2/3] overflow-hidden bg-[#2a2a2a]">
                                        <img
                                            src={posterUrl(item.poster_path)}
                                            alt={title}
                                            loading="lazy"
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                            onError={(e) => {
                                                e.target.parentNode.innerHTML = `<div class="w-full h-full flex items-center justify-center text-gray-600 text-3xl">🎬</div>`;
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    </div>

                                    {/* Rating badge (top-right) */}
                                    <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shadow-lg">
                                        {item.user_rating}
                                    </div>

                                    {/* Content type badge */}
                                    <div className="absolute top-2 left-2">
                                        <span className="text-[10px] font-bold uppercase bg-black/60 backdrop-blur-sm text-gray-300 px-1.5 py-0.5 rounded">
                                            {item.content_type === 'tvshow' ? 'TV' : 'Movie'}
                                        </span>
                                    </div>

                                    {/* Remove button on hover */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleRemove(item); }}
                                        disabled={isRemoving}
                                        className="absolute bottom-12 right-2 w-7 h-7 bg-red-600/90 hover:bg-red-500 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg"
                                        title="Remove rating"
                                    >
                                        {isRemoving
                                            ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                                            : <span className="text-white text-xs font-bold">✕</span>
                                        }
                                    </button>

                                    {/* Footer */}
                                    <div className="p-3">
                                        <p className="text-white text-xs font-medium truncate">{title}</p>
                                        <div className="flex items-center justify-between mt-1">
                                            <StarDisplay score={Math.round(item.user_rating)} />
                                            <span className="text-gray-600 text-[10px]">{year}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyRatings;
