import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    MagnifyingGlassIcon,
    BookmarkIcon,
    UserCircleIcon,
    XMarkIcon,
    FilmIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolidIcon, StarIcon } from '@heroicons/react/24/solid';
import { searchContent } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { posterUrl } from '../utils/helpers';
import toast from 'react-hot-toast';

const Navbar = () => {
    const navigate = useNavigate();
    const { isAuthenticated, user, logout } = useAuth();

    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    const searchRef = useRef(null);
    const dropdownRef = useRef(null);

    // Navbar background on scroll
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 10);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Search debounce
    useEffect(() => {
        if (!query.trim()) { setResults([]); return; }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const { data } = await searchContent(query.trim());
                // Backend returns: { success, query, results: { movies: [], tvshows: [] } }
                const resultObj = data.results ?? {};
                const movies = (resultObj.movies ?? []).map((m) => ({ ...m, content_type: 'movie' }));
                const tvshows = (resultObj.tvshows ?? []).map((t) => ({ ...t, content_type: 'tvshow' }));
                // Interleave: up to 3 movies + 3 TV shows so TV shows aren't pushed out
                const combined = [...movies.slice(0, 3), ...tvshows.slice(0, 3)];
                setResults(combined);
            } catch {
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 350);
        return () => clearTimeout(t);
    }, [query]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const closeSearch = () => {
        setSearchOpen(false);
        setQuery('');
        setResults([]);
    };

    const handleResultClick = (item) => {
        const type = item.content_type || (item.title ? 'movie' : 'tvshow');
        navigate(type === 'movie' ? `/movie/${item.id}` : `/tvshow/${item.id}`);
        closeSearch();
    };

    const handleLogout = () => {
        logout();
        toast.success('Logged out.');
        navigate('/login');
        setDropdownOpen(false);
    };

    return (
        <nav
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#141414]/95 backdrop-blur-md shadow-lg shadow-black/40' : 'bg-gradient-to-b from-black/70 to-transparent'
                }`}
        >
            <div className="flex items-center justify-between px-6 py-3 max-w-screen-2xl mx-auto">
                {/* Logo */}
                <Link to="/" className="flex items-center gap-2 flex-shrink-0">
                    <FilmIcon className="w-6 h-6 text-red-500" />
                    <span className="text-xl font-bold text-red-500 tracking-widest">CINERATER</span>
                </Link>

                {/* Nav Links */}
                <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-300">
                    <Link to="/" className="hover:text-white transition-colors">Home</Link>
                    <Link to="/browse" className="hover:text-white transition-colors">Browse</Link>
                    <Link to="/watchlist" className="hover:text-white transition-colors">Watchlist</Link>
                    {isAuthenticated && (
                        <Link to="/ratings" className="hover:text-white transition-colors">My Ratings</Link>
                    )}
                    {isAuthenticated && (
                        <Link to="/chat" className="hover:text-white transition-colors flex items-center gap-1.5">
                            CineBot
                            <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">AI</span>
                        </Link>
                    )}
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-3">
                    {/* Search */}
                    {searchOpen ? (
                        <div className="relative flex items-center gap-2" ref={searchRef}>
                            <div className="relative">
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    autoFocus
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search movies, shows…"
                                    className="w-64 bg-[#1f1f1f] border border-white/10 rounded-full pl-9 pr-4 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition"
                                />
                                {query && (
                                    <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <XMarkIcon className="w-4 h-4 text-gray-500" />
                                    </button>
                                )}
                                {/* Search Results Dropdown */}
                                {(results.length > 0 || searching) && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1f1f1f] border border-white/10 rounded-xl overflow-hidden shadow-2xl max-h-80 overflow-y-auto z-50">
                                        {searching ? (
                                            <div className="p-3 text-center text-gray-500 text-sm">Searching…</div>
                                        ) : (
                                            results.map((item) => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => handleResultClick(item)}
                                                    className="w-full flex items-center gap-3 p-2.5 hover:bg-white/5 transition-colors text-left"
                                                >
                                                    <img
                                                        src={posterUrl(item.poster_path, 'w92')}
                                                        alt={item.title || item.name}
                                                        className="w-10 h-14 object-cover rounded-lg flex-shrink-0 bg-[#2a2a2a]"
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="text-white text-sm font-medium truncate">{item.title || item.name}</p>
                                                        <p className="text-gray-500 text-xs capitalize">
                                                            {item.content_type || (item.title ? 'Movie' : 'TV Show')}
                                                        </p>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                            <button onClick={closeSearch} className="text-gray-400 hover:text-white transition-colors">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setSearchOpen(true)}
                            className="text-gray-400 hover:text-white transition-colors p-1"
                            aria-label="Search"
                        >
                            <MagnifyingGlassIcon className="w-5 h-5" />
                        </button>
                    )}

                    {/* Watchlist shortcut */}
                    {isAuthenticated && (
                        <Link to="/watchlist" className="text-gray-400 hover:text-white transition-colors p-1" aria-label="Watchlist">
                            <BookmarkIcon className="w-5 h-5" />
                        </Link>
                    )}

                    {/* Auth */}
                    {isAuthenticated ? (
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setDropdownOpen((v) => !v)}
                                className="flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors"
                            >
                                <UserCircleIcon className="w-8 h-8" />
                            </button>
                            {dropdownOpen && (
                                <div className="absolute right-0 top-full mt-2 bg-[#1f1f1f] border border-white/10 rounded-xl overflow-hidden shadow-2xl w-48 z-50">
                                    <div className="px-4 py-3 border-b border-white/5">
                                        <p className="text-white text-sm font-medium truncate">{user?.username || user?.email || 'User'}</p>
                                        <p className="text-gray-500 text-xs truncate">{user?.email}</p>
                                    </div>
                                    <Link
                                        to="/watchlist"
                                        onClick={() => setDropdownOpen(false)}
                                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        <BookmarkSolidIcon className="w-4 h-4" />
                                        My Watchlist
                                    </Link>
                                    <Link
                                        to="/ratings"
                                        onClick={() => setDropdownOpen(false)}
                                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                                    >
                                        <StarIcon className="w-4 h-4 text-yellow-400" />
                                        My Ratings
                                    </Link>
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                                    >
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link
                            to="/login"
                            className="bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
                        >
                            Sign In
                        </Link>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
