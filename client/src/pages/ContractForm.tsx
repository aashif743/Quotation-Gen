import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useTheme } from '../context/ThemeContext';
import { brandColorFor } from '../utils/colors';
import {
  getContract, createContract, updateContract, getNextContractNumber, getClients,
  getContractTemplate, saveContractTemplate, uploadContractSignature, deleteContractSignature,
} from '../services/api';
import { Client, Contract, ContractSection } from '../types';
import { buildDefaultSections, DEFAULT_CONTRACT_TITLE } from '../utils/contractTemplate';
import ContractDocument from '../components/Contract/ContractDocument';
import {
  FileSignature, ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, RotateCcw, Eye, EyeOff,
  Save, Loader2, AlertCircle, Upload, Star,
} from 'lucide-react';

const FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
  { value: 'one-time', label: 'One-time' },
];
const TITLE_SUGGESTIONS = [
  'Advertising Contract', 'Billboard Advertising Contract', 'Service Contract',
  'Rental Agreement', 'Maintenance Contract', 'Supply Agreement',
];
const today = () => new Date().toISOString().slice(0, 10);

interface FormState {
  contract_number: string;
  title: string;
  client_id: number | null;
  client_name: string;
  client_address: string;
  client_email: string;
  client_phone: string;
  site: string;
  amount: string;
  payment_frequency: string;
  payment_amount: string;
  insurance: string;
  printing_charges: string;
  effective_date: string;
  start_date: string;
  end_date: string;
  contract_period: string;
  termination_rules: string;
  comments: string;
  status: string;
  signature_url: string | null;
  sections: ContractSection[];
}

const blank = (): FormState => ({
  contract_number: '', title: DEFAULT_CONTRACT_TITLE, client_id: null, client_name: '',
  client_address: '', client_email: '', client_phone: '', site: '', amount: '',
  payment_frequency: 'monthly', payment_amount: '', insurance: '', printing_charges: '',
  effective_date: today(), start_date: today(), end_date: '', contract_period: '',
  termination_rules: '', comments: '', status: 'draft', signature_url: null, sections: [],
});

const ContractForm: React.FC = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { theme } = useTheme();
  const primary = brandColorFor(selectedCompany?.primary_color || '#1f3b5c', theme === 'dark');

  const [form, setForm] = useState<FormState>(blank());
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(true);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      if (!selectedCompany) return;
      setLoading(true);
      try {
        const cs = await getClients(selectedCompany.id).catch(() => []);
        setClients(cs);
        if (isEdit) {
          const c = await getContract(Number(id));
          setForm({
            contract_number: c.contract_number, title: c.title || 'Service Contract',
            client_id: c.client_id ?? null, client_name: c.client_name || '',
            client_address: c.client_address || '', client_email: c.client_email || '',
            client_phone: c.client_phone || '', site: c.site || '',
            amount: c.amount != null ? String(c.amount) : '',
            payment_frequency: c.payment_frequency || 'monthly',
            payment_amount: c.payment_amount != null ? String(c.payment_amount) : '',
            insurance: c.insurance ? String(c.insurance) : '',
            printing_charges: c.printing_charges ? String(c.printing_charges) : '',
            effective_date: (c.effective_date || '').slice(0, 10) || today(),
            start_date: (c.start_date || '').slice(0, 10) || '',
            end_date: (c.end_date || '').slice(0, 10) || '',
            contract_period: c.contract_period || '', termination_rules: c.termination_rules || '',
            comments: c.comments || '', status: c.status || 'draft',
            signature_url: c.signature_url || null,
            sections: c.sections && c.sections.length ? c.sections : [],
          });
        } else {
          // New contract starts from THIS user's saved default template if they
          // have one; otherwise the built-in default clauses.
          const [{ contractNumber }, tpl] = await Promise.all([
            getNextContractNumber(selectedCompany.id),
            getContractTemplate(selectedCompany.id).catch(() => ({ title: null, sections: null })),
          ]);
          setForm((f) => ({
            ...f,
            contract_number: contractNumber,
            title: tpl.title || f.title,
            sections: tpl.sections && tpl.sections.length ? tpl.sections : buildDefaultSections(),
          }));
        }
      } catch {
        setError('Failed to load. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, selectedCompany]);

  // Fill client contact details when the typed name matches a known client.
  const onClientName = (name: string) => {
    const match = clients.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    setForm((f) => ({
      ...f, client_name: name, client_id: match ? match.id : null,
      client_address: match?.address || (f.client_id ? '' : f.client_address),
      client_email: match?.email || (f.client_id ? '' : f.client_email),
      client_phone: match?.phone || (f.client_id ? '' : f.client_phone),
    }));
  };

  // Reset the clauses to the built-in system default (ignores the user's saved
  // personal default).
  const resetToSystemDefault = () => {
    if (form.sections.length && !window.confirm('Replace the current clauses with the built-in system default?')) return;
    set('sections', buildDefaultSections());
  };

  // Save the current clauses (and title) as THIS user's personal default for
  // future new contracts — only affects their own account.
  const [savingTpl, setSavingTpl] = useState(false);
  const saveAsMyDefault = async () => {
    if (!selectedCompany) return;
    setSavingTpl(true);
    try {
      await saveContractTemplate({ company_id: selectedCompany.id, title: form.title, sections: form.sections });
      setError('');
      window.alert('Saved as your default. Your next new contract will start with these clauses.');
    } catch {
      setError('Failed to save your default template.');
    } finally {
      setSavingTpl(false);
    }
  };

  // Signature upload (only available once the contract exists, i.e. in edit mode).
  const [uploadingSig, setUploadingSig] = useState(false);
  const onSignatureFile = async (file: File | null) => {
    if (!file || !isEdit) return;
    setUploadingSig(true);
    try {
      const { signature_url } = await uploadContractSignature(Number(id), file);
      set('signature_url', signature_url);
    } catch {
      setError('Failed to upload signature.');
    } finally {
      setUploadingSig(false);
    }
  };
  const removeSignature = async () => {
    if (!isEdit) { set('signature_url', null); return; }
    try { await deleteContractSignature(Number(id)); set('signature_url', null); }
    catch { setError('Failed to remove signature.'); }
  };

  const updateSection = (i: number, patch: Partial<ContractSection>) =>
    set('sections', form.sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const removeSection = (i: number) => set('sections', form.sections.filter((_, idx) => idx !== i));
  const addSection = () => set('sections', [...form.sections, { heading: '', body: '' }]);
  const moveSection = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= form.sections.length) return;
    const next = [...form.sections];
    [next[i], next[j]] = [next[j], next[i]];
    set('sections', next);
  };

  const preview: Contract = useMemo(() => ({
    id: 0, company_id: selectedCompany?.id || 0, contract_number: form.contract_number,
    title: form.title, client_name: form.client_name || '[Client name]', client_address: form.client_address,
    client_email: form.client_email, client_phone: form.client_phone, site: form.site,
    amount: Number(form.amount) || 0, currency: selectedCompany?.currency,
    payment_frequency: form.payment_frequency, payment_amount: Number(form.payment_amount) || 0,
    insurance: Number(form.insurance) || 0, printing_charges: Number(form.printing_charges) || 0,
    effective_date: form.effective_date, start_date: form.start_date, end_date: form.end_date,
    contract_period: form.contract_period, termination_rules: form.termination_rules, comments: form.comments,
    signature_url: form.signature_url, sections: form.sections, status: form.status as Contract['status'],
    company_name: selectedCompany?.name, company_address: selectedCompany?.address,
    company_tpin: selectedCompany?.tpin, company_logo: selectedCompany?.logo_url,
    primary_color: selectedCompany?.primary_color, company_currency: selectedCompany?.currency,
  }), [form, selectedCompany]);

  const save = async () => {
    setError('');
    if (!selectedCompany) return;
    if (!form.client_name.trim()) { setError('Client name is required.'); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: selectedCompany.id, contract_number: form.contract_number, title: form.title,
        client_id: form.client_id, client_name: form.client_name, client_address: form.client_address,
        client_email: form.client_email, client_phone: form.client_phone, site: form.site,
        amount: Number(form.amount) || 0, currency: selectedCompany.currency,
        payment_frequency: form.payment_frequency, payment_amount: Number(form.payment_amount) || 0,
        insurance: Number(form.insurance) || 0, printing_charges: Number(form.printing_charges) || 0,
        effective_date: form.effective_date || null, start_date: form.start_date || null,
        end_date: form.end_date || null, contract_period: form.contract_period,
        termination_rules: form.termination_rules, comments: form.comments,
        sections: form.sections, status: form.status as Contract['status'],
      };
      const saved = isEdit ? await updateContract(Number(id), payload) : await createContract(payload);
      navigate(`/contracts/${saved.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save contract.');
    } finally {
      setSaving(false);
    }
  };

  if (!selectedCompany) return <div className="p-6 text-gray-500">Select a company first.</div>;
  if (loading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/contracts')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><ArrowLeft size={20} /></button>
          <div className="flex items-center gap-2">
            <FileSignature style={{ color: primary }} size={22} />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{isEdit ? 'Edit Contract' : 'New Contract'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreview((s) => !s)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            {showPreview ? <EyeOff size={15} /> : <Eye size={15} />}{showPreview ? 'Hide preview' : 'Show preview'}
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ background: primary }}>
            {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}{isEdit ? 'Save changes' : 'Create contract'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm flex items-center gap-2 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className={`grid gap-6 ${showPreview ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        {/* ---- Form ---- */}
        <div className="space-y-5">
          <Card title="Contract details">
            <div className="grid sm:grid-cols-2 gap-3">
              <L label="Contract title">
                <input list="ct-titles" value={form.title} onChange={(e) => set('title', e.target.value)} className={inp} placeholder="e.g. Advertising Contract" />
                <datalist id="ct-titles">{TITLE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
              </L>
              <L label="Contract number"><input value={form.contract_number} onChange={(e) => set('contract_number', e.target.value)} className={inp} /></L>
              <L label="Effective date"><input type="date" value={form.effective_date} onChange={(e) => set('effective_date', e.target.value)} className={inp} /></L>
              <L label="Status">
                <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inp}>
                  <option value="draft">Draft</option><option value="active">Active</option>
                  <option value="completed">Completed</option><option value="terminated">Terminated</option>
                </select>
              </L>
            </div>
          </Card>

          <Card title="Client">
            <div className="grid sm:grid-cols-2 gap-3">
              <L label="Client name *">
                <input list="ct-clients" value={form.client_name} onChange={(e) => onClientName(e.target.value)} className={inp} placeholder="Client / advertiser name" />
                <datalist id="ct-clients">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
              </L>
              <L label="Email"><input value={form.client_email} onChange={(e) => set('client_email', e.target.value)} className={inp} /></L>
              <L label="Phone"><input value={form.client_phone} onChange={(e) => set('client_phone', e.target.value)} className={inp} /></L>
              <L label="Address"><input value={form.client_address} onChange={(e) => set('client_address', e.target.value)} className={inp} /></L>
            </div>
          </Card>

          <Card title="Site & payment">
            <div className="grid sm:grid-cols-2 gap-3">
              <L label="Site / Location" full><textarea value={form.site} onChange={(e) => set('site', e.target.value)} rows={2} className={inp} placeholder="Billboard location / site address / intersection" /></L>
              <L label={`Contract amount (${selectedCompany.currency})`}><input type="number" min={0} value={form.amount} onChange={(e) => set('amount', e.target.value)} className={inp} placeholder="Total value (optional)" /></L>
              <L label="Payment frequency">
                <select value={form.payment_frequency} onChange={(e) => set('payment_frequency', e.target.value)} className={inp}>
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </L>
              <L label={`Payment amount (${selectedCompany.currency})`}><input type="number" min={0} value={form.payment_amount} onChange={(e) => set('payment_amount', e.target.value)} className={inp} placeholder="Per payment" /></L>
              <L label={`Insurance (${selectedCompany.currency})`}><input type="number" min={0} value={form.insurance} onChange={(e) => set('insurance', e.target.value)} className={inp} placeholder="Optional" /></L>
              <L label={`Printing / production charges (${selectedCompany.currency})`}><input type="number" min={0} value={form.printing_charges} onChange={(e) => set('printing_charges', e.target.value)} className={inp} placeholder="Optional" /></L>
            </div>
          </Card>

          <Card title="Term & rules">
            <div className="grid sm:grid-cols-2 gap-3">
              <L label="Start date"><input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} className={inp} /></L>
              <L label="End date"><input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} className={inp} /></L>
              <L label="Contract period"><input value={form.contract_period} onChange={(e) => set('contract_period', e.target.value)} className={inp} placeholder="e.g. 12 months" /></L>
              <div />
              <L label="Termination rules" full><textarea value={form.termination_rules} onChange={(e) => set('termination_rules', e.target.value)} rows={3} className={inp} placeholder="e.g. 30 days notice; early removal fee of 2 months rent…" /></L>
              <L label="Other comments" full><textarea value={form.comments} onChange={(e) => set('comments', e.target.value)} rows={2} className={inp} placeholder="Any additional terms (optional)" /></L>
            </div>
          </Card>

          <Card title="Contract clauses"
            action={
              <div className="flex items-center gap-2">
                <button onClick={saveAsMyDefault} disabled={savingTpl} title="Save these clauses as your personal default for future contracts"
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: primary }}>
                  <Star size={14} /> {savingTpl ? 'Saving…' : 'Save as my default'}
                </button>
                <button onClick={resetToSystemDefault} title="Reset to the built-in default wording"
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <RotateCcw size={14} /> Reset
                </button>
              </div>
            }>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Edit any wording, reorder, add or remove clauses — the PDF uses exactly what's here. Your edits are saved as
              <strong> your own default</strong> when you save the contract (only for your account); use <strong>Save as my default</strong> to set them without saving a contract.
            </p>
            <div className="space-y-3">
              {form.sections.map((s, i) => (
                <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-400 w-5">{i + 1}.</span>
                    <input value={s.heading} onChange={(e) => updateSection(i, { heading: e.target.value })} placeholder="Clause heading" className={`${inp} font-medium`} />
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveSection(i, -1)} disabled={i === 0} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"><ChevronUp size={15} /></button>
                      <button onClick={() => moveSection(i, 1)} disabled={i === form.sections.length - 1} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"><ChevronDown size={15} /></button>
                      <button onClick={() => removeSection(i)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <textarea value={s.body} onChange={(e) => updateSection(i, { body: e.target.value })} rows={4} placeholder="Clause text" className={inp} />
                </div>
              ))}
            </div>
            <button onClick={addSection} className="mt-3 flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 w-full justify-center">
              <Plus size={15} /> Add clause
            </button>
          </Card>

          <Card title="Digital signature">
            {isEdit ? (
              <div className="flex items-center gap-4">
                {form.signature_url ? (
                  <img src={form.signature_url} alt="Signature" className="h-16 max-w-[200px] object-contain border border-gray-200 dark:border-gray-700 rounded bg-white p-1" />
                ) : (
                  <div className="h-16 w-40 flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded">No signature</div>
                )}
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg text-white cursor-pointer w-fit" style={{ background: primary }}>
                    <Upload size={15} /> {uploadingSig ? 'Uploading…' : (form.signature_url ? 'Replace' : 'Upload signature')}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onSignatureFile(e.target.files?.[0] || null)} disabled={uploadingSig} />
                  </label>
                  {form.signature_url && <button onClick={removeSignature} className="text-sm text-red-500 hover:underline text-left">Remove</button>}
                  <p className="text-xs text-gray-400">Appears above the Company signature line. PNG with transparent background works best.</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Save the contract first, then reopen it (Edit) to upload a signature image.</p>
            )}
          </Card>
        </div>

        {/* ---- Live preview ---- */}
        {showPreview && (
          <div className="lg:sticky lg:top-4 self-start">
            <div className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">Live preview</div>
            <div className="bg-gray-100 dark:bg-gray-900 rounded-xl p-3 overflow-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
              <div className="bg-white shadow-sm mx-auto" style={{ maxWidth: 820 }}>
                <ContractDocument contract={preview} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// small UI helpers ----------------------------------------------------------
const inp = 'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-0';

const Card: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, action, children }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
      {action}
    </div>
    {children}
  </div>
);

const L: React.FC<{ label: string; full?: boolean; children: React.ReactNode }> = ({ label, full, children }) => (
  <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
    <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</span>
    {children}
  </label>
);

export default ContractForm;
