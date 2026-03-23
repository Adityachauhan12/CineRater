import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MagnifyingGlassIcon,
  BookmarkIcon,
  XMarkIcon,
  FilmIcon,
  Bars3Icon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolidIcon, StarIcon } from '@heroicons/react/24/solid';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { searchContent } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { posterUrl } from '../utils/helpers';
import toast from 'react-hot-toast';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/browse', label: 'Browse' },
];

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const searchRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await searchContent(query.trim());
        const resultObj = data.results ?? {};
        const movies  = (resultObj.movies  ?? []).map((m) => ({ ...m, content_type: 'movie' }));
        const tvshows = (resultObj.tvshows ?? []).map((t) => ({ ...t, content_type: 'tvshow' }));
        setResults([...movies.slice(0, 3), ...tvshows.slice(0, 3)]);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) closeSearch();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const closeSearch = () => { setSearchOpen(false); setQuery(''); setResults([]); };

  const handleResultClick = (item) => {
    const type = item.content_type || (item.title ? 'movie' : 'tvshow');
    navigate(type === 'movie' ? `/movie/${item.id}` : `/tvshow/${item.id}`);
    closeSearch();
  };

  const handleLogout = () => {
    logout();
    toast.success('See you next time.');
    navigate('/login');
    setDropdownOpen(false);
  };

  const isActive = (to) => location.pathname === to;

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50"
      animate={{
        backgroundColor: scrolled ? 'rgba(8,8,8,0.92)' : 'rgba(8,8,8,0)',
        backdropFilter: scrolled ? 'blur(20px)' : 'blur(0px)',
        borderBottomColor: scrolled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
      }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {/* Shimmer bottom border on scroll */}
      <AnimatePresence>
        {scrolled && (
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ scaleX: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute bottom-0 left-0 right-0 h-px origin-left"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(201,168,76,0.4) 30%, rgba(201,168,76,0.8) 50%, rgba(201,168,76,0.4) 70%, transparent 100%)',
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="flex items-center justify-between px-6 md:px-10 max-w-screen-2xl mx-auto"
        animate={{ paddingTop: scrolled ? '12px' : '16px', paddingBottom: scrolled ? '12px' : '16px' }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 flex-shrink-0 group">
          <motion.div
            className="w-7 h-7 flex items-center justify-center"
            whileHover={{ rotate: [0, -10, 10, 0], scale: 1.15 }}
            transition={{ duration: 0.4 }}
          >
            <FilmIcon className="w-5 h-5 text-gold group-hover:text-gold-light transition-colors duration-300" />
          </motion.div>
          <motion.span
            className="font-display font-semibold tracking-[0.15em] text-ink-primary group-hover:text-gold-light transition-colors duration-300"
            animate={{ fontSize: scrolled ? '17px' : '20px' }}
            transition={{ duration: 0.35 }}
          >
            CINERATER
          </motion.span>
        </Link>

        {/* Nav links — desktop */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`text-sm font-medium tracking-wide transition-colors duration-200 relative pb-0.5 ${
                isActive(to)
                  ? 'text-gold'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {label}
              {isActive(to) && (
                <motion.span
                  layoutId="nav-indicator"
                  className="absolute bottom-0 left-0 right-0 h-px bg-gold"
                />
              )}
            </Link>
          ))}
          {isAuthenticated && (
            <>
              <Link
                to="/watchlist"
                className={`text-sm font-medium tracking-wide transition-colors duration-200 relative pb-0.5 ${
                  isActive('/watchlist') ? 'text-gold' : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                Watchlist
                {isActive('/watchlist') && (
                  <motion.span layoutId="nav-indicator" className="absolute bottom-0 left-0 right-0 h-px bg-gold" />
                )}
              </Link>
              <Link
                to="/ratings"
                className={`text-sm font-medium tracking-wide transition-colors duration-200 relative pb-0.5 ${
                  isActive('/ratings') ? 'text-gold' : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                Ratings
                {isActive('/ratings') && (
                  <motion.span layoutId="nav-indicator" className="absolute bottom-0 left-0 right-0 h-px bg-gold" />
                )}
              </Link>
              <Link
                to="/chat"
                className={`text-sm font-medium tracking-wide transition-colors duration-200 flex items-center gap-2 relative pb-0.5 ${
                  isActive('/chat') ? 'text-gold' : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                CineBot
                <span className="text-[9px] font-sans font-semibold tracking-widest text-gold border border-gold/30 px-1.5 py-0.5 rounded-sm">
                  AI
                </span>
                {isActive('/chat') && (
                  <motion.span layoutId="nav-indicator" className="absolute bottom-0 left-0 right-0 h-px bg-gold" />
                )}
              </Link>
              <Link
                to="/recommendations"
                className={`text-sm font-medium tracking-wide transition-colors duration-200 flex items-center gap-1.5 relative pb-0.5 ${
                  isActive('/recommendations') ? 'text-gold' : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                For You
                {isActive('/recommendations') && (
                  <motion.span layoutId="nav-indicator" className="absolute bottom-0 left-0 right-0 h-px bg-gold" />
                )}
              </Link>
            </>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-4">

          {/* Search */}
          <AnimatePresence mode="wait">
            {searchOpen ? (
              <motion.div
                key="search-open"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 280, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="relative overflow-visible"
                ref={searchRef}
              >
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
                    <input
                      ref={inputRef}
                      autoFocus
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search films, series…"
                      className="w-full bg-white/[0.06] border border-white/10 rounded-sm pl-9 pr-8 py-2 text-sm text-ink-primary placeholder-ink-muted focus:outline-none focus:border-gold/40 transition-colors"
                    />
                    {query && (
                      <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                        <XMarkIcon className="w-3.5 h-3.5 text-ink-muted hover:text-ink-secondary transition-colors" />
                      </button>
                    )}
                  </div>
                  <button onClick={closeSearch} className="text-ink-muted hover:text-ink-secondary transition-colors flex-shrink-0">
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>

                {/* Results dropdown */}
                <AnimatePresence>
                  {(results.length > 0 || searching) && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 right-0 mt-2 glass-dark rounded-sm overflow-hidden shadow-deep z-50"
                      style={{ width: '320px' }}
                    >
                      {searching ? (
                        <div className="p-4 text-center text-ink-muted text-sm">Searching…</div>
                      ) : (
                        results.map((item, i) => (
                          <motion.button
                            key={item.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            onClick={() => handleResultClick(item)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.06] transition-colors text-left border-b border-white/[0.04] last:border-0"
                          >
                            <img
                              src={posterUrl(item.poster_path, 'w92')}
                              alt={item.title || item.name}
                              className="w-9 h-[52px] object-cover rounded-sm flex-shrink-0 bg-elevated"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <div className="min-w-0">
                              <p className="text-ink-primary text-sm font-medium truncate">{item.title || item.name}</p>
                              <p className="text-ink-muted text-xs mt-0.5 capitalize">
                                {item.content_type === 'movie' ? 'Film' : 'Series'}
                              </p>
                            </div>
                          </motion.button>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.button
                key="search-icon"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setSearchOpen(true)}
                className="text-ink-muted hover:text-ink-primary transition-colors p-1"
                aria-label="Search"
              >
                <MagnifyingGlassIcon className="w-5 h-5" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Watchlist icon */}
          {isAuthenticated && !searchOpen && (
            <Link to="/watchlist" className="text-ink-muted hover:text-gold transition-colors p-1" aria-label="Watchlist">
              <BookmarkIcon className="w-5 h-5" />
            </Link>
          )}

          {/* User menu */}
          {!searchOpen && (
            isAuthenticated ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex items-center gap-2 group"
                >
                  <div className="w-8 h-8 rounded-sm bg-gold/10 border border-gold/20 flex items-center justify-center group-hover:border-gold/40 transition-colors">
                    <span className="text-gold text-xs font-medium font-display">
                      {(user?.username || user?.email || 'U')[0].toUpperCase()}
                    </span>
                  </div>
                </button>

                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 glass-dark rounded-sm overflow-hidden shadow-deep w-52 z-50"
                    >
                      <div className="px-4 py-3 border-b border-white/[0.06]">
                        <p className="text-ink-primary text-sm font-medium truncate">{user?.username || 'User'}</p>
                        <p className="text-ink-muted text-xs mt-0.5 truncate">{user?.email}</p>
                      </div>
                      {[
                        { to: '/watchlist', icon: BookmarkSolidIcon, label: 'My Watchlist' },
                        { to: '/ratings', icon: StarIcon, label: 'My Ratings', iconClass: 'text-gold' },
                        { to: '/import', icon: ArrowUpTrayIcon, label: 'Import from IMDB' },
                      ].map(({ to, icon: Icon, label, iconClass }) => (
                        <Link
                          key={to}
                          to={to}
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04] transition-colors"
                        >
                          <Icon className={`w-4 h-4 ${iconClass || 'text-ink-muted'}`} />
                          {label}
                        </Link>
                      ))}
                      <div className="border-t border-white/[0.06]">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-muted hover:text-ink-secondary hover:bg-white/[0.04] transition-colors"
                        >
                          Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link to="/login" className="btn-gold text-xs py-2 px-4">
                Sign In
              </Link>
            )
          )}

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-ink-muted hover:text-ink-primary transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <Bars3Icon className="w-5 h-5" />
          </button>
        </div>
      </motion.div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="md:hidden overflow-hidden bg-void/95 backdrop-blur-xl border-t border-white/[0.06]"
          >
            <div className="flex flex-col px-6 py-4 gap-4">
              {[
                ...NAV_LINKS,
                ...(isAuthenticated
                  ? [
                      { to: '/watchlist', label: 'Watchlist' },
                      { to: '/ratings', label: 'Ratings' },
                      { to: '/chat', label: 'CineBot' },
                      { to: '/recommendations', label: 'For You' },
                    ]
                  : []),
              ].map(({ to, label }, i) => (
                <motion.div
                  key={to}
                  initial={{ x: -16, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                >
                  <Link
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={`text-sm font-medium block ${isActive(to) ? 'text-gold' : 'text-ink-secondary'}`}
                  >
                    {label}
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default Navbar;
