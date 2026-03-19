import { useState } from 'react';
import { StarIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutline } from '@heroicons/react/24/outline';
import { submitRating, deleteRating } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

/**
 * Interactive 1–5 star rating component.
 *
 * Props:
 *  - contentId    {number}  – ID of the content item
 *  - contentType  {string}  – 'movie' | 'tvshow'
 *  - initialRating {number|null} – already-submitted rating (or null)
 *  - onRated      {(score) => void} – callback after successful rate
 *  - readonly     {boolean} – render without interaction (for display only)
 */
const RatingStars = ({
    contentId,
    contentType = 'movie',
    initialRating = null,
    onRated,
    readonly = false,
}) => {
    const { isAuthenticated } = useAuth();
    const [hovered, setHovered] = useState(0);
    const [rating, setRating] = useState(initialRating);
    const [loading, setLoading] = useState(false);

    const active = hovered || rating || 0;

    const handleRate = async (score) => {
        if (!isAuthenticated) {
            toast.error('Sign in to rate content.');
            return;
        }
        if (loading) return;
        setLoading(true);
        try {
            if (rating === score) {
                // Toggle off — delete the rating
                await deleteRating(contentId, contentType);
                setRating(null);
                toast.success('Rating removed.');
                onRated?.(null);
            } else {
                await submitRating(contentId, contentType, score);
                setRating(score);
                toast.success(`Rated ${score}/5 ⭐`);
                onRated?.(score);
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Rating failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => {
                const filled = star <= active;
                return readonly ? (
                    <span key={star}>
                        {filled ? (
                            <StarIcon className="w-5 h-5 text-yellow-400" />
                        ) : (
                            <StarOutline className="w-5 h-5 text-gray-600" />
                        )}
                    </span>
                ) : (
                    <button
                        key={star}
                        onMouseEnter={() => setHovered(star)}
                        onMouseLeave={() => setHovered(0)}
                        onClick={() => handleRate(star)}
                        disabled={loading}
                        className="transition-transform hover:scale-125 disabled:cursor-not-allowed"
                        aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                    >
                        {filled ? (
                            <StarIcon className="w-6 h-6 text-yellow-400 drop-shadow-sm" />
                        ) : (
                            <StarOutline className="w-6 h-6 text-gray-500 hover:text-yellow-300 transition-colors" />
                        )}
                    </button>
                );
            })}
            {rating && !readonly && (
                <span className="ml-1 text-xs text-gray-500">{rating}/5</span>
            )}
        </div>
    );
};

export default RatingStars;
