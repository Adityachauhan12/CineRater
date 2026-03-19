import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeftIcon, ClockIcon, CalendarIcon, StarIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { getMovieDetail, getTVShowDetail } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { backdropUrl, posterUrl, formatRuntime, extractYear } from '../utils/helpers';
import RatingStars from '../components/RatingStars';
import WatchlistButton from '../components/WatchlistButton';

const MovieDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated } = useAuth();

    const isTVShow = location.pathname.startsWith('/tvshow/');
    const contentType = isTVShow ? 'tvshow' : 'movie';

    const [movie, setMovie] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        const fetch = isTVShow ? getTVShowDetail(id) : getMovieDetail(id);
        fetch
            .then(({ data }) => setMovie(data.data))
            .catch(() => setError(isTVShow ? 'TV show not found.' : 'Movie not found.'))
            .finally(() => setLoading(false));
    }, [id, isTVShow]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#141414] animate-pulse">
                <div className="h-[55vh] bg-[#1f1f1f]" />
                <div className="max-w-5xl mx-auto px-6 py-10 space-y-4">
                    <div className="h-10 bg-[#1f1f1f] rounded w-1/2" />
                    <div className="h-4 bg-[#1f1f1f] rounded w-1/4" />
                    <div className="h-24 bg-[#1f1f1f] rounded" />
                </div>
            </div>
        );
    }

    if (error || !movie) {
        return (
            <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center gap-4">
                <p className="text-gray-400 text-lg">{error || 'Unable to load movie.'}</p>
                <button
                    onClick={() => navigate('/')}
                    className="text-red-400 hover:text-red-300 underline text-sm"
                >
                    Back to Home
                </button>
            </div>
        );
    }

    const {
        title: rawTitle,
        name,
        overview,
        backdrop_path,
        poster_path,
        vote_average,
        vote_count,
        release_date: rawReleaseDate,
        first_air_date,
        runtime,
        genres = [],
        user_rating,
        in_watchlist,
        watchlist_id,
        cast = [],
        director,
        created_by = [],
        tagline,
    } = movie;

    const title = rawTitle || name;
    const release_date = rawReleaseDate || first_air_date;

    const bgImage = backdropUrl(backdrop_path) || posterUrl(poster_path, 'w780');

    return (
        <div className="min-h-screen bg-[#141414]">
            {/* Hero backdrop */}
            <div className="relative h-[55vh] min-h-[400px] w-full overflow-hidden">
                <img src={bgImage} alt={title} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/50 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-black/20 to-transparent" />

                {/* Back button */}
                <button
                    onClick={() => navigate(-1)}
                    className="absolute top-20 left-6 flex items-center gap-2 text-gray-300 hover:text-white transition-colors bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm"
                >
                    <ArrowLeftIcon className="w-4 h-4" />
                    Back
                </button>
            </div>

            {/* Content area */}
            <div className="max-w-5xl mx-auto px-6 -mt-24 relative z-10 pb-20">
                <div className="flex gap-8 items-start">
                    {/* Poster (visible on md+) */}
                    <div className="hidden md:block flex-shrink-0">
                        <img
                            src={posterUrl(poster_path)}
                            alt={title}
                            className="w-48 rounded-xl shadow-2xl border border-white/10"
                        />
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                        <h1 className="text-4xl font-extrabold text-white leading-tight mb-2">{title}</h1>

                        {/* Meta badges */}
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            {vote_average && (
                                <div className="flex items-center gap-1 bg-yellow-500/20 border border-yellow-500/30 px-2.5 py-1 rounded-lg">
                                    <StarSolid className="w-4 h-4 text-yellow-400" />
                                    <span className="text-yellow-400 font-bold text-sm">{Number(vote_average).toFixed(1)}</span>
                                    {vote_count && <span className="text-gray-500 text-xs ml-1">({vote_count.toLocaleString()})</span>}
                                </div>
                            )}
                            {release_date && (
                                <div className="flex items-center gap-1.5 text-gray-400 text-sm">
                                    <CalendarIcon className="w-4 h-4" />
                                    {extractYear(release_date)}
                                </div>
                            )}
                            {runtime && (
                                <div className="flex items-center gap-1.5 text-gray-400 text-sm">
                                    <ClockIcon className="w-4 h-4" />
                                    {formatRuntime(runtime)}
                                </div>
                            )}
                        </div>

                        {/* Genres */}
                        {genres.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-5">
                                {genres.map((g) => (
                                    <span
                                        key={g.id || g}
                                        className="bg-white/10 border border-white/10 text-gray-300 text-xs px-3 py-1 rounded-full"
                                    >
                                        {g.name || g}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Tagline */}
                        {tagline && (
                            <p className="text-gray-500 italic text-sm mb-3">"{tagline}"</p>
                        )}

                        {/* Overview */}
                        {overview && (
                            <p className="text-gray-300 text-sm leading-relaxed mb-5 max-w-2xl">{overview}</p>
                        )}

                        {/* Director / Creator */}
                        {(director || created_by.length > 0) && (
                            <p className="text-sm text-gray-400 mb-6">
                                <span className="text-gray-500">{director ? 'Director' : 'Created by'}: </span>
                                <span className="text-white font-medium">
                                    {director || created_by.map((c) => c.name).join(', ')}
                                </span>
                            </p>
                        )}

                        {/* Rating + Watchlist */}
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-gray-400 mb-2 font-medium">
                                    {isAuthenticated ? 'Your Rating' : 'Rating (sign in to rate)'}
                                </p>
                                <RatingStars
                                    contentId={id}
                                    contentType={contentType}
                                    initialRating={user_rating ?? null}
                                    readonly={!isAuthenticated}
                                    onRated={(score) => setMovie((m) => ({ ...m, user_rating: score }))}
                                />
                            </div>

                            <WatchlistButton
                                contentId={id}
                                contentType={contentType}
                                inWatchlist={in_watchlist}
                                watchlistId={watchlist_id}
                            />
                        </div>
                    </div>
                </div>

                {/* Cast */}
                {cast.length > 0 && (
                    <div className="mt-10">
                        <h2 className="text-white font-semibold text-lg mb-4">Cast</h2>
                        <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
                            {cast.map((person) => (
                                <div key={person.id} className="flex-shrink-0 w-28 text-center">
                                    <div className="w-28 h-36 rounded-xl overflow-hidden bg-white/10 mb-2">
                                        {person.profile_path ? (
                                            <img
                                                src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                                                alt={person.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">
                                                👤
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-white text-xs font-medium leading-tight truncate">{person.name}</p>
                                    {person.character && (
                                        <p className="text-gray-500 text-xs truncate mt-0.5">{person.character}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MovieDetail;
