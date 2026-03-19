import { useState, useEffect } from 'react';
import { InformationCircleIcon, PlayIcon } from '@heroicons/react/24/solid';
import { useNavigate } from 'react-router-dom';
import MovieRow from '../components/MovieRow';
import { getMovies, getRecommendations, getPopularContent } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { backdropUrl, posterUrl, truncate, extractYear } from '../utils/helpers';

const Home = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();

    const [movies, setMovies] = useState([]);
    const [recommended, setRecommended] = useState([]);
    const [hero, setHero] = useState(null);
    const [loadingMovies, setLoadingMovies] = useState(true);
    const [loadingRec, setLoadingRec] = useState(true);

    useEffect(() => {
        // Fetch trending movies
        setLoadingMovies(true);
        getMovies('IN')
            .then((response) => {
                const items = response.data?.data || [];
                setMovies(items);
                // Pick hero from first item that has a backdrop
                const heroItem = items.find((m) => m.backdrop_path) || items[0];
                setHero(heroItem || null);
            })
            .catch((err) => { 
                console.error('Movies API Error:', err);
            })
            .finally(() => setLoadingMovies(false));
    }, []);

    useEffect(() => {
        // Fetch recommendations or popular
        setLoadingRec(true);
        const fetch = isAuthenticated ? getRecommendations : () => getPopularContent('IN');
        fetch()
            .then((response) => {
                const items = response.data?.data || [];
                setRecommended(items);
            })
            .catch((err) => { 
                console.error('Recommendations API Error:', err);
            })
            .finally(() => setLoadingRec(false));
    }, [isAuthenticated]);

    return (
        <div className="min-h-screen bg-[#141414]">
            {/* Hero Section */}
            {hero ? (
                <div className="relative h-[70vh] min-h-[500px] w-full overflow-hidden">
                    {/* Backdrop */}
                    <img
                        src={backdropUrl(hero.backdrop_path) || posterUrl(hero.poster_path, 'w780')}
                        alt={hero.title || hero.name}
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                    {/* Gradient overlays */}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/60 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-black/30" />

                    {/* Hero Content */}
                    <div className="absolute bottom-0 left-0 px-8 pb-16 max-w-xl">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-3 drop-shadow-lg">
                            {hero.title || hero.name}
                        </h1>
                        <div className="flex items-center gap-3 text-sm text-gray-300 mb-4">
                            {hero.vote_average && (
                                <span className="text-yellow-400 font-bold">⭐ {Number(hero.vote_average).toFixed(1)}</span>
                            )}
                            <span>{extractYear(hero.release_date || hero.first_air_date)}</span>
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed mb-6">
                            {truncate(hero.overview, 180)}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => navigate(`/movie/${hero.id}`)}
                                className="flex items-center gap-2 bg-white text-black font-bold px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                <PlayIcon className="w-5 h-5" />
                                More Info
                            </button>
                            <button
                                onClick={() => navigate(`/movie/${hero.id}`)}
                                className="flex items-center gap-2 bg-white/20 border border-white/30 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-white/30 transition-colors backdrop-blur-sm"
                            >
                                <InformationCircleIcon className="w-5 h-5" />
                                Details
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* Hero skeleton */
                <div className="h-[70vh] min-h-[500px] bg-[#1f1f1f] animate-pulse" />
            )}

            {/* Content Rows */}
            <div className="pt-6 pb-16">
                <MovieRow
                    title="🔥 Trending in India"
                    items={movies}
                    contentType="movie"
                    loading={loadingMovies}
                />
                <MovieRow
                    title={isAuthenticated ? '✨ Recommended for You' : '🌟 Popular Right Now'}
                    items={recommended}
                    contentType="movie"
                    loading={loadingRec}
                />
            </div>
        </div>
    );
};

export default Home;
