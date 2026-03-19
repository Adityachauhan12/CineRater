import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    sendOTP,
    loginWithPassword,
    forgotPasswordSendOTP,
    resetPassword,
} from '../services/api';
import GoogleOAuthButton from '../components/GoogleOAuthButton';
import toast from 'react-hot-toast';
import {
    FilmIcon,
    EnvelopeIcon,
    LockClosedIcon,
    EyeIcon,
    EyeSlashIcon,
} from '@heroicons/react/24/outline';

// ─── mode constants ──────────────────────────────────────────────────────────
const MODE = {
    LOGIN: 'login',           // email + password
    OTP_LOGIN: 'otp_login',  // passwordless OTP (step 1 = email, step 2 = otp)
    FORGOT: 'forgot',         // forgot password: enter email
    RESET_OTP: 'reset_otp',  // forgot password: enter OTP
    RESET_PASS: 'reset_pass', // forgot password: enter new password
};

// ─── helpers ─────────────────────────────────────────────────────────────────
const apiError = (err, fallback = 'Something went wrong.') => {
    const d = err?.response?.data;
    if (!d) return fallback;
    if (typeof d.message === 'string') return d.message;
    if (typeof d.detail === 'string') return d.detail;
    // flatten DRF nested errors
    if (typeof d.message === 'object') {
        const first = Object.values(d.message)[0];
        return Array.isArray(first) ? first[0] : String(first);
    }
    return fallback;
};

// ─── sub-components ──────────────────────────────────────────────────────────

const InputField = ({ icon: Icon, label, ...props }) => (
    <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            {label}
        </label>
        <div className="relative">
            {Icon && (
                <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            )}
            <input
                {...props}
                className={`w-full bg-[#252525] border border-white/10 rounded-xl py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition text-sm ${Icon ? 'pl-10 pr-4' : 'px-4'} ${props.className || ''}`}
            />
        </div>
    </div>
);

const SubmitBtn = ({ loading, label, loadingLabel }) => (
    <button
        type="submit"
        disabled={loading}
        className="w-full bg-red-600 hover:bg-red-500 active:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm mt-1"
    >
        {loading ? (
            <>
                <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                {loadingLabel}
            </>
        ) : label}
    </button>
);

const BackBtn = ({ onClick, label = '← Back' }) => (
    <button
        type="button"
        onClick={onClick}
        className="w-full text-sm text-gray-500 hover:text-gray-300 transition py-1 text-center"
    >
        {label}
    </button>
);

const OtpInput = ({ value, onChange }) => (
    <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            6-digit code
        </label>
        <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
            placeholder="––––––"
            autoFocus
            className="w-full bg-[#252525] border border-white/10 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.75em] placeholder-gray-700 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition"
        />
    </div>
);

// ─── main component ──────────────────────────────────────────────────────────
const Login = () => {
    const navigate = useNavigate();
    const { login, loginWithTokens } = useAuth();

    const [mode, setMode]     = useState(MODE.LOGIN);
    const [email, setEmail]   = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp]       = useState('');
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [showNewPass, setShowNewPass] = useState(false);
    const [loading, setLoading] = useState(false);

    const resetAll = () => {
        setOtp('');
        setPassword('');
        setNewPass('');
        setConfirmPass('');
    };

    // ── email + password login ──────────────────────────────────────────────
    const handlePasswordLogin = async (e) => {
        e.preventDefault();
        if (!email.trim() || !password) return;
        setLoading(true);
        try {
            const { data } = await loginWithPassword(email.trim(), password);
            loginWithTokens(email.trim(), data.access, data.refresh);
            toast.success('Welcome back! 🎬');
            navigate('/');
        } catch (err) {
            toast.error(apiError(err, 'Invalid email or password.'));
        } finally {
            setLoading(false);
        }
    };

    // ── OTP login: send ────────────────────────────────────────────────────
    const handleSendOTP = async (e) => {
        e.preventDefault();
        if (!email.trim()) return toast.error('Please enter your email.');
        setLoading(true);
        try {
            await sendOTP(email.trim());
            toast.success('OTP sent! Check your inbox.');
            setMode(MODE.OTP_LOGIN + '_verify'); // new sub-step
        } catch (err) {
            toast.error(apiError(err, 'Failed to send OTP.'));
        } finally {
            setLoading(false);
        }
    };

    // ── OTP login: verify ──────────────────────────────────────────────────
    const handleVerifyOTP = async (e) => {
        e.preventDefault();
        if (otp.trim().length < 6) return toast.error('Enter the 6-digit OTP.');
        setLoading(true);
        try {
            await login(email.trim(), otp.trim());
            toast.success('Welcome to CineRater! 🎬');
            navigate('/');
        } catch (err) {
            toast.error(apiError(err, 'Invalid or expired OTP.'));
        } finally {
            setLoading(false);
        }
    };

    // ── forgot password: send OTP ──────────────────────────────────────────
    const handleForgotSendOTP = async (e) => {
        e.preventDefault();
        if (!email.trim()) return toast.error('Please enter your email.');
        setLoading(true);
        try {
            await forgotPasswordSendOTP(email.trim());
            toast.success('Reset code sent! Check your inbox.');
            setOtp('');
            setMode(MODE.RESET_OTP);
        } catch (err) {
            toast.error(apiError(err, 'Failed to send reset code.'));
        } finally {
            setLoading(false);
        }
    };

    // ── forgot password: verify OTP ────────────────────────────────────────
    const handleResetVerifyOTP = (e) => {
        e.preventDefault();
        if (otp.trim().length < 6) return toast.error('Enter the 6-digit code.');
        setMode(MODE.RESET_PASS);
    };

    // ── forgot password: set new password ──────────────────────────────────
    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (newPass.length < 6) return toast.error('Password must be at least 6 characters.');
        if (newPass !== confirmPass) return toast.error("Passwords don't match.");
        setLoading(true);
        try {
            await resetPassword(email.trim(), otp.trim(), newPass);
            toast.success('Password reset! You can now log in.');
            resetAll();
            setMode(MODE.LOGIN);
        } catch (err) {
            toast.error(apiError(err, 'Failed to reset password.'));
        } finally {
            setLoading(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // render helpers
    const isOtpLoginVerify = mode === MODE.OTP_LOGIN + '_verify';

    const stepInfo = {
        [MODE.LOGIN]: { title: 'Welcome back', subtitle: 'Sign in to your account' },
        [MODE.OTP_LOGIN]: { title: 'Passwordless login', subtitle: 'We\'ll email you a one-time code' },
        [MODE.OTP_LOGIN + '_verify']: { title: 'Check your email', subtitle: `Code sent to ${email}` },
        [MODE.FORGOT]: { title: 'Forgot password?', subtitle: 'Enter your email to get a reset code' },
        [MODE.RESET_OTP]: { title: 'Enter reset code', subtitle: `Code sent to ${email}` },
        [MODE.RESET_PASS]: { title: 'Set new password', subtitle: 'Choose a strong password' },
    };

    const { title, subtitle } = stepInfo[mode] || stepInfo[MODE.LOGIN];

    return (
        <div
            className="min-h-screen bg-[#0e0e0e] flex items-center justify-center px-4"
            style={{
                backgroundImage:
                    'radial-gradient(ellipse at 65% 35%, rgba(229,9,20,0.10) 0%, transparent 65%), radial-gradient(ellipse at 30% 80%, rgba(255,255,255,0.02) 0%, transparent 50%)',
            }}
        >
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-3">
                        <FilmIcon className="w-8 h-8 text-red-500" />
                        <span className="text-3xl font-bold text-white tracking-widest">CINERATER</span>
                    </div>
                    <p className="text-gray-500 text-sm">Rate. Discover. Watch.</p>
                </div>

                {/* Card */}
                <div className="bg-[#1a1a1a] rounded-2xl p-8 shadow-2xl border border-white/[0.06] backdrop-blur-sm">
                    {/* Heading */}
                    <div className="mb-7">
                        <h2 className="text-xl font-bold text-white">{title}</h2>
                        <p className="text-gray-500 text-sm mt-1">{subtitle}</p>
                    </div>

                    {/* ── EMAIL + PASSWORD LOGIN ─────────────────────────── */}
                    {mode === MODE.LOGIN && (
                        <form onSubmit={handlePasswordLogin} className="space-y-4">
                            <InputField
                                icon={EnvelopeIcon}
                                label="Email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                autoFocus
                            />
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                                    Password
                                </label>
                                <div className="relative">
                                    <LockClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                                    <input
                                        type={showPass ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="w-full bg-[#252525] border border-white/10 rounded-xl py-3 pl-10 pr-11 text-white placeholder-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPass((v) => !v)}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
                                    >
                                        {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex justify-end -mt-1">
                                <button
                                    type="button"
                                    onClick={() => { resetAll(); setMode(MODE.FORGOT); }}
                                    className="text-xs text-red-400 hover:text-red-300 transition"
                                >
                                    Forgot password?
                                </button>
                            </div>

                            <SubmitBtn loading={loading} label="Sign In →" loadingLabel="Signing in…" />

                            <div className="relative flex items-center gap-3 py-2">
                                <div className="flex-1 h-px bg-white/10" />
                                <span className="text-xs text-gray-600">or</span>
                                <div className="flex-1 h-px bg-white/10" />
                            </div>

                            <GoogleOAuthButton 
                                onSuccess={() => navigate('/')} 
                                disabled={loading}
                            />

                            <button
                                type="button"
                                onClick={() => { resetAll(); setMode(MODE.OTP_LOGIN); }}
                                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-medium py-3 rounded-xl transition text-sm"
                            >
                                Sign in with OTP instead
                            </button>
                        </form>
                    )}

                    {/* ── OTP LOGIN: enter email ─────────────────────────── */}
                    {mode === MODE.OTP_LOGIN && (
                        <form onSubmit={handleSendOTP} className="space-y-4">
                            <InputField
                                icon={EnvelopeIcon}
                                label="Email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                autoFocus
                            />
                            <SubmitBtn loading={loading} label="Send OTP →" loadingLabel="Sending…" />
                            <BackBtn onClick={() => setMode(MODE.LOGIN)} label="← Back to password login" />
                        </form>
                    )}

                    {/* ── OTP LOGIN: enter code ──────────────────────────── */}
                    {isOtpLoginVerify && (
                        <form onSubmit={handleVerifyOTP} className="space-y-4">
                            <OtpInput value={otp} onChange={setOtp} />
                            <SubmitBtn loading={loading} label="Verify & Sign In ✓" loadingLabel="Verifying…" />
                            <div className="flex justify-between text-xs text-gray-500">
                                <button
                                    type="button"
                                    onClick={() => { setOtp(''); setMode(MODE.OTP_LOGIN); }}
                                    className="hover:text-gray-300 transition"
                                >
                                    ← Change email
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSendOTP}
                                    disabled={loading}
                                    className="text-red-400 hover:text-red-300 transition"
                                >
                                    Resend code
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ── FORGOT PASSWORD: enter email ───────────────────── */}
                    {mode === MODE.FORGOT && (
                        <form onSubmit={handleForgotSendOTP} className="space-y-4">
                            <InputField
                                icon={EnvelopeIcon}
                                label="Email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                autoFocus
                            />
                            <SubmitBtn loading={loading} label="Send Reset Code →" loadingLabel="Sending…" />
                            <BackBtn onClick={() => setMode(MODE.LOGIN)} label="← Back to login" />
                        </form>
                    )}

                    {/* ── FORGOT PASSWORD: verify OTP ────────────────────── */}
                    {mode === MODE.RESET_OTP && (
                        <form onSubmit={handleResetVerifyOTP} className="space-y-4">
                            <OtpInput value={otp} onChange={setOtp} />
                            <SubmitBtn loading={loading} label="Verify Code →" loadingLabel="Verifying…" />
                            <div className="flex justify-between text-xs text-gray-500">
                                <button
                                    type="button"
                                    onClick={() => { setOtp(''); setMode(MODE.FORGOT); }}
                                    className="hover:text-gray-300 transition"
                                >
                                    ← Change email
                                </button>
                                <button
                                    type="button"
                                    onClick={handleForgotSendOTP}
                                    disabled={loading}
                                    className="text-red-400 hover:text-red-300 transition"
                                >
                                    Resend code
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ── FORGOT PASSWORD: set new password ──────────────── */}
                    {mode === MODE.RESET_PASS && (
                        <form onSubmit={handleResetPassword} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                                    New Password
                                </label>
                                <div className="relative">
                                    <LockClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                                    <input
                                        type={showNewPass ? 'text' : 'password'}
                                        value={newPass}
                                        onChange={(e) => setNewPass(e.target.value)}
                                        placeholder="Min. 6 characters"
                                        required
                                        autoFocus
                                        className="w-full bg-[#252525] border border-white/10 rounded-xl py-3 pl-10 pr-11 text-white placeholder-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPass((v) => !v)}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
                                    >
                                        {showNewPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            <InputField
                                icon={LockClosedIcon}
                                label="Confirm Password"
                                type="password"
                                value={confirmPass}
                                onChange={(e) => setConfirmPass(e.target.value)}
                                placeholder="Repeat password"
                                required
                            />
                            <SubmitBtn loading={loading} label="Reset Password ✓" loadingLabel="Resetting…" />
                            <BackBtn onClick={() => setMode(MODE.RESET_OTP)} label="← Back to code entry" />
                        </form>
                    )}
                </div>

                <p className="text-center text-gray-700 text-xs mt-6">
                    No account yet? Just sign in — we'll create one for you via OTP.
                </p>
            </div>
        </div>
    );
};

export default Login;
