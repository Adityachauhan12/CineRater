import { useState } from 'react';
import { StarIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutline } from '@heroicons/react/24/outline';
import { submitRating, deleteRating } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

/**
 * Interactive 1–10 star rating component.
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
                await deleteRating(contentId, contentType);
                setRating(null);
                toast.success('Rating removed.');
                onRated?.(null);
            } else {
                await submitRating(contentId, contentType, score);
                setRating(score);
                toast.success(`Rated ${score}/10 ⭐`);
                onRated?.(score);
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Rating failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => {
                const filled = star <= active;
                return readonly ? (
                    <span key={star}>
                        {filled ? (
                            <StarIcon className="w-4 h-4 text-gold" />
                        ) : (
                            <StarOutline className="w-4 h-4 text-ink-muted" />
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
                        aria-label={`Rate ${star}`}
                    >
                        {filled ? (
                            <StarIcon className="w-5 h-5 text-gold drop-shadow-sm" />
                        ) : (
                            <StarOutline className="w-5 h-5 text-ink-muted hover:text-gold/60 transition-colors" />
                        )}
                    </button>
                );
            })}
            {rating && !readonly && (
                <span className="ml-2 text-xs text-ink-muted">{rating}/10</span>
            )}
        </div>
    );
};

export default RatingStars;
