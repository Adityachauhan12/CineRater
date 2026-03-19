import { useState } from 'react';
import { PlusIcon, CheckIcon, TrashIcon } from '@heroicons/react/24/solid';
import { addToWatchlist, removeFromWatchlist } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

/**
 * Props:
 *  - contentId      {number}
 *  - contentType    {string}   'movie' | 'tvshow'
 *  - inWatchlist    {boolean}
 *  - watchlistId    {number|null}  – watchlist entry ID for removal
 *  - onToggle       {(added: boolean) => void}
 *  - compact        {boolean}  – icon-only mode (for cards)
 */
const WatchlistButton = ({
    contentId,
    contentType = 'movie',
    inWatchlist = false,
    watchlistId = null,
    onToggle,
    compact = false,
}) => {
    const { isAuthenticated } = useAuth();
    const [added, setAdded] = useState(inWatchlist);
    const [wlId, setWlId] = useState(watchlistId);
    const [loading, setLoading] = useState(false);

    const handleClick = async (e) => {
        e.stopPropagation();
        if (!isAuthenticated) {
            toast.error('Sign in to manage your watchlist.');
            return;
        }
        if (loading) return;
        setLoading(true);
        try {
            if (added) {
                // Use contentId for removal, not watchlist entry ID
                await removeFromWatchlist(contentId, contentType);
                setAdded(false);
                setWlId(null);
                toast.success('Removed from Watchlist');
                onToggle?.(false);
            } else {
                const response = await addToWatchlist(contentId, contentType);
                setAdded(true);
                setWlId(response.data?.watchlist_id ?? null);
                toast.success('Added to Watchlist ✓');
                onToggle?.(true);
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    if (compact) {
        return (
            <button
                onClick={handleClick}
                disabled={loading}
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-200
          ${added
                        ? 'bg-red-600 border-red-600 hover:bg-red-700'
                        : 'bg-black/60 border-white/50 hover:border-white hover:bg-white/10'
                    } disabled:cursor-not-allowed`}
                title={added ? 'Remove from Watchlist' : 'Add to Watchlist'}
            >
                {loading ? (
                    <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                ) : added ? (
                    <CheckIcon className="w-4 h-4 text-white" />
                ) : (
                    <PlusIcon className="w-4 h-4 text-white" />
                )}
            </button>
        );
    }

    return (
        <button
            onClick={handleClick}
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200
        ${added
                    ? 'bg-red-600/20 border border-red-500/50 text-red-400 hover:bg-red-600/30'
                    : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
                } disabled:cursor-not-allowed`}
        >
            {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : added ? (
                <TrashIcon className="w-4 h-4" />
            ) : (
                <PlusIcon className="w-4 h-4" />
            )}
            {added ? 'Remove from Watchlist' : '+ Add to Watchlist'}
        </button>
    );
};

export default WatchlistButton;
