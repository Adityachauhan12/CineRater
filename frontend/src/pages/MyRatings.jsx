import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { StarIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutlineIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { getUserRatings, deleteRating } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { posterUrl, extractYear } from '../utils/helpers';
import toast from 'react-hot-toast';

const FILTERS = [
  { label: 'All',      value: 'all' },
  { label: 'Movies',   value: 'movie' },
  { label: 'TV Shows', value: 'tvshow' },
];
const SORTS = [
  { label: 'Recently Rated', value: 'recent' },
  { label: 'Highest Rated',  value: 'high' },
  { label: 'Lowest Rated',   value: 'low' },
];

const StarDisplay = ({ score }) => (
  <div className="flex items-center gap-0.5">
    {[1,2,3,4,5,6,7,8,9,10].map((s) =>
      s <= score
        ? <StarIcon key={s} className="w-2.5 h-2.5 text-gold" />
        : <StarOutlineIcon key={s} className="w-2.5 h-2.5 text-ink-muted" />
    )}
  </div>
);

const MyRatings = () => {
  const navigate  = useNavigate();
  const topRef    = useRef(null);
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [items,      setItems]      = useState([]);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [removing,   setRemoving]   = useState(null);
  const [filter,     setFilter]     = useState('all');
  const [sort,       setSort]       = useState('recent');
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total,      setTotal]      = useState(0);

  const fetchRatings = (pg = page, f = filter, s = sort) => {
    setLoading(true);
    getUserRatings(pg, f, s)
      .then(({ data }) => {
        setItems(data.data || []);
        setTotalPages(data.total_pages || 1);
        setTotal(data.total || 0);
        if (data.stats) setStats(data.stats);
      })
      .catch(() => toast.error('Failed to load ratings.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isAuthenticated && !authLoading) { navigate('/login'); return; }
    if (isAuthenticated) fetchRatings(page, filter, sort);
  }, [isAuthenticated, authLoading]);  // eslint-disable-line

  // Change filter/sort → reset to page 1
  const handleFilter = (val) => {
    setFilter(val);
    setPage(1);
    setSearch('');
    fetchRatings(1, val, sort);
  };
  const handleSort = (val) => {
    setSort(val);
    setPage(1);
    setSearch('');
    fetchRatings(1, filter, val);
  };
  const handlePage = (p) => {
    setPage(p);
    fetchRatings(p, filter, sort);
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const handleRemove = async (item) => {
    const id   = item.id;
    const type = item.content_type || 'movie';
    setRemoving(id);
    try {
      await deleteRating(id, type);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setStats((s) => s ? {
        ...s,
        total: s.total - 1,
        movies:  type === 'movie'  ? s.movies  - 1 : s.movies,
        tvshows: type === 'tvshow' ? s.tvshows - 1 : s.tvshows,
      } : s);
      toast.success('Rating removed.');
    } catch { toast.error('Failed to remove.'); }
    finally { setRemoving(null); }
  };

  // Client-side search within current page
  const displayed = search.trim()
    ? items.filter((i) => (i.title || i.name || '').toLowerCase().includes(search.toLowerCase()))
    : items;

  if (authLoading || (loading && items.length === 0)) {
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
    <div className="min-h-screen bg-void pt-28 px-6 md:px-10 pb-20" ref={topRef}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <span className="section-label mb-3 block">Your taste</span>
          <div className="flex items-baseline gap-4">
            <h1 className="font-display text-5xl font-semibold text-ink-primary tracking-tight">Ratings</h1>
            {stats && <span className="text-ink-muted text-sm">{stats.total.toLocaleString()} titles</span>}
          </div>
        </motion.div>

        {/* Stats */}
        {stats && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
            className="flex items-center gap-8 mb-8 p-5 glass rounded-sm"
          >
            {[
              { label: 'Avg Rating', value: `${stats.avg}/10`, accent: true },
              { label: 'Films',      value: stats.movies.toLocaleString() },
              { label: 'Series',     value: stats.tvshows.toLocaleString() },
            ].map(({ label, value, accent }, i) => (
              <div key={label} className="flex items-center gap-8">
                {i > 0 && <div className="w-px h-8 bg-white/[0.08]" />}
                <div>
                  <p className={`text-2xl font-display font-semibold ${accent ? 'text-gold' : 'text-ink-primary'}`}>{value}</p>
                  <p className="text-ink-muted text-xs mt-0.5">{label}</p>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          {/* Filter tabs */}
          <div className="flex items-center gap-1 p-1 glass rounded-sm">
            {FILTERS.map((f) => (
              <button key={f.value} onClick={() => handleFilter(f.value)}
                className={`px-4 py-1.5 rounded-sm text-xs font-medium transition-all ${
                  filter === f.value ? 'bg-gold text-void shadow-gold-sm' : 'text-ink-secondary hover:text-ink-primary'
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this page…"
                className="pl-8 pr-3 py-2 text-xs rounded-sm bg-white/[0.04] border border-white/10 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-gold/30 w-44"
              />
            </div>

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => handleSort(e.target.value)}
              className="bg-white/[0.04] border border-white/10 text-ink-secondary text-xs rounded-sm px-3 py-2 focus:outline-none focus:border-gold/30"
            >
              {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Loading overlay for page changes */}
        {loading && items.length > 0 && (
          <div className="flex justify-center py-8">
            <span className="w-5 h-5 border border-gold/40 border-t-gold rounded-full animate-spin" />
          </div>
        )}

        {/* Empty */}
        {!loading && displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-12 h-12 rounded-sm border border-white/10 flex items-center justify-center mb-6">
              <StarIcon className="w-5 h-5 text-ink-muted" />
            </div>
            {search ? (
              <>
                <h2 className="font-display text-2xl font-semibold text-ink-primary mb-2">No results</h2>
                <p className="text-ink-muted text-sm">No titles on this page match "{search}"</p>
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl font-semibold text-ink-primary mb-2">No ratings yet</h2>
                <p className="text-ink-muted text-sm mb-8 max-w-xs">Rate films and shows to build your taste profile.</p>
                <button onClick={() => navigate('/')} className="btn-gold">Browse Content</button>
              </>
            )}
          </div>
        ) : (
          <AnimatePresence>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5" key={`${page}-${filter}-${sort}`}>
              {displayed.map((item, i) => {
                const id    = item.id;
                const title = item.title || item.name || 'Unknown';
                const year  = extractYear(item.release_date || item.first_air_date);
                const isRemoving = removing === id;

                return (
                  <motion.div
                    key={`${item.content_type}-${id}`}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: isRemoving ? 0.3 : 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className={`relative group cursor-pointer ${isRemoving ? 'pointer-events-none' : ''}`}
                    onClick={() => navigate(item.content_type === 'movie' ? `/movie/${id}` : `/tvshow/${id}`)}
                  >
                    {/* Poster */}
                    <div className="aspect-[2/3] overflow-hidden rounded-sm bg-elevated relative">
                      <img
                        src={posterUrl(item.poster_path)}
                        alt={title} loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="absolute top-0 left-0 right-0 h-px bg-gold scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />

                      {/* Rating badge */}
                      <div className="absolute top-2 right-2 min-w-[22px] h-5 px-1 bg-gold text-void text-[10px] font-bold rounded-sm flex items-center justify-center shadow-gold-sm">
                        {item.user_rating}
                      </div>
                      {/* Type badge */}
                      <div className="absolute top-2 left-2">
                        <span className="text-[9px] font-medium uppercase glass-dark text-ink-muted px-1.5 py-0.5 rounded-sm">
                          {item.content_type === 'tvshow' ? 'TV' : 'Film'}
                        </span>
                      </div>
                      {/* Remove btn */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemove(item); }}
                        disabled={isRemoving}
                        className="absolute bottom-2 right-2 w-6 h-6 glass-dark rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:border-white/20"
                        title="Remove rating"
                      >
                        {isRemoving
                          ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                          : <XMarkIcon className="w-3 h-3 text-ink-secondary" />
                        }
                      </button>
                    </div>

                    {/* Footer */}
                    <div className="mt-2 px-0.5">
                      <p className="text-ink-primary text-xs font-medium truncate leading-snug">{title}</p>
                      <div className="flex items-center justify-between mt-1">
                        <StarDisplay score={Math.round(item.user_rating)} />
                        <span className="text-ink-muted text-[10px]">{year}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        )}

        {/* Pagination */}
        {totalPages > 1 && !search && (
          <div className="flex items-center justify-center gap-3 mt-12">
            <button
              onClick={() => handlePage(Math.max(1, page - 1))}
              disabled={page === 1 || loading}
              className="px-4 py-2 rounded-sm text-xs font-medium border border-white/10 text-ink-secondary hover:text-ink-primary hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            <span className="text-ink-muted text-xs">Page {page} of {totalPages}</span>
            <button
              onClick={() => handlePage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages || loading}
              className="px-4 py-2 rounded-sm text-xs font-medium border border-white/10 text-ink-secondary hover:text-ink-primary hover:border-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyRatings;
