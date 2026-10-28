import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { QuoteFlowLogo } from '../components/common/QuoteFlowLogo';
import { Loader2, PlayCircle, AlertCircle } from 'lucide-react';

/**
 * Shareable demo link (/demo). Signs the visitor into the public read-only
 * demo organization and opens the dashboard. Someone already signed in to a
 * real account is asked first, since opening the demo signs them out.
 */
const DemoEntry: React.FC = () => {
  const { isAuthenticated, isLoading, isDemo, user, loginDemo, logout } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const open = async () => {
    setBusy(true);
    setError('');
    try {
      if (isAuthenticated && !isDemo) await logout();
      await loginDemo();
      // Full reload so no company / page state from a previous account carries over.
      window.location.assign('/');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'The demo is not available right now. Please try again later.');
      setBusy(false);
    }
  };

  useEffect(() => {
    if (isLoading || started.current) return;
    if (isAuthenticated && isDemo) { window.location.assign('/'); return; }
    if (!isAuthenticated) { started.current = true; open(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, isDemo]);

  const signedInElsewhere = !isLoading && isAuthenticated && !isDemo && !busy;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-700 via-blue-800 to-cyan-800 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="flex justify-center mb-6"><QuoteFlowLogo size={44} textClassName="text-2xl" /></div>

        {error ? (
          <>
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
            <p className="mt-3 text-gray-800 font-medium">{error}</p>
            <p className="mt-2 text-sm text-gray-500">
              Contact Orbital IT Solutions on <b>0997 235 271</b> or <b>info@orbitalitsolutions.com</b> for a personal demonstration.
            </p>
            <Link to="/login" className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:underline">Go to sign in</Link>
          </>
        ) : signedInElsewhere ? (
          <>
            <p className="text-gray-800">
              You're signed in as <b>{user?.name}</b>. Opening the demo will sign you out of your account.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button onClick={open} className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg text-white font-medium bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-700 hover:to-cyan-700">
                <PlayCircle className="h-5 w-5" /> Open the demo
              </button>
              <Link to="/" className="w-full py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">Back to my dashboard</Link>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="h-9 w-9 animate-spin text-indigo-600 mx-auto" />
            <p className="mt-4 text-gray-800 font-medium">Opening the QuoteFlow demo…</p>
            <p className="mt-1 text-sm text-gray-500">Explore with sample data. Nothing you do here is saved.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default DemoEntry;
