import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Save, Loader2, AlertCircle, CheckCircle2, Plus, Trash2, Upload, FileText, Building2, PenLine, Landmark,
  Users, Briefcase, FolderLock, ExternalLink, Pencil, X, ShieldCheck,
} from 'lucide-react';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import {
  BidDocument, BidProfile as Profile, DOC_TYPE_LABELS, deleteBidDocument, getBidDocuments, getBidProfile,
  saveBidProfile, updateBidDocument, uploadBidDocument,
} from '../services/bidsApi';
import { getLetterOptions, Signer } from '../services/lettersApi';

const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const label = 'block text-sm font-medium text-gray-700 mb-1';
const card = 'bg-white rounded-xl border border-gray-200 p-6';

/** Expiry badge for a vault document. */
export const ExpiryBadge: React.FC<{ doc: Pick<BidDocument, 'expires' | 'days_left'> }> = ({ doc }) => {
  if (!doc.expires) return <span className="text-xs text-gray-400">No expiry</span>;
  const d = Number(doc.days_left);
  const cls = d < 0 ? 'bg-red-100 text-red-700' : d <= 30 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700';
  const text = d < 0 ? `Expired ${-d} day${d === -1 ? '' : 's'} ago` : d === 0 ? 'Expires today' : d <= 30 ? `Expires in ${d} day${d === 1 ? '' : 's'}` : `Valid until ${new Date(`${doc.expires}T00:00:00`).toLocaleDateString('en-GB')}`;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>;
};

/** Editable list of rows (directors, owners, experience). */
function RowsEditor<T extends Record<string, any>>({ rows, onChange, blank, columns, addLabel }: {
  rows: T[]; onChange: (rows: T[]) => void; blank: () => T; addLabel: string;
  columns: { key: keyof T; label: string; type?: 'text' | 'check'; width?: string; placeholder?: string }[];
}) {
  const set = (i: number, k: keyof T, v: any) => onChange(rows.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  return (
    <div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {columns.map((c) => <th key={String(c.key)} className={`text-left text-xs font-medium text-gray-500 pb-1.5 pr-2 ${c.width || ''}`}>{c.label}</th>)}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={String(c.key)} className="pr-2 pb-2 align-top">
                      {c.type === 'check' ? (
                        <input type="checkbox" checked={!!r[c.key]} onChange={(e) => set(i, c.key, e.target.checked)} className="h-4 w-4 mt-2.5 rounded" />
                      ) : (
                        <input value={r[c.key] ?? ''} onChange={(e) => set(i, c.key, e.target.value)} placeholder={c.placeholder} className={input} />
                      )}
                    </td>
                  ))}
                  <td className="pb-2 align-top">
                    <button type="button" onClick={() => onChange(rows.filter((_, n) => n !== i))} className="p-2 text-gray-400 hover:text-red-600" title="Remove"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" onClick={() => onChange([...rows, blank()])} className="mt-1 inline-flex items-center text-sm font-medium text-gray-700 hover:text-gray-900">
        <Plus className="h-4 w-4 mr-1" /> {addLabel}
      </button>
    </div>
  );
}

const DocumentModal: React.FC<{
  companyId: number; doc: BidDocument | null; onClose: () => void; onSaved: () => void; primary: string;
}> = ({ companyId, doc, onClose, onSaved, primary }) => {
  const [type, setType] = useState(doc?.doc_type || 'tax_clearance');
  const [title, setTitle] = useState(doc?.title || DOC_TYPE_LABELS.tax_clearance);
  const [titleTouched, setTitleTouched] = useState(!!doc);
  const [issued, setIssued] = useState(doc?.issued || '');
  const [expires, setExpires] = useState(doc?.expires || '');
  const [notes, setNotes] = useState(doc?.notes || '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    if (!doc && !file) { setError('Choose the file (PDF or photo).'); return; }
    setBusy(true);
    try {
      if (doc) await updateBidDocument(doc.id, { doc_type: type, title, issued_on: issued || null, expires_on: expires || null, notes: notes || null });
      else await uploadBidDocument(companyId, file!, { doc_type: type, title, issued_on: issued, expires_on: expires, notes });
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not save the document.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{doc ? 'Edit document' : 'Add document'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-3">
          {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
          <div>
            <label className={label}>Type</label>
            <select value={type} onChange={(e) => { setType(e.target.value); if (!titleTouched) setTitle(DOC_TYPE_LABELS[e.target.value] || ''); }} className={`${input} bg-white`}>
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Name</label>
            <input value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} className={input} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Issued <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Expires</label>
              <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={input} />
            </div>
          </div>
          {!doc && (
            <div>
              <label className={label}>File</label>
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm" />
              <p className="text-xs text-gray-400 mt-1">PDF or a clear photo/scan, up to 15 MB. It is added to bid packs as it is.</p>
            </div>
          )}
          <div>
            <label className={label}>Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} placeholder="e.g. Certificate no. TC-2026-1182" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">Cancel</button>
          <button onClick={save} disabled={busy} className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} {doc ? 'Save' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** /bid-profile — the selected company's Bid Profile and document vault. */
const BidProfilePage: React.FC = () => {
  const { selectedCompany } = useCompany();
  const { isAdmin } = useAuth();
  const { theme } = useTheme();
  const [profile, setProfile] = useState<Profile>({});
  const [savedJson, setSavedJson] = useState('');
  const [docs, setDocs] = useState<BidDocument[]>([]);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [docModal, setDocModal] = useState<{ doc: BidDocument | null } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const loadDocs = async (id: number) => setDocs(await getBidDocuments(id));
  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);
    Promise.all([
      getBidProfile(selectedCompany.id).then((r) => { setProfile(r.profile); setSavedJson(r.saved ? JSON.stringify(r.profile) : ''); }),
      loadDocs(selectedCompany.id),
      getLetterOptions(selectedCompany.id).then((o) => setSigners(o.signers)).catch(() => {}),
    ])
      .catch(() => setNotice({ ok: false, text: 'Could not load the bid profile.' }))
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  const dirty = useMemo(() => JSON.stringify(profile) !== savedJson, [profile, savedJson]);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setProfile((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!selectedCompany) return;
    setSaving(true);
    setNotice(null);
    try {
      await saveBidProfile(selectedCompany.id, profile);
      setSavedJson(JSON.stringify(profile));
      setNotice({ ok: true, text: 'Bid profile saved. New bids will be filled in with these details.' });
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (e: any) {
      setNotice({ ok: false, text: e?.response?.data?.error || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const removeDoc = async (d: BidDocument) => {
    if (!window.confirm(`Remove "${d.title}" from the vault? You can restore it from Recently Deleted.`)) return;
    try { await deleteBidDocument(d.id); await loadDocs(d.company_id); } catch (e: any) { setNotice({ ok: false, text: e?.response?.data?.error || 'Could not remove.' }); }
  };

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;
  if (loading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>;
  const primary = brandColorFor(selectedCompany.primary_color || '#4f46e5', theme === 'dark');
  const ro = !isAdmin; // staff can read the profile, admins edit it
  const field = (k: keyof Profile, l: string, ph = '', type = 'text') => (
    <div>
      <label className={label}>{l}</label>
      <input type={type} value={(profile[k] as any) ?? ''} onChange={(e) => set(k, (type === 'number' ? Number(e.target.value) || 0 : e.target.value) as any)} placeholder={ph} className={input} disabled={ro} />
    </div>
  );
  const expiring = docs.filter((d) => d.expires && Number(d.days_left) <= 30);

  return (
    <div className="max-w-5xl mx-auto space-y-6" ref={topRef}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-gray-900">Bid Profile</h1>
          <p className="text-gray-600 mt-2">
            {selectedCompany.name}'s details and documents for tenders. Fill this in once — every bid is filled in from it.
          </p>
        </div>
        {isAdmin && (
          <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center whitespace-nowrap px-5 py-2.5 rounded-lg text-white font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save profile
          </button>
        )}
      </div>

      {notice && (
        <div className={`px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {notice.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {notice.text}
        </div>
      )}
      {ro && <p className="text-sm text-gray-500">Only admins can change the bid profile.</p>}
      {expiring.length > 0 && (
        <div className="px-4 py-3 rounded-lg text-sm bg-amber-50 text-amber-800 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{expiring.map((d) => `${d.title} ${Number(d.days_left) < 0 ? 'has expired' : `expires in ${d.days_left} days`}`).join(' · ')}. Upload the renewed document before your next bid.</span>
        </div>
      )}

      {/* Company */}
      <div className={card}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Building2 className="h-5 w-5 text-gray-500" /> Company details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('legal_name', 'Registered company name')}
          {field('registration_number', 'Business registration number', 'e.g. BRN-7WBC8A')}
          {field('tpin', 'TPIN')}
          {field('vat_number', 'VAT registration number')}
          {field('ppda_number', 'PPDA registration number')}
          {field('nationality', 'Nationality', 'Malawian')}
          <div className="md:col-span-2">
            <label className={label}>Physical address</label>
            <textarea value={profile.physical_address || ''} onChange={(e) => set('physical_address', e.target.value)} rows={2} className={input} disabled={ro} placeholder="e.g. Area 47 Sector 2, Bluffin Mall, Lilongwe" />
          </div>
          {field('postal_address', 'Postal address', 'P.O. Box 64, Crossroads, Lilongwe')}
          {field('phone', 'Phone')}
          {field('email', 'Email', '', 'email')}
          {field('website', 'Website')}
        </div>
      </div>

      {/* Signatory */}
      <div className={card}>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2"><PenLine className="h-5 w-5 text-gray-500" /> Authorised signatory</h2>
        <p className="text-sm text-gray-500 mb-4">The person who signs bids (usually holds the Power of Attorney). Their signature comes from My Profile.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={label}>Signature of</label>
            <select
              value={profile.signatory_user_id ?? ''}
              disabled={ro}
              onChange={(e) => {
                const s = signers.find((x) => x.id === Number(e.target.value));
                setProfile((p) => ({ ...p, signatory_user_id: s ? s.id : null, signatory_name: s ? s.name : p.signatory_name, signatory_title: s?.job_title || p.signatory_title }));
              }}
              className={`${input} bg-white`}
            >
              <option value="">— No saved signature —</option>
              {signers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.signature_url ? '' : ' (no signature yet)'}</option>)}
            </select>
          </div>
          {field('signatory_name', 'Name as printed')}
          {field('signatory_title', 'Position', 'Managing Director')}
        </div>
      </div>

      {/* Bank */}
      <div className={card}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Landmark className="h-5 w-5 text-gray-500" /> Bank details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {field('bank_name', 'Bank', 'National Bank of Malawi')}
          {field('bank_account_name', 'Account name')}
          {field('bank_account_number', 'Account number')}
          {field('bank_branch', 'Branch')}
          {field('bank_account_type', 'Account type', 'Current account')}
          {field('swift_code', 'SWIFT code', 'Optional')}
        </div>
      </div>

      {/* Terms */}
      <div className={card}>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-gray-500" /> Usual terms</h2>
        <p className="text-sm text-gray-500 mb-4">Starting values for new bids — each bid can change them.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('validity_days', 'Bid validity (days)', '120', 'number')}
          {field('payment_terms', 'Payment terms', 'Within 30 days of receipt of invoice')}
          {field('warranty', 'Warranty', 'e.g. 12 months')}
          {field('delivery', 'Delivery', 'e.g. 14 days from confirmed order')}
        </div>
      </div>

      {/* People */}
      <div className={card}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-gray-500" /> Directors</h2>
        <fieldset disabled={ro}>
          <RowsEditor
            rows={profile.directors || []}
            onChange={(r) => set('directors', r)}
            blank={() => ({ name: '', address: '', nationality: 'Malawian' })}
            addLabel="Add director"
            columns={[{ key: 'name', label: 'Full name', width: 'w-1/4' }, { key: 'address', label: 'Physical address' }, { key: 'nationality', label: 'Nationality', width: 'w-40' }]}
          />
        </fieldset>
        <h3 className="text-base font-semibold mt-6 mb-1">Beneficial owners</h3>
        <p className="text-sm text-gray-500 mb-3">People who own or control 5% or more (for the Beneficial Ownership Disclosure form).</p>
        <fieldset disabled={ro}>
          <RowsEditor
            rows={profile.beneficial_owners || []}
            onChange={(r) => set('beneficial_owners', r)}
            blank={() => ({ name: '', nationality: 'Malawian', residence: 'Malawi', address: '', shares: true, votes: true, board: true })}
            addLabel="Add beneficial owner"
            columns={[
              { key: 'name', label: 'Full name', width: 'w-1/5' }, { key: 'nationality', label: 'Nationality', width: 'w-32' },
              { key: 'residence', label: 'Country of residence', width: 'w-32' }, { key: 'address', label: 'Address / contacts' },
              { key: 'shares', label: '≥5% shares', type: 'check', width: 'w-16' }, { key: 'votes', label: '≥5% votes', type: 'check', width: 'w-16' },
              { key: 'board', label: 'Appoints board', type: 'check', width: 'w-16' },
            ]}
          />
        </fieldset>
      </div>

      <div className={card}>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2"><Briefcase className="h-5 w-5 text-gray-500" /> Past experience</h2>
        <p className="text-sm text-gray-500 mb-4">Similar contracts you have done — used for the experience annex and references.</p>
        <fieldset disabled={ro}>
          <RowsEditor
            rows={profile.experience || []}
            onChange={(r) => set('experience', r)}
            blank={() => ({ client: '', description: '', amount: '', year: '', contact: '' })}
            addLabel="Add contract"
            columns={[
              { key: 'client', label: 'Client', width: 'w-1/5' }, { key: 'description', label: 'What was supplied' },
              { key: 'amount', label: 'Value', width: 'w-36', placeholder: 'MWK 202,710,000' }, { key: 'year', label: 'Year', width: 'w-20' },
              { key: 'contact', label: 'Reference contact', width: 'w-1/5' },
            ]}
          />
        </fieldset>
      </div>

      {/* Vault */}
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2"><FolderLock className="h-5 w-5 text-gray-500" /> Document vault</h2>
            <p className="text-sm text-gray-500">Certificates and annexes attached to bids. Add the expiry date so you are warned before it runs out.</p>
          </div>
          {isAdmin && (
            <button onClick={() => setDocModal({ doc: null })} className="inline-flex items-center whitespace-nowrap px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: primary }}>
              <Upload className="h-4 w-4 mr-1.5" /> Add document
            </button>
          )}
        </div>
        {docs.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500">
            <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            No documents yet. Start with your Tax Clearance, PPDA and Business Registration certificates.
          </div>
        ) : (
          <div className="divide-y divide-gray-200 border border-gray-200 rounded-lg">
            {docs.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{d.title}</div>
                  <div className="text-xs text-gray-500">{DOC_TYPE_LABELS[d.doc_type] || d.doc_type}{d.notes ? ` · ${d.notes}` : ''}</div>
                </div>
                <ExpiryBadge doc={d} />
                <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-gray-700" title="Open"><ExternalLink className="h-4 w-4" /></a>
                {isAdmin && (
                  <>
                    <button onClick={() => setDocModal({ doc: d })} className="p-1.5 text-gray-400 hover:text-indigo-600" title="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => removeDoc(d)} className="p-1.5 text-gray-400 hover:text-red-600" title="Remove"><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin && dirty && (
        <div className="sticky bottom-4 flex justify-end">
          <button onClick={save} disabled={saving} className="inline-flex items-center px-5 py-2.5 rounded-lg text-white font-medium shadow-lg disabled:opacity-50" style={{ backgroundColor: primary }}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save profile
          </button>
        </div>
      )}

      {docModal && (
        <DocumentModal
          companyId={selectedCompany.id}
          doc={docModal.doc}
          primary={primary}
          onClose={() => setDocModal(null)}
          onSaved={() => { setDocModal(null); loadDocs(selectedCompany.id); }}
        />
      )}
    </div>
  );
};

export default BidProfilePage;
