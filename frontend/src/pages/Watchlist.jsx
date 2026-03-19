import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrashIcon, BookmarkIcon } from '@heroicons/react/24/outline';
import { getWatchlist, removeFromWatchlist } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { posterUrl, extractYear } from '../utils/helpers';
import toast from 'react-hot-toast';

const Watchlist = () => {
    const navigate = useNavigate();
    const { isAuthenticated, loading: authLoading } = useAuth();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [removing, setRemoving] = useState(null); // ID of item being removed

    useEffect(() => {
        if (!isAuthenticated && !authLoading) {
            navigate('/login');
            return;
        }
        if (isAuthenticated) {
            setLoading(true);
            getWatchlist()
                .then(({ data }) => {
                    const list = data.data || data.results || [];
                    setItems(list);
                })
                .catch(() => toast.error('Failed to load watchlist.'))
                .finally(() => setLoading(false));
        }
    }, [isAuthenticated, authLoading, navigate]);

    const handleRemove = async (entry) => {
        const contentId = entry.id || entry.content_id; // TMDB ID
        const contentType = entry.content_type || 'movie';
        setRemoving(contentId);
        try {
            await removeFromWatchlist(contentId, contentType);
            setItems((prev) => prev.filter((i) => (i.id || i.content_id) !== contentId));
            toast.success('Removed from Watchlist');
        } catch {
            toast.error('Failed to remove.');
        } finally {
            setRemoving(null);
        }
    };

    const handleCardClick = (entry) => {
        const type = entry.content_type || 'movie';
        const contentId = entry.id || entry.content_id; // TMDB ID
        navigate(type === 'movie' ? `/movie/${contentId}` : `/tvshow/${contentId}`);
    };

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
                <div className="flex items-center gap-3 mb-8">
                    <BookmarkIcon className="w-6 h-6 text-red-500" />
                    <h1 className="text-2xl font-bold text-white">My Watchlist</h1>
                    {items.length > 0 && (
                        <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            {items.length}
                        </span>
                    )}
                </div>

                {/* Empty state */}
                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center">
                        <div className="text-6xl mb-6">🎬</div>
                        <h2 className="text-xl font-semibold text-white mb-2">Your watchlist is empty</h2>
                        <p className="text-gray-500 text-sm mb-6">
                            Browse movies and shows and hit the + button to save them here.
                        </p>
                        <button
                            onClick={() => navigate('/')}
                            className="bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
                        >
                            Explore Content
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {items.map((entry) => {
                            const content = entry.content || entry;
                            const displayTitle = content.title || content.name || 'Unknown';
                            const year = extractYear(content.release_date || content.first_air_date);
                            const isRemoving = removing === (entry.id || entry.content_id);

                            return (
                                <div
                                    key={entry.id || entry.content_id}
                                    className={`relative bg-[#1f1f1f] rounded-xl overflow-hidden border border-white/5 group cursor-pointer hover:border-white/20 hover:scale-105 transition-all duration-300 ${isRemoving ? 'opacity-40 pointer-events-none' : ''
                                        }`}
                                    onClick={() => handleCardClick(entry)}
                                >
                                    {/* Poster */}
                                    <div className="aspect-[2/3] overflow-hidden bg-[#2a2a2a]">
                                        <img
                                            src={posterUrl(content.poster_path)}
                                            alt={displayTitle}
                                            loading="lazy"
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                            onError={(e) => {
                                                e.target.parentNode.innerHTML = `<div class="w-full h-full flex items-center justify-center text-gray-600 text-3xl">🎬</div>`;
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    </div>

                                    {/* Remove button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemove(entry);
                                        }}
                                        disabled={isRemoving}
                                        className="absolute top-2 right-2 w-8 h-8 bg-red-600/90 hover:bg-red-500 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg"
                                        title="Remove from Watchlist"
                                    >
                                        {isRemoving ? (
                                            <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <TrashIcon className="w-4 h-4 text-white" />
                                        )}
                                    </button>

                                    {/* Content type badge */}
                                    <div className="absolute top-2 left-2">
                                        <span className="text-[10px] font-bold uppercase bg-black/60 backdrop-blur-sm text-gray-300 px-1.5 py-0.5 rounded">
                                            {entry.content_type || 'movie'}
                                        </span>
                                    </div>

                                    {/* Footer */}
                                    <div className="p-3">
                                        <p className="text-white text-xs font-medium truncate">{displayTitle}</p>
                                        <p className="text-gray-500 text-xs mt-0.5">{year}</p>
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

export default Watchlist;
