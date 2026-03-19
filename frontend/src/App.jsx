import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import MovieDetail from './pages/MovieDetail';
import Watchlist from './pages/Watchlist';
import MyRatings from './pages/MyRatings';
import Chat from './pages/Chat';
import Browse from './pages/Browse';

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    if (loading) return null;
    return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const AppRoutes = () => (
    <>
        <Navbar />
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/movie/:id" element={<MovieDetail />} />
            <Route path="/tvshow/:id" element={<MovieDetail />} />
            <Route
                path="/watchlist"
                element={
                    <ProtectedRoute>
                        <Watchlist />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/chat"
                element={
                    <ProtectedRoute>
                        <Chat />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/ratings"
                element={
                    <ProtectedRoute>
                        <MyRatings />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/browse"
                element={
                    <ProtectedRoute>
                        <Browse />
                    </ProtectedRoute>
                }
            />
            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    </>
);

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
