import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import MovieDetail from './pages/MovieDetail';
import Watchlist from './pages/Watchlist';
import MyRatings from './pages/MyRatings';
import Chat from './pages/Chat';
import Browse from './pages/Browse';
import Recommendations from './pages/Recommendations';
import Import from './pages/Import';

// Cinematic page transition wrapper
const PageTransition = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
    exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
    transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
  >
    {children}
  </motion.div>
);

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    if (loading) return null;
    return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const AppRoutes = () => {
    const location = useLocation();

    return (
        <>
            {location.pathname !== '/chat' && <Navbar />}
            <AnimatePresence mode="wait">
                <Routes location={location} key={location.pathname}>
                    <Route path="/" element={<PageTransition><Home /></PageTransition>} />
                    <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
                    <Route path="/movie/:id" element={<PageTransition><MovieDetail /></PageTransition>} />
                    <Route path="/tvshow/:id" element={<PageTransition><MovieDetail /></PageTransition>} />
                    <Route
                        path="/watchlist"
                        element={
                            <ProtectedRoute>
                                <PageTransition><Watchlist /></PageTransition>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/chat"
                        element={
                            <ProtectedRoute>
                                <PageTransition><Chat /></PageTransition>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/ratings"
                        element={
                            <ProtectedRoute>
                                <PageTransition><MyRatings /></PageTransition>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/browse"
                        element={
                            <ProtectedRoute>
                                <PageTransition><Browse /></PageTransition>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/recommendations"
                        element={
                            <ProtectedRoute>
                                <PageTransition><Recommendations /></PageTransition>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/import"
                        element={
                            <ProtectedRoute>
                                <PageTransition><Import /></PageTransition>
                            </ProtectedRoute>
                        }
                    />
                    {/* Catch-all */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AnimatePresence>
        </>
    );
};

const App = () => (
    <AuthProvider>
        <AppRoutes />
        <Toaster
            position="bottom-right"
            toastOptions={{
                duration: 3000,
                style: {
                    background: '#1f1f1f',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    fontSize: '14px',
                },
                success: { iconTheme: { primary: '#E50914', secondary: '#fff' } },
                error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
            }}
        />
    </AuthProvider>
);

export default App;
