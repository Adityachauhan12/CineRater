import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { verifyOTP, setTokens, clearTokens, getAccessToken } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true); // resolving persisted session

    // On mount: restore session from localStorage
    useEffect(() => {
        const token = getAccessToken();
        const storedUser = localStorage.getItem('user');
        if (token && storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch {
                clearTokens();
                localStorage.removeItem('user');
            }
        }
        setLoading(false);
    }, []);

    // Listen for forced logout event dispatched by the API interceptor
    useEffect(() => {
        const handleForceLogout = () => logout();
        window.addEventListener('auth:logout', handleForceLogout);
        return () => window.removeEventListener('auth:logout', handleForceLogout);
    }, []);

    /**
     * Complete OTP login: store tokens + user, update state.
     * @param {string} email
     * @param {string} otp
     */
    const login = useCallback(async (email, otp) => {
        const { data } = await verifyOTP(email, otp);
        // Backend returns: { success, access, refresh, is_new_user }
        const { access, refresh } = data;
        setTokens(access, refresh);
        const userObj = { email };
        localStorage.setItem('user', JSON.stringify(userObj));
        setUser(userObj);
        return userObj;
    }, []);

    /**
     * Store tokens and user directly (for email+password login).
     * @param {string} email
     * @param {string} access
     * @param {string} refresh
     */
    const loginWithTokens = useCallback((email, access, refresh) => {
        setTokens(access, refresh);
        const userObj = { email };
        localStorage.setItem('user', JSON.stringify(userObj));
        setUser(userObj);
        return userObj;
    }, []);

    /**
     * Clear all auth state and tokens.
     */
    const logout = useCallback(() => {
        clearTokens();
        localStorage.removeItem('user');
        setUser(null);
    }, []);

    const value = {
        user,
        login,
        loginWithTokens,
        logout,
        isAuthenticated: Boolean(user),
        loading,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};

export default AuthContext;
