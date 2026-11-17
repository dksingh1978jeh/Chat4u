import React, { useState } from 'react';
import {
  ShieldCheck,
  Smartphone,
  Mail,
  Lock,
  User,
  AtSign,
  ArrowRight,
  KeyRound,
  Moon,
  Sun,
  Globe,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import type { UserAccount, UserProfile } from '../types/index.ts';

type AuthMode = 'login' | 'register' | 'otp' | 'forgot' | 'reset';

export const AuthScreen: React.FC = () => {
  const { setSessionData, loginWithGoogle, theme, setTheme, language, setLanguage } =
    useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorPin, setTwoFactorPin] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);

  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');

  const [otpCode, setOtpCode] = useState('');
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const data = await apiRequest<{
        token?: string;
        user?: UserAccount;
        profile?: UserProfile;
        requires2FA?: boolean;
        message?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier,
          password,
          twoFactorPin: needs2FA ? twoFactorPin : undefined,
        }),
      });
      if (data.requires2FA) {
        setNeeds2FA(true);
        setNotice(data.message || 'Enter your Two-Step Verification PIN.');
        return;
      }
      if (data.token && data.user && data.profile) {
        setSessionData(data.token, data.user, data.profile);
      }
    } catch (err: any) {
      if (err.data?.requiresOtp) {
        setIdentifier(err.data.identifier || identifier);
        setOtpHint(err.data.verificationOtp || null);
        setMode('otp');
        setNotice('Account verification required. Enter your 6-digit OTP.');
      } else {
        setError(err.message || 'Sign in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const data = await apiRequest<{
        requiresOtp: boolean;
        email: string;
        verificationOtp: string;
        message: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          mobileNumber,
          email,
          fullName,
          username,
          password,
        }),
      });
      setIdentifier(data.email);
      setOtpHint(data.verificationOtp);
      setMode('otp');
      setNotice(data.message);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{
        token: string;
        user: UserAccount;
        profile: UserProfile;
      }>('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ identifier, otpCode }),
      });
      setSessionData(data.token, data.user, data.profile);
    } catch (err: any) {
      setError(err.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ verificationOtp: string; message: string }>(
        '/api/auth/resend-otp',
        {
          method: 'POST',
          body: JSON.stringify({ identifier }),
        }
      );
      setOtpHint(data.verificationOtp);
      setNotice(data.message);
    } catch (err: any) {
      setError(err.message || 'Could not resend OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ verificationOtp: string; message: string }>(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ identifier }),
        }
      );
      setOtpHint(data.verificationOtp);
      setMode('reset');
      setNotice(data.message);
    } catch (err: any) {
      setError(err.message || 'Recovery request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ identifier, otpCode, newPassword }),
      });
      setNotice(data.message);
      setOtpHint(null);
      setOtpCode('');
      setMode('login');
    } catch (err: any) {
      setError(err.message || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B141A] text-slate-900 dark:text-slate-100">
      {/* Top Emerald Accent Band */}
      <div className="h-52 bg-emerald-800 dark:bg-[#005C4B] w-full shrink-0 px-6 pt-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/src/assets/images/smartconnect_brand_mark_1794902759940.jpg"
              alt="SmartConnect"
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-xl object-cover shadow-sm"
            />
            <span className="text-lg font-bold tracking-tight text-white">
              SmartConnect
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/90 hover:bg-white/10 transition-colors whitespace-nowrap"
            >
              <Globe className="w-4 h-4" />
              <span>{language === 'en' ? 'हिन्दी' : 'English'}</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
              className="p-2 rounded-lg text-white/90 hover:bg-white/10 transition-colors"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Card overlapping banner */}
      <div className="flex-1 px-4 -mt-32 pb-12">
        <div className="max-w-4xl mx-auto bg-white dark:bg-[#111B21] rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Left Product Panel */}
          <div className="lg:col-span-5 bg-slate-50/80 dark:bg-[#182229] p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                {language === 'hi'
                  ? 'निजी, तेज़ और सुरक्षित संवाद'
                  : 'Private, real-time messaging across every device'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {language === 'hi'
                  ? 'एंड-टू-एंड एन्क्रिप्टेड चैट, HD वीडियो कॉल, 24-घंटे स्टेटस और ग्रुप कम्युनिटी का अनुभव करें।'
                  : 'End-to-end encrypted 1:1 chats, HD WebRTC calls, disappearing stories, communities, and multi-device session security.'}
              </p>
            </div>

            <div className="mt-8 space-y-3 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>ECDH P-256 + AES-GCM end-to-end encryption</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>OTP verification &amp; multi-device session control</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>PostgreSQL persistence &amp; WebSocket instant delivery</span>
              </div>
            </div>
          </div>

          {/* Right Form Panel */}
          <div className="lg:col-span-7 p-6 sm:p-8">
            {/* Mode Switcher */}
            {(mode === 'login' || mode === 'register') && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#202C33] rounded-xl mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setNotice(null);
                  }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    mode === 'login'
                      ? 'bg-white dark:bg-[#111B21] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                    setNotice(null);
                  }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    mode === 'register'
                      ? 'bg-white dark:bg-[#111B21] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Create Account
                </button>
              </div>
            )}

            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            {notice && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-sm text-emerald-800 dark:text-emerald-200">
                <p>{notice}</p>
                {otpHint && (
                  <p className="mt-1 font-mono text-xs font-semibold">
                    Verification OTP: <span className="tracking-widest">{otpHint}</span>
                  </p>
                )}
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Mobile Number or Email
                  </label>
                  <div className="relative">
                    <Smartphone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="+91 98765 43210 or you@example.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#202C33] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError(null);
                        setNotice(null);
                      }}
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#202C33] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {needs2FA && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Two-Step Verification PIN
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="password"
                        required
                        value={twoFactorPin}
                        onChange={(e) => setTwoFactorPin(e.target.value)}
                        placeholder="Enter 4–6 digit PIN"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#202C33] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Aarav Sharma"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#202C33] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Username
                    </label>
                    <div className="relative">
                      <AtSign className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="aarav_s"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#202C33] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="tel"
                      required
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="+919876543210"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#202C33] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="aarav@example.com"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#202C33] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Password (min 6 chars)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#202C33] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Register &amp; Send OTP</span>
                  )}
                </button>
              </form>
            )}

            {mode === 'otp' && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <h3 className="text-lg font-semibold">Verify Your Account</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enter the 6-digit OTP sent for {identifier}
                </p>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="6-digit OTP"
                  className="w-full px-4 py-3 text-center font-mono text-lg tracking-[0.4em] rounded-xl bg-slate-50 dark:bg-[#202C33] border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    Resend OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    Back to Sign In
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm"
                >
                  {loading ? 'Verifying...' : 'Verify & Continue'}
                </button>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={handleForgot} className="space-y-4">
                <h3 className="text-lg font-semibold">Account Recovery</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enter your registered mobile number or email to receive a recovery OTP.
                </p>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Mobile number or email"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#202C33] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    Back to Sign In
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
                  >
                    Send Recovery OTP
                  </button>
                </div>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <h3 className="text-lg font-semibold">Reset Password</h3>
                <input
                  type="text"
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="6-digit Recovery OTP"
                  className="w-full px-4 py-2.5 font-mono rounded-xl bg-slate-50 dark:bg-[#202C33] border border-slate-200 dark:border-slate-700 text-sm"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (6+ chars)"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#202C33] border border-slate-200 dark:border-slate-700 text-sm"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
                >
                  Update Password
                </button>
              </form>
            )}

            {/* Divider + Google Sign-In */}
            <div className="mt-6">
              <div className="relative flex items-center justify-center my-4">
                <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
                <span className="px-3 text-xs text-slate-400 bg-white dark:bg-[#111B21] shrink-0">
                  or continue with
                </span>
                <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#202C33] text-sm font-medium flex items-center justify-center gap-2.5 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
