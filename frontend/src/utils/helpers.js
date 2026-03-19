/**
 * Build a full TMDB poster URL from a poster_path string.
 * @param {string|null} posterPath - e.g. "/rFhKkXhk7ClU03jQ5rHIApJDwev.jpg"
 * @param {string} size - TMDB image size (default w500)
 * @returns {string} Full image URL or a placeholder
 */
export const posterUrl = (posterPath, size = 'w500') => {
    if (!posterPath) return 'https://placehold.co/500x750/1f1f1f/808080?text=No+Image';
    return `https://image.tmdb.org/t/p/${size}${posterPath}`;
};

/**
 * Build a full TMDB backdrop URL from a backdrop_path string.
 * @param {string|null} backdropPath
 * @param {string} size
 */
export const backdropUrl = (backdropPath, size = 'original') => {
    if (!backdropPath) return null;
    return `https://image.tmdb.org/t/p/${size}${backdropPath}`;
};

/**
 * Format a numeric score (1–5) into a star string.
 * @param {number} score
 * @returns {string} e.g. "★★★☆☆"
 */
export const formatStars = (score) => {
    const filled = Math.round(score ?? 0);
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
};

/**
 * Format a runtime in minutes to "Xh Ym".
 * @param {number|null} minutes
 */
export const formatRuntime = (minutes) => {
    if (!minutes) return 'N/A';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/**
 * Extract the 4-digit year from a date string.
 * @param {string|null} dateStr
 */
export const extractYear = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).getFullYear();
};

/**
 * Truncate a string to maxLength characters.
 * @param {string} str
 * @param {number} maxLength
 */
export const truncate = (str, maxLength = 120) => {
    if (!str) return '';
    return str.length > maxLength ? str.slice(0, maxLength).trimEnd() + '…' : str;
};
