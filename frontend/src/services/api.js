import axios from 'axios';

// ─── Axios Instance ──────────────────────────────────────────────────────────

const api = axios.create({
    baseURL: 'http://127.0.0.1:8000/api',
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAccessToken = () => localStorage.getItem('access_token');
const getRefreshToken = () => localStorage.getItem('refresh_token');

const setTokens = (access, refresh) => {
    localStorage.setItem('access_token', access);
    if (refresh) localStorage.setItem('refresh_token', refresh);
};

const clearTokens = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
};

// ─── Request Interceptor: Attach JWT ─────────────────────────────────────────

api.interceptors.request.use(
    (config) => {
        const token = getAccessToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// ─── Response Interceptor: Auto-Refresh on 401 ───────────────────────────────

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If 401 and not already retried and not a refresh endpoint itself
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url.includes('/auth/token/refresh/')
        ) {
            if (isRefreshing) {
                // Queue the request until token refresh completes
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                        return api(originalRequest);
                    })
                    .catch((err) => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const refresh = getRefreshToken();

            if (!refresh) {
                clearTokens();
                window.dispatchEvent(new Event('auth:logout'));
                return Promise.reject(error);
            }

            try {
                const { data } = await axios.post(
                    'http://127.0.0.1:8000/api/auth/token/refresh/',
                    { refresh }
                );
                const newAccess = data.access;
                setTokens(newAccess, data.refresh ?? refresh);
                api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
                processQueue(null, newAccess);
                originalRequest.headers.Authorization = `Bearer ${newAccess}`;
                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                clearTokens();
                window.dispatchEvent(new Event('auth:logout'));
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Send OTP to the given email.
 * @param {string} email
 */
export const sendOTP = (email) =>
    api.post('/auth/otp/send/', { email });

/**
 * Verify OTP and returns JWT tokens + user info.
 * @param {string} email
 * @param {string} otp
 */
export const verifyOTP = (email, otp) =>
    api.post('/auth/otp/verify/', { email, otp });

/**
 * Login with email and password.
 * @param {string} email
 * @param {string} password
 */
export const loginWithPassword = (email, password) =>
    api.post('/auth/login/', { email, password });

/**
 * Send a password-reset OTP to the given email.
 * @param {string} email
 */
export const forgotPasswordSendOTP = (email) =>
    api.post('/auth/password/reset/send-otp/', { email });

/**
 * Reset password using the OTP received via email.
 * @param {string} email
 * @param {string} otp
 * @param {string} new_password
 */
export const resetPassword = (email, otp, new_password) =>
    api.post('/auth/password/reset/', { email, otp, new_password });

/**
 * Login with Google OAuth token.
 * @param {string} token - Google ID token
 */
export const googleLogin = (token) =>
    api.post('/auth/google/', { token });

// ─── Movies ──────────────────────────────────────────────────────────────────

/**
 * Fetch movies list. Optionally filter by region (e.g. 'IN').
 * @param {string} [region]
 */
export const getMovies = (region = 'IN') =>
    api.get('/movies/', { params: { region } });

/**
 * Fetch a single movie by ID (includes user_rating, in_watchlist if authenticated).
 * @param {number|string} id
 */
export const getMovieDetail = (id) =>
    api.get(`/movies/${id}/`);

// ─── TV Shows ────────────────────────────────────────────────────────────────

/**
 * Fetch TV shows list. Optionally filter by region.
 * @param {string} [region]
 */
export const getTVShows = (region = 'IN') =>
    api.get('/tvshows/', { params: { region } });

export const getTVShowDetail = (id) =>
    api.get(`/tvshows/${id}/`);

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Full-text search across movies and TV shows.
 * @param {string} query
 */
export const searchContent = (query) =>
    api.get('/content/search/', { params: { q: query } });

// ─── Ratings ─────────────────────────────────────────────────────────────────

/**
 * Submit or update a rating.
 * @param {number|string} id  - Content ID
 * @param {string} content_type - 'movie' | 'tvshow'
 * @param {number} score        - 1–5
 */
export const submitRating = (id, content_type, score) =>
    api.post(`/content/${id}/rate/`, { content_type, score });

/**
 * Delete a user's rating for a piece of content.
 * @param {number|string} id
 * @param {string} content_type
 */
export const deleteRating = (id, content_type) =>
    api.delete(`/content/${id}/rate/delete/`, { data: { content_type } });

/**
 * Fetch all ratings for a content item.
 * @param {number|string} id
 * @param {string} content_type
 */
export const getRatings = (id, content_type) =>
    api.get(`/content/${id}/ratings/`, { params: { content_type } });

export const getUserRatings = (page = 1, filter = 'all', sort = 'recent') =>
    api.get('/user/ratings/', { params: { page, filter, sort } });

// ─── Watchlist ────────────────────────────────────────────────────────────────

/**
 * Fetch the authenticated user's full watchlist.
 */
export const getWatchlist = () =>
    api.get('/watchlist/');

/**
 * Add a content item to the watchlist.
 * @param {number|string} content_id
 * @param {string} content_type - 'movie' | 'tvshow'
 */
export const addToWatchlist = (content_id, content_type) =>
    api.post('/watchlist/add/', { content_id, content_type });

/**
 * Remove an item from the watchlist.
 * @param {number|string} id   - Watchlist entry ID
 * @param {string} content_type
 */
export const removeFromWatchlist = (id, content_type) =>
    api.delete(`/watchlist/${id}/`, { params: { content_type } });

// ─── Semantic Search ─────────────────────────────────────────────────────────

/**
 * AI-powered semantic search. Re-ranks TMDB results by embedding similarity.
 * Auth required. Returns results sorted by relevance to the natural-language query.
 * @param {string} query - e.g. "slow burn psychological thriller"
 * @param {number} [limit]
 */
export const semanticSearch = (query, limit = 10) =>
    api.post('/content/semantic-search/', { query, limit });

// ─── Browse ──────────────────────────────────────────────────────────────────

/**
 * Browse movies or TV shows with optional genre filter.
 * @param {string} type - 'movie' | 'tvshow'
 * @param {number} [genre] - TMDB genre ID (0 = all)
 * @param {number} [page]
 */
export const browseContent = (type = 'movie', genre = 0, page = 1) =>
    api.get('/content/browse/', { params: { type, genre, page } });

// ─── Recommendations ─────────────────────────────────────────────────────────

/**
 * Get AI-powered personalized recommendations (auth required).
 */
export const getRecommendations = () =>
    api.get('/recommendations/');

/**
 * Get popular content — no auth required.
 * @param {string} [region]
 */
export const getPopularContent = (region = 'IN') =>
    api.get('/recommendations/popular/', { params: { region } });

/**
 * Import IMDB ratings or watchlist from a CSV file.
 * @param {File} file - The CSV file from IMDB export
 * @param {'ratings'|'watchlist'} importType
 */
export const importFromImdb = (file, importType) => {
    const form = new FormData();
    form.append('file', file);
    form.append('import_type', importType);
    return api.post('/import/imdb/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,  // 2 min — 1000 items can take ~15s but give headroom
    });
};

// ─── Chat Sessions ────────────────────────────────────────────────────────────

/** List all chat sessions for the current user. */
export const getChatSessions = () =>
    api.get('/chat/sessions/');

/**
 * Create a new chat session.
 * @param {string} title - derived from the first message
 */
export const createChatSession = (title) =>
    api.post('/chat/sessions/', { title });

/** Delete a chat session and all its messages. */
export const deleteChatSession = (id) =>
    api.delete(`/chat/sessions/${id}/`);

/** Get all messages for a session. */
export const getChatMessages = (sessionId) =>
    api.get(`/chat/sessions/${sessionId}/messages/`);

/**
 * Append messages to a session after a stream completes.
 * @param {number} sessionId
 * @param {Array<{role: string, content: string}>} messages
 */
export const saveChatMessages = (sessionId, messages) =>
    api.post(`/chat/sessions/${sessionId}/messages/`, { messages });

// ─── Reviews + RAG Q&A ───────────────────────────────────────────────────────

/**
 * Get all reviews for a piece of content.
 * @param {number|string} id
 * @param {string} content_type - 'movie' | 'tvshow'
 */
export const getReviews = (id, content_type) =>
    api.get(`/content/${id}/reviews/`, { params: { content_type } });

/**
 * Submit (create or update) a review.
 * @param {number|string} id
 * @param {string} content_type
 * @param {string} body - review text
 */
export const submitReview = (id, content_type, body) =>
    api.post(`/content/${id}/reviews/`, { content_type, body });

/**
 * Delete a review by its ID.
 * @param {number|string} contentId
 * @param {number|string} reviewId
 */
export const deleteReview = (contentId, reviewId) =>
    api.delete(`/content/${contentId}/reviews/${reviewId}/`);

/**
 * Ask a RAG-powered question about a movie/show based on user reviews.
 * @param {number|string} id
 * @param {string} content_type
 * @param {string} title
 * @param {string} question
 */
export const askQuestion = (id, content_type, title, question) =>
    api.post(`/content/${id}/ask/`, { content_type, title, question });

// ─── Token Utilities (used by AuthContext) ────────────────────────────────────

export { setTokens, clearTokens, getAccessToken, getRefreshToken };

export default api;
