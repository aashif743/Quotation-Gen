import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getGoogleAuthUrl, getAuthProviders } from '../services/api';
import { Mail, Lock, LogIn, FileText, ShieldCheck, Users, Eye, EyeOff, PlayCircle, Download } from 'lucide-react';
import { QuoteFlowLogo, QuoteFlowMark } from '../components/common/QuoteFlowLogo';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  // Set when the API interceptor redirected here due to a 401.
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('sessionExpired')) {
        setSessionExpired(true);
        sessionStorage.removeItem('sessionExpired');
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const checkProviders = async () => {
      try {
        const providers = await getAuthProviders();
        setGoogleEnabled(providers.google);
        setDemoEnabled(!!providers.demo);
      } catch (err) {
        console.error('Failed to check auth providers');
      }
    };
    checkProviders();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = getGoogleAuthUrl();
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-indigo-700 via-blue-800 to-cyan-800">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white"></div>
          <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-white"></div>
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <QuoteFlowLogo size={46} tone="light" textClassName="text-2xl" />

          <div className="space-y-8 max-w-md">
            <div>
              <h2 className="text-4xl font-bold leading-tight">
                From quote to payment, in one smooth flow.
              </h2>
              <p className="mt-4 text-indigo-100 text-lg">
                One platform for your whole team — admins oversee everything, staff manage their own work.
              </p>
            </div>

            <div className="space-y-4">
              {[
                { icon: FileText, text: 'Branded quotations, invoices, job cards and delivery notes' },
                { icon: Users, text: 'Individual staff accounts, kept private' },
                { icon: ShieldCheck, text: 'Full admin oversight and user management' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center space-x-3">
                  <div className="h-9 w-9 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-indigo-50">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-indigo-200">© {new Date().getFullYear()} QuoteFlow · by Orbital IT Solutions</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex justify-center mb-3"><QuoteFlowMark size={56} /></div>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Welcome back</h1>
            <p className="text-gray-500 mt-2">Sign in to access your dashboard.</p>
          </div>

          {sessionExpired && !error && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              <p className="font-semibold">Your session has expired.</p>
              <p className="mt-0.5">For your security you've been signed out after 7 days of inactivity. Please sign in again.</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-cyan-600 text-white py-3 rounded-lg font-medium hover:from-indigo-700 hover:to-cyan-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <LogIn className="h-5 w-5 mr-2" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {googleEnabled && (
            <>
              <div className="my-6 flex items-center">
                <div className="flex-1 border-t border-gray-200"></div>
                <span className="px-4 text-sm text-gray-400">or continue with</span>
                <div className="flex-1 border-t border-gray-200"></div>
              </div>

              <button
                onClick={handleGoogleLogin}
                className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-all flex items-center justify-center"
              >
                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>
            </>
          )}

          {/* New to QuoteFlow? Live demo + brochure, open to anyone. */}
          <div className="mt-8 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-cyan-50 p-5 dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-cyan-500/10">
            <p className="text-sm font-semibold text-gray-900 dark:!text-white">New to QuoteFlow?</p>
            <p className="text-sm text-gray-600 dark:!text-gray-300 mt-0.5">Explore the full system with sample data, no account needed.</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {demoEnabled && (
                <button
                  type="button"
                  onClick={() => navigate('/demo')}
                  className="inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700"
                >
                  <PlayCircle className="h-4 w-4" /> Try the live demo
                </button>
              )}
              <a
                href="/QuoteFlow-Brochure.pdf"
                download="QuoteFlow-Brochure.pdf"
                className={`inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50 dark:!bg-transparent dark:!text-indigo-200 dark:border-indigo-400/40 dark:hover:!bg-white/5 ${demoEnabled ? '' : 'sm:col-span-2'}`}
              >
                <Download className="h-4 w-4" /> Download brochure
              </a>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:!text-gray-400">
              To get QuoteFlow for your business: 0997 235 271 · info@orbitalitsolutions.com
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            Need an account? Contact your administrator to have one created for you.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
