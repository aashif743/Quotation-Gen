import React, { useEffect, useRef, useState } from 'react';
import { PenLine, Upload, Save, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { getMySignature, MySignature, removeMySignature, saveMyJobTitle, uploadMySignature } from '../../services/lettersApi';

/**
 * My Profile → "Signature for letters": the user's job title and signature
 * image, added to the letters they sign. Old letters keep the signature they
 * were signed with.
 */
const SignatureCard: React.FC<{ primary: string }> = ({ primary }) => {
  const [me, setMe] = useState<MySignature | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<'' | 'title' | 'upload' | 'remove'>('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMySignature().then((m) => { setMe(m); setTitle(m.job_title || ''); }).catch(() => {});
  }, []);

  const run = async (kind: 'title' | 'upload' | 'remove', fn: () => Promise<MySignature | void>, ok: string) => {
    setBusy(kind);
    setNotice(null);
    try {
      const next = await fn();
      if (next) setMe(next);
      setNotice({ ok: true, text: ok });
    } catch (e: any) {
      setNotice({ ok: false, text: e?.response?.data?.error || 'Something went wrong. Please try again.' });
    } finally {
      setBusy('');
    }
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setNotice({ ok: false, text: 'The image is too large (max 5 MB).' }); return; }
    run('upload', () => uploadMySignature(f), 'Signature saved. It will be added to the letters you sign.');
  };

  const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><PenLine className="h-5 w-5 text-gray-500" /> Signature for letters</h2>
      <p className="text-sm text-gray-500 mb-5">Added under your name on the letters you sign. Letters already signed keep their signature.</p>
      {notice && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {notice.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {notice.text}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="pf-jt" className="block text-sm font-medium text-gray-700 mb-1">Position / job title</label>
          <div className="flex gap-2">
            <input id="pf-jt" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Managing Director" className={input} />
            <button
              type="button"
              onClick={() => run('title', () => saveMyJobTitle(title), 'Position saved.')}
              disabled={busy !== '' || title === (me?.job_title || '')}
              className="inline-flex items-center px-3 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 flex-shrink-0"
              style={{ backgroundColor: primary }}
            >
              {busy === 'title' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">Signature</span>
          <div className="flex items-center gap-3">
            <div className="h-16 w-44 flex items-center justify-center rounded-md bg-white border border-dashed border-gray-300 overflow-hidden flex-shrink-0" style={{ backgroundColor: '#fff' }}>
              {me?.signature_url
                ? <img src={me.signature_url} alt="Your signature" className="max-h-14 max-w-[10rem] object-contain" />
                : <span className="text-xs text-gray-400">None yet</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { onFile(e.target.files?.[0] || null); e.target.value = ''; }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy !== ''}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                {busy === 'upload' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                {me?.signature_url ? 'Replace' : 'Upload'}
              </button>
              {me?.signature_url && (
                <button type="button" onClick={() => run('remove', async () => { await removeMySignature(); return { ...me, signature_url: null }; }, 'Signature removed from your profile.')}
                  disabled={busy !== ''} className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Remove
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Sign on white paper, take a clear photo or scan, and crop it close. PNG works best.</p>
        </div>
      </div>
    </div>
  );
};

export default SignatureCard;
