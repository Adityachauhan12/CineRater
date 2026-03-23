import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import {
  sendOTP, loginWithPassword,
  forgotPasswordSendOTP, resetPassword,
} from '../services/api';
import GoogleOAuthButton from '../components/GoogleOAuthButton';
import toast from 'react-hot-toast';
import {
  EnvelopeIcon, LockClosedIcon,
  EyeIcon, EyeSlashIcon, FilmIcon,
} from '@heroicons/react/24/outline';

const MODE = {
  LOGIN:      'login',
  OTP_LOGIN:  'otp_login',
  OTP_VERIFY: 'otp_verify',
  FORGOT:     'forgot',
  RESET_OTP:  'reset_otp',
  RESET_PASS: 'reset_pass',
};

const apiError = (err, fallback = 'Something went wrong.') => {
  const d = err?.response?.data;
  if (!d) return fallback;
  if (typeof d.message === 'string') return d.message;
  if (typeof d.detail  === 'string') return d.detail;
  if (typeof d.message === 'object') {
    const first = Object.values(d.message)[0];
    return Array.isArray(first) ? first[0] : String(first);
  }
  return fallback;
};

// ── shared input ────────────────────────────────────────────────────────────
const Field = ({ icon: Icon, label, type = 'text', right, ...props }) => (
  <div>
    <label className="block text-[11px] font-medium tracking-[0.12em] uppercase text-ink-muted mb-2">
      {label}
    </label>
    <div className="relative">
      {Icon && (
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
      )}
      <input
        type={type}
        {...props}
        className={`w-full bg-white/[0.04] border border-white/10 rounded-sm py-3 text-ink-primary placeholder-ink-muted text-sm
          focus:outline-none focus:border-gold/40 focus:bg-white/[0.06] transition-colors
          ${Icon ? 'pl-10' : 'px-4'} ${right ? 'pr-11' : 'pr-4'}`}
      />
      {right}
    </div>
  </div>
);

const SubmitBtn = ({ loading, label, loadingLabel }) => (
  <button
    type="submit"
    disabled={loading}
    className="w-full btn-gold justify-center py-3 rounded-sm text-sm disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {loading
      ? <><span className="w-4 h-4 border-2 border-void/30 border-t-void rounded-full animate-spin" />{loadingLabel}</>
      : label}
  </button>
);

const BackBtn = ({ onClick, label = '← Back' }) => (
  <button type="button" onClick={onClick}
    className="w-full text-xs text-ink-muted hover:text-ink-secondary transition-colors py-1 text-center">
    {label}
  </button>
);

const OtpInput = ({ value, onChange }) => (
  <div>
    <label className="block text-[11px] font-medium tracking-[0.12em] uppercase text-ink-muted mb-2">
      6-digit code
    </label>
    <input
      type="text" inputMode="numeric" maxLength={6} autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      placeholder="——————"
      className="w-full bg-white/[0.04] border border-white/10 rounded-sm px-4 py-3 text-ink-primary text-center text-2xl tracking-[0.6em] placeholder-ink-muted focus:outline-none focus:border-gold/40 transition-colors"
    />
  </div>
);

// ── main ────────────────────────────────────────────────────────────────────
const Login = () => {
  const navigate = useNavigate();
  const { login, loginWithTokens } = useAuth();

  const [mode, setMode]           = useState(MODE.LOGIN);
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [otp, setOtp]             = useState('');
  const [newPass, setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [showNew, setShowNew]     = useState(false);
  const [loading, setLoading]     = useState(false);

  const reset = () => { setOtp(''); setPassword(''); setNewPass(''); setConfirmPass(''); };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await loginWithPassword(email.trim(), password);
      loginWithTokens(email.trim(), data.access, data.refresh);
      toast.success('Welcome back.');
      navigate('/');
    } catch (err) { toast.error(apiError(err, 'Invalid credentials.')); }
    finally { setLoading(false); }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!email.trim()) return toast.error('Enter your email.');
    setLoading(true);
    try {
      await sendOTP(email.trim());
      toast.success('Code sent. Check your inbox.');
      setMode(MODE.OTP_VERIFY);
    } catch (err) { toast.error(apiError(err, 'Failed to send code.')); }
    finally { setLoading(false); }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (otp.length < 6) return toast.error('Enter the 6-digit code.');
    setLoading(true);
    try {
      await login(email.trim(), otp.trim());
      toast.success('Welcome to CineRater.');
      navigate('/');
    } catch (err) { toast.error(apiError(err, 'Invalid or expired code.')); }
    finally { setLoading(false); }
  };

  const handleForgotSend = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPasswordSendOTP(email.trim());
      toast.success('Reset code sent.');
      setMode(MODE.RESET_OTP);
    } catch (err) { toast.error(apiError(err)); }
    finally { setLoading(false); }
  };

  const handleResetVerify = (e) => {
    e.preventDefault();
    if (otp.length < 6) return toast.error('Enter the 6-digit code.');
    setMode(MODE.RESET_PASS);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPass.length < 6) return toast.error('Min. 6 characters.');
    if (newPass !== confirmPass) return toast.error("Passwords don't match.");
    setLoading(true);
    try {
      await resetPassword(email.trim(), otp.trim(), newPass);
      toast.success('Password reset. Sign in.');
      reset(); setMode(MODE.LOGIN);
    } catch (err) { toast.error(apiError(err)); }
    finally { setLoading(false); }
  };

  const stepTitles = {
    [MODE.LOGIN]:      ['Welcome back',        'Sign in to continue'],
    [MODE.OTP_LOGIN]:  ['Passwordless sign in', "We'll email you a code"],
    [MODE.OTP_VERIFY]: ['Check your inbox',    `Code sent to ${email}`],
    [MODE.FORGOT]:     ['Reset password',      'Enter your email to get a code'],
    [MODE.RESET_OTP]:  ['Enter reset code',    `Sent to ${email}`],
    [MODE.RESET_PASS]: ['New password',        'Choose something strong'],
  };

  const [heading, sub] = stepTitles[mode] || stepTitles[MODE.LOGIN];

  return (
    <div className="min-h-screen bg-void flex items-center justify-center px-4"
      style={{ backgroundImage: 'radial-gradient(ellipse at 70% 20%, rgba(201,168,76,0.06) 0%, transparent 60%)' }}>

      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <FilmIcon className="w-6 h-6 text-gold" />
            <span className="font-display text-2xl font-semibold tracking-[0.15em] text-ink-primary">CINERATER</span>
          </div>
          <p className="text-ink-muted text-xs tracking-widest uppercase">Rate · Discover · Watch</p>
        </div>

        {/* Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="glass rounded-sm p-8 shadow-deep"
          >
            {/* Heading */}
            <div className="mb-7">
              <h2 className="font-display text-2xl font-semibold text-ink-primary mb-1">{heading}</h2>
              <p className="text-ink-muted text-xs">{sub}</p>
            </div>

            {/* ── Login ── */}
            {mode === MODE.LOGIN && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <Field icon={EnvelopeIcon} label="Email" type="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoFocus />
                <Field
                  icon={LockClosedIcon} label="Password"
                  type={showPass ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  right={
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-secondary transition-colors">
                      {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  }
                />
                <div className="flex justify-end">
                  <button type="button" onClick={() => { reset(); setMode(MODE.FORGOT); }}
                    className="text-xs text-gold hover:text-gold-light transition-colors">
                    Forgot password?
                  </button>
                </div>
                <SubmitBtn loading={loading} label="Sign In" loadingLabel="Signing in…" />
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-white/[0.08]" />
                  <span className="text-[10px] text-ink-muted uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-white/[0.08]" />
                </div>
                <GoogleOAuthButton onSuccess={() => navigate('/')} disabled={loading} />
                <button type="button" onClick={() => { reset(); setMode(MODE.OTP_LOGIN); }}
                  className="w-full btn-ghost justify-center py-2.5 text-xs rounded-sm">
                  Sign in with OTP
                </button>
              </form>
            )}

            {/* ── OTP email entry ── */}
            {mode === MODE.OTP_LOGIN && (
              <form onSubmit={handleSendOTP} className="space-y-4">
                <Field icon={EnvelopeIcon} label="Email" type="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoFocus />
                <SubmitBtn loading={loading} label="Send Code" loadingLabel="Sending…" />
                <BackBtn onClick={() => setMode(MODE.LOGIN)} label="← Back to password login" />
              </form>
            )}

            {/* ── OTP verify ── */}
            {mode === MODE.OTP_VERIFY && (
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <OtpInput value={otp} onChange={setOtp} />
                <SubmitBtn loading={loading} label="Verify & Sign In" loadingLabel="Verifying…" />
                <div className="flex justify-between text-xs text-ink-muted pt-1">
                  <button type="button" onClick={() => { setOtp(''); setMode(MODE.OTP_LOGIN); }}
                    className="hover:text-ink-secondary transition-colors">← Change email</button>
                  <button type="button" onClick={handleSendOTP} disabled={loading}
                    className="text-gold hover:text-gold-light transition-colors">Resend</button>
                </div>
              </form>
            )}

            {/* ── Forgot ── */}
            {mode === MODE.FORGOT && (
              <form onSubmit={handleForgotSend} className="space-y-4">
                <Field icon={EnvelopeIcon} label="Email" type="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoFocus />
                <SubmitBtn loading={loading} label="Send Reset Code" loadingLabel="Sending…" />
                <BackBtn onClick={() => setMode(MODE.LOGIN)} label="← Back to login" />
              </form>
            )}

            {/* ── Reset OTP ── */}
            {mode === MODE.RESET_OTP && (
              <form onSubmit={handleResetVerify} className="space-y-4">
                <OtpInput value={otp} onChange={setOtp} />
                <SubmitBtn loading={loading} label="Verify Code" loadingLabel="Verifying…" />
                <BackBtn onClick={() => { setOtp(''); setMode(MODE.FORGOT); }} label="← Change email" />
              </form>
            )}

            {/* ── Reset password ── */}
            {mode === MODE.RESET_PASS && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <Field
                  icon={LockClosedIcon} label="New Password"
                  type={showNew ? 'text' : 'password'}
                  value={newPass} onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Min. 6 characters" required autoFocus
                  right={
                    <button type="button" onClick={() => setShowNew(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-secondary transition-colors">
                      {showNew ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  }
                />
                <Field icon={LockClosedIcon} label="Confirm Password" type="password"
                  value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder="Repeat password" required />
                <SubmitBtn loading={loading} label="Reset Password" loadingLabel="Resetting…" />
                <BackBtn onClick={() => setMode(MODE.RESET_OTP)} label="← Back" />
              </form>
            )}
          </motion.div>
        </AnimatePresence>

        <p className="text-center text-ink-muted text-[11px] mt-6">
          No account? Sign in via OTP — we'll create one automatically.
        </p>
      </div>
    </div>
  );
};

export default Login;
