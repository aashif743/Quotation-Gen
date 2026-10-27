import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { updateMyProfile } from '../services/api';
import { UserCog, Save, KeyRound, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';

type Notice = { kind: 'ok' | 'err'; text: string } | null;

const errText = (e: any, fallback: string) => e?.response?.data?.message || e?.response?.data?.error || fallback;

const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

const PasswordInput: React.FC<{
  value: string; onChange: (v: string) => void; placeholder?: string; autoComplete: string; id: string;
}> = ({ value, onChange, placeholder, autoComplete, id }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoComplete={autoComplete} className={`${input} pr-10`} />
      <button type="button" onClick={() => setShow((s) => !s)} tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
        aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};

const Banner: React.FC<{ notice: Notice }> = ({ notice }) =>
  notice ? (
    <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${notice.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200'}`}>
      {notice.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {notice.text}
    </div>
  ) : null;

const Profile: React.FC = () => {
  const { user, isAdmin, isSuperAdmin, setCurrentUser } = useAuth();
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#4f46e5', theme === 'dark');
  const hasPassword = user?.has_password !== false;

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [detailsPw, setDetailsPw] = useState('');
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [detailsNotice, setDetailsNotice] = useState<Notice>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwNotice, setPwNotice] = useState<Notice>(null);

  if (!user) return null;

  const emailChanged = email.trim().toLowerCase() !== (user.email || '').toLowerCase();
  const detailsDirty = name.trim() !== user.name || email.trim() !== user.email;

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setDetailsNotice(null);
    if (!name.trim()) { setDetailsNotice({ kind: 'err', text: 'Name is required.' }); return; }
    if (emailChanged && hasPassword && !detailsPw) {
      setDetailsNotice({ kind: 'err', text: 'Enter your current password to change your email.' });
      return;
    }
    setDetailsBusy(true);
    try {
      const next = await updateMyProfile({ name: name.trim(), email: email.trim(), current_password: detailsPw || undefined });
      setCurrentUser({ ...user, ...next });
      setName(next.name); setEmail(next.email); setDetailsPw('');
      setDetailsNotice({ kind: 'ok', text: emailChanged ? `Saved. Sign in with ${next.email} from now on.` : 'Your details have been saved.' });
    } catch (err) {
      setDetailsNotice({ kind: 'err', text: errText(err, 'Could not save your details.') });
    } finally {
      setDetailsBusy(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwNotice(null);
    if (hasPassword && !currentPw) { setPwNotice({ kind: 'err', text: 'Enter your current password.' }); return; }
    if (newPw.length < 6) { setPwNotice({ kind: 'err', text: 'The new password must be at least 6 characters.' }); return; }
    if (newPw !== confirmPw) { setPwNotice({ kind: 'err', text: 'The new passwords do not match.' }); return; }
    if (hasPassword && newPw === currentPw) { setPwNotice({ kind: 'err', text: 'Choose a password different from your current one.' }); return; }
    setPwBusy(true);
    try {
      const next = await updateMyProfile({ current_password: currentPw || undefined, new_password: newPw });
      setCurrentUser({ ...user, ...next });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwNotice({ kind: 'ok', text: 'Password changed. Any other devices signed in to your account have been signed out.' });
    } catch (err) {
      setPwNotice({ kind: 'err', text: errText(err, 'Could not change your password.') });
    } finally {
      setPwBusy(false);
    }
  };

  const strength = newPw.length === 0 ? null
    : newPw.length < 6 ? { label: 'Too short', w: '20%', c: 'bg-red-500' }
    : (newPw.length >= 10 && /[A-Za-z]/.test(newPw) && /\d/.test(newPw)) ? { label: 'Strong', w: '100%', c: 'bg-emerald-500' }
    : { label: 'OK', w: '60%', c: 'bg-amber-500' };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <UserCog className="h-7 w-7" style={{ color: primary }} /> My Profile
        </h1>
        <p className="text-gray-600 mt-1">Change your name, the email you sign in with, and your password.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Your details</h2>
          <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${isAdmin ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
            {isAdmin && <ShieldCheck className="h-3 w-3 mr-0.5" />}{isSuperAdmin ? 'super admin' : user.role}
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-5">Your name appears on the documents you create and in the activity log.</p>
        <Banner notice={detailsNotice} />
        <form onSubmit={saveDetails} className="space-y-4">
          <div>
            <label htmlFor="pf-name" className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={input} />
          </div>
          <div>
            <label htmlFor="pf-email" className="block text-sm font-medium text-gray-700 mb-1">Login email</label>
            <input id="pf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
              disabled={isSuperAdmin} className={`${input} disabled:bg-gray-50 disabled:text-gray-500`} />
            <p className="text-xs text-gray-500 mt-1">
              {isSuperAdmin ? 'The platform owner email is fixed in the server configuration.' : 'You will use this email to sign in.'}
            </p>
          </div>
          {emailChanged && hasPassword && (
            <div>
              <label htmlFor="pf-dpw" className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
              <PasswordInput id="pf-dpw" value={detailsPw} onChange={setDetailsPw} autoComplete="current-password" placeholder="Needed to change your email" />
            </div>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={detailsBusy || !detailsDirty}
              className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
              {detailsBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save details
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><KeyRound className="h-5 w-5 text-gray-500" /> {hasPassword ? 'Change password' : 'Set a password'}</h2>
        <p className="text-sm text-gray-500 mb-5">
          {hasPassword ? 'Use at least 6 characters. Mixing letters and numbers makes it stronger.' : 'Set a password so you can also sign in with your email.'}
        </p>
        <Banner notice={pwNotice} />
        <form onSubmit={savePassword} className="space-y-4">
          {/* Lets password managers pair the new password with this account. */}
          <input type="text" name="username" value={user.email} autoComplete="username" readOnly hidden />
          {hasPassword && (
            <div>
              <label htmlFor="pf-cpw" className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
              <PasswordInput id="pf-cpw" value={currentPw} onChange={setCurrentPw} autoComplete="current-password" />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pf-npw" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <PasswordInput id="pf-npw" value={newPw} onChange={setNewPw} autoComplete="new-password" />
              {strength && (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${strength.c}`} style={{ width: strength.w }} /></div>
                  <p className="text-xs text-gray-500 mt-1">{strength.label}</p>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="pf-rpw" className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <PasswordInput id="pf-rpw" value={confirmPw} onChange={setConfirmPw} autoComplete="new-password" />
              {confirmPw && confirmPw !== newPw && <p className="text-xs text-red-600 mt-1">Passwords do not match.</p>}
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={pwBusy || !newPw}
              className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
              {pwBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <KeyRound className="h-4 w-4 mr-1.5" />} {hasPassword ? 'Change password' : 'Set password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Profile;
