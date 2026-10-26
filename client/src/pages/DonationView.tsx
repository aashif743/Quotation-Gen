import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import { generateDocumentPDF, pdfFileSegment } from '../utils/pdfGenerator';
import {
  deleteDonation, deleteDonationProof, getDonation, setDonationStatus, uploadDonationProof,
} from '../services/donationsApi';
import { Donation, DonationStatus, DONATION_STATUS_LABELS, DONATION_STATUS_STYLE } from '../types/donations';
import DonationDocument from '../components/Donation/DonationDocument';
import {
  ArrowLeft, Edit2, Download, CheckCircle2, Gift, XCircle, RotateCcw, Trash2, Upload, Paperclip,
  Loader2, RefreshCw, AlertCircle,
} from 'lucide-react';

const DonationView: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();
  const [d, setD] = useState<Donation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [givingOpen, setGivingOpen] = useState(false);
  const [receivedBy, setReceivedBy] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    getDonation(Number(id))
      .then(setD)
      .catch((e) => setError(e?.response?.data?.error || 'Failed to load the donation.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>;
  if (!d) return <div className="p-6 text-red-600">{error || 'Donation not found.'}</div>;

  const primary = brandColorFor(d.primary_color || '#4f46e5', theme === 'dark');
  const isOwner = d.created_by === user?.id;
  const canEdit = isAdmin || (isOwner && d.status === 'planned');
  const canUploadProof = isAdmin || (isOwner && !d.proof_url);

  const run = async (label: string, fn: () => Promise<Donation | void>) => {
    setBusy(label); setError('');
    try {
      const next = await fn();
      if (next) setD(next);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.response?.data?.message || 'Something went wrong.');
    } finally {
      setBusy('');
    }
  };
  const status = (s: DonationStatus, extra?: { received_by?: string }) => run(s, () => setDonationStatus(d.id!, s, extra));

  const download = () => run('pdf', async () => {
    await generateDocumentPDF('.donation-document', `${d.donation_number}_${pdfFileSegment(d.recipient_name)}.pdf`);
  });

  const onFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setError('File is too large (max 10 MB).'); return; }
    run('proof', () => uploadDonationProof(d.id!, f));
  };

  const remove = async () => {
    if (!window.confirm(`Delete donation ${d.donation_number}? This cannot be undone.`)) return;
    setBusy('delete');
    try { await deleteDonation(d.id!); navigate('/donations'); }
    catch (e: any) { setError(e?.response?.data?.error || 'Failed to delete.'); setBusy(''); }
  };

  const btn = 'inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50';
  const spin = (k: string, Icon: React.ElementType) => (busy === k ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Icon className="h-4 w-4 mr-1.5" />);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/donations')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {d.donation_number}
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${DONATION_STATUS_STYLE[d.status]}`}>{DONATION_STATUS_LABELS[d.status]}</span>
            </h1>
            <p className="text-sm text-gray-500">
              Recorded by {d.created_by_name || '—'}
              {d.approved_by_name ? ` · approved by ${d.approved_by_name}${d.approved_at ? ` on ${new Date(d.approved_at).toLocaleDateString('en-GB')}` : ''}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && d.status === 'planned' && (
            <button onClick={() => status('approved')} disabled={!!busy} className={`${btn} text-white bg-blue-600 hover:bg-blue-700`}>{spin('approved', CheckCircle2)} Approve</button>
          )}
          {isAdmin && (d.status === 'planned' || d.status === 'approved') && (
            <button onClick={() => { setReceivedBy(d.received_by || ''); setGivingOpen(true); }} disabled={!!busy} className={`${btn} text-white bg-emerald-600 hover:bg-emerald-700`}>
              {spin('given', Gift)} Mark as given
            </button>
          )}
          {isAdmin && d.status !== 'cancelled' && d.status !== 'given' && (
            <button onClick={() => window.confirm('Cancel this donation?') && status('cancelled')} disabled={!!busy} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}>{spin('cancelled', XCircle)} Cancel</button>
          )}
          {isAdmin && (d.status === 'cancelled' || d.status === 'given') && (
            <button onClick={() => window.confirm('Move this donation back to "Awaiting approval"?') && status('planned')} disabled={!!busy} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}>{spin('planned', RotateCcw)} Reopen</button>
          )}
          {canEdit && <Link to={`/donations/${d.id}/edit`} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}><Edit2 className="h-4 w-4 mr-1.5" /> Edit</Link>}
          <button onClick={download} disabled={!!busy} className={`${btn} text-white`} style={{ backgroundColor: primary }}>{spin('pdf', Download)} Download PDF</button>
          {isAdmin && <button onClick={remove} disabled={!!busy} className={`${btn} text-red-600 hover:bg-red-50`} title="Delete"><Trash2 className="h-4 w-4" /></button>}
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 bg-red-50 text-red-700"><AlertCircle size={16} /> {error}</div>}

      {/* Proof */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center"><Paperclip className="h-4 w-4 text-gray-500" /></div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Proof of donation</p>
            <p className="text-xs text-gray-500">{d.proof_url ? (d.proof_name || 'Attached') : 'Receipt, signed acknowledgement or a photo of the handover (image or PDF, max 10 MB).'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { onFile(e.target.files?.[0] || null); e.target.value = ''; }} />
          {d.proof_url && <a href={d.proof_url} target="_blank" rel="noopener noreferrer" className={`${btn} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>View</a>}
          {canUploadProof && (
            <button onClick={() => fileRef.current?.click()} disabled={!!busy} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}>
              {busy === 'proof' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : d.proof_url ? <RefreshCw className="h-4 w-4 mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
              {d.proof_url ? 'Replace' : 'Upload'}
            </button>
          )}
          {isAdmin && d.proof_url && (
            <button onClick={() => window.confirm('Remove the proof? The file will be deleted.') && run('proofdel', () => deleteDonationProof(d.id!))} disabled={!!busy} className={`${btn} text-red-600 hover:bg-red-50`}>Remove</button>
          )}
        </div>
      </div>

      <div className="shadow-lg rounded-lg overflow-hidden bg-white">
        <DonationDocument donation={d} rootClassName="donation-document" />
      </div>

      {givingOpen && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4" onClick={() => setGivingOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900">Mark as given</h3>
            <p className="text-sm text-gray-600 mt-1">Record who received the donation (optional). It will show on the voucher.</p>
            <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Received by (name)" autoFocus
              className="mt-4 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setGivingOpen(false)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">Cancel</button>
              <button onClick={() => { setGivingOpen(false); status('given', { received_by: receivedBy }); }} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium">Mark as given</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DonationView;
