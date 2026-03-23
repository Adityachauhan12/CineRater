import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookmarkIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { getWatchlist, removeFromWatchlist } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { posterUrl, extractYear } from '../utils/helpers';
import toast from 'react-hot-toast';

const Watchlist = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null);
  const [sort, setSort]       = useState('recent'); // recent | az | za

  useEffect(() => {
    if (!isAuthenticated && !authLoading) { navigate('/login'); return; }
    if (isAuthenticated) {
      setLoading(true);
      getWatchlist()
        .then(({ data }) => setItems(data.data || data.results || []))
        .catch(() => toast.error('Failed to load watchlist.'))
        .finally(() => setLoading(false));
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleRemove = async (entry) => {
    const contentId   = entry.id || entry.content_id;
    const contentType = entry.content_type || 'movie';
    setRemoving(contentId);
    try {
      await removeFromWatchlist(contentId, contentType);
      setItems((prev) => prev.filter((i) => (i.id || i.content_id) !== contentId));
      toast.success('Removed from watchlist.');
    } catch { toast.error('Failed to remove.'); }
    finally { setRemoving(null); }
  };

  const handleClick = (entry) => {
    const type = entry.content_type || 'movie';
    const id   = entry.id || entry.content_id;
    navigate(type === 'movie' ? `/movie/${id}` : `/tvshow/${id}`);
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-void pt-28 px-6 md:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="h-8 w-40 skeleton rounded-sm mb-10" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-[2/3] skeleton rounded-sm" />
                <div className="mt-2 space-y-1.5">
                  <div className="h-2.5 skeleton rounded-sm w-4/5" />
                  <div className="h-2 skeleton rounded-sm w-2/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void pt-28 px-6 md:px-10 pb-20">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <span className="section-label mb-3 block">Your list</span>
          <div className="flex items-baseline gap-4">
            <h1 className="font-display text-5xl font-semibold text-ink-primary tracking-tight">Watchlist</h1>
            {items.length > 0 && (
              <span className="text-ink-muted text-sm">{items.length} titles</span>
            )}
          </div>
        </motion.div>

        {/* Sort controls */}
        {items.length > 0 && (
          <div className="flex items-center justify-end mb-6">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="bg-white/[0.04] border border-white/10 text-ink-secondary text-xs rounded-sm px-3 py-2 focus:outline-none focus:border-gold/30"
            >
              <option value="recent">Recently Added</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-12 h-12 rounded-sm border border-white/10 flex items-center justify-center mb-6">
              <BookmarkIcon className="w-5 h-5 text-ink-muted" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-ink-primary mb-2">Nothing saved yet</h2>
            <p className="text-ink-muted text-sm mb-8 max-w-xs">
              Browse films and shows — hit the bookmark to save them here.
            </p>
            <button onClick={() => navigate('/')} className="btn-gold">Explore Content</button>
          </div>
        ) : (
          <AnimatePresence>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
              {[...items].sort((a, b) => {
                const ta = (a.content || a).title || (a.content || a).name || '';
                const tb = (b.content || b).title || (b.content || b).name || '';
                if (sort === 'az') return ta.localeCompare(tb);
                if (sort === 'za') return tb.localeCompare(ta);
                return new Date(b.added_at || 0) - new Date(a.added_at || 0);
              }).map((entry, i) => {
                const content      = entry.content || entry;
                const displayTitle = content.title || content.name || 'Unknown';
                const year         = extractYear(content.release_date || content.first_air_date);
                const isRemoving   = removing === (entry.id || entry.content_id);

                return (
                  <motion.div
                    key={entry.id || entry.content_id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: isRemoving ? 0.3 : 1, y: 0 }}
                    transition={{ delay: i * 0.025 }}
                    className={`relative group cursor-pointer ${isRemoving ? 'pointer-events-none' : ''}`}
                    onClick={() => handleClick(entry)}
                  >
                    {/* Poster */}
                    <div className="aspect-[2/3] overflow-hidden rounded-sm bg-elevated relative">
                      <img
                        src={posterUrl(content.poster_path)}
                        alt={displayTitle} loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="absolute top-0 left-0 right-0 h-px bg-gold scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />

                      {/* Type badge */}
                      <div className="absolute top-2 left-2">
                        <span className="text-[9px] font-medium uppercase glass-dark text-ink-muted px-1.5 py-0.5 rounded-sm">
                          {entry.content_type === 'tvshow' ? 'TV' : 'Film'}
                        </span>
                      </div>

                      {/* Remove */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemove(entry); }}
                        disabled={isRemoving}
                        className="absolute top-2 right-2 w-6 h-6 glass-dark rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:border-white/20"
                        title="Remove from Watchlist"
                      >
                        {isRemoving
                          ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                          : <XMarkIcon className="w-3 h-3 text-ink-secondary" />
                        }
                      </button>
                    </div>

                    {/* Footer */}
                    <div className="mt-2 px-0.5">
                      <p className="text-ink-primary text-xs font-medium truncate leading-snug">{displayTitle}</p>
                      <p className="text-ink-muted text-[11px] mt-0.5">{year}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

export default Watchlist;
