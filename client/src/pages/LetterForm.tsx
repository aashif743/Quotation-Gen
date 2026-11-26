import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, AlertCircle, Sparkles, Wand2, FileText, PenLine, Upload, AlertTriangle, ChevronDown,
} from 'lucide-react';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Client } from '../types';
import { brandColorFor } from '../utils/colors';
import ClientPicker from '../components/Quotation/ClientPicker';
import DocumentPreview, { PreviewColumn, PreviewToggleButton, usePreviewToggle } from '../components/Document/DocumentPreview';
import LetterDocument, { LetterDocCompany } from '../components/Letter/LetterDocument';
import { LETTER_TEMPLATES, placeholdersIn } from '../utils/letterTemplates';
import { AiStatus, aiUnavailableText } from '../services/aiApi';
import {
  createLetter, draftLetterWithAi, getLetter, getLetterOptions, LetterTone, Signer, updateLetter, uploadMySignature,
} from '../services/lettersApi';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const CLOSINGS = ['Yours faithfully,', 'Yours sincerely,', 'Kind regards,', 'Yours truly,'];
const TONES: { key: LetterTone; label: string }[] = [
  { key: 'formal', label: 'Formal' },
  { key: 'friendly', label: 'Friendly' },
  { key: 'firm', label: 'Firm' },
  { key: 'apologetic', label: 'Apologetic' },
];

interface FormState {
  letter_number: string;
  date: string;
  reference: string;
  recipient_name: string;
  recipient_title: string;
  recipient_company: string;
  recipient_address: string;
  subject: string;
  salutation: string;
  body: string;
  closing: string;
  signer_user_id: number | null;
  signer_name: string;
  signer_title: string;
  show_signature: boolean;
  cc: string;
  enclosures: string;
}

const blank = (): FormState => ({
  letter_number: '', date: todayIso(), reference: '', recipient_name: '', recipient_title: '', recipient_company: '',
  recipient_address: '', subject: '', salutation: 'Dear Sir/Madam,', body: '', closing: 'Yours faithfully,',
  signer_user_id: null, signer_name: '', signer_title: '', show_signature: true, cc: '', enclosures: '',
});

/** Textarea that grows with its text. */
const GrowingTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }> = ({ minRows = 3, value, ...rest }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} rows={minRows} value={value} {...rest} />;
};

/** /letters/new and /letters/:id/edit */
const LetterForm: React.FC = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();
  const [showPreview, togglePreview] = usePreviewToggle();

  const [form, setForm] = useState<FormState>(blank);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [letterCompany, setLetterCompany] = useState<LetterDocCompany | null>(null);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [placeholderWarning, setPlaceholderWarning] = useState<string[] | null>(null);

  // AI panel
  const [context, setContext] = useState('');
  const [tone, setTone] = useState<LetterTone>('formal');
  const [drafting, setDrafting] = useState<'' | 'new' | 'improve'>('');
  const [templatesOpen, setTemplatesOpen] = useState(!isEdit);
  const [uploadingSig, setUploadingSig] = useState(false);
  // The signer or their signature changed here: the saved letter takes the new one.
  const [refreshSignature, setRefreshSignature] = useState(false);
  const sigInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Typing the recipient's name keeps a "Dear [Name]," / "Dear <old name>,"
  // greeting in step with it.
  const setRecipientName = (name: string) => setForm((f) => {
    const old = f.recipient_name.trim();
    const follows = f.salutation === 'Dear [Name],' || (!!old && f.salutation === `Dear ${old},`);
    return { ...f, recipient_name: name, ...(follows ? { salutation: name.trim() ? `Dear ${name.trim()},` : 'Dear [Name],' } : {}) };
  });

  const applySigner = (s: Signer | undefined) => {
    if (!s) return;
    setForm((f) => ({ ...f, signer_user_id: s.id, signer_name: s.name, signer_title: s.job_title || '' }));
    setSignatureUrl(s.signature_url || null);
    setRefreshSignature(true);
  };

  // Options for the company: next number, who can sign, AI on/off.
  const loadOptions = async (coId: number, keepSigner: boolean) => {
    const o = await getLetterOptions(coId);
    setSigners(o.signers);
    setAiEnabled(o.ai_enabled);
    setAiStatus(o.ai || null);
    if (!keepSigner) {
      setForm((f) => ({ ...f, letter_number: f.letter_number || o.next_number }));
      applySigner(o.signers.find((s) => s.id === user?.id) || o.signers[0]);
    }
    return o;
  };

  // New letter.
  useEffect(() => {
    if (isEdit || !selectedCompany) return;
    setForm(blank());
    setCompanyId(selectedCompany.id);
    setLetterCompany(null);
    loadOptions(selectedCompany.id, false).catch(() => setError('Could not load letter options.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, selectedCompany]);

  // Edit: load the letter (its own company's letterhead).
  useEffect(() => {
    if (!isEdit) return;
    getLetter(Number(id))
      .then(async (l) => {
        setCompanyId(l.company_id);
        setLetterCompany({
          name: l.company_name || '', address: l.company_address, tpin: l.company_tpin,
          logo_url: l.company_quote_logo || l.company_logo, primary_color: l.primary_color, secondary_color: l.secondary_color,
          template: l.company_template, letterhead: l.company_letterhead, letter_details: l.company_letter_details,
        });
        setForm({
          letter_number: l.letter_number, date: l.letter_date, reference: l.reference || '',
          recipient_name: l.recipient_name || '', recipient_title: l.recipient_title || '', recipient_company: l.recipient_company || '',
          recipient_address: l.recipient_address || '', subject: l.subject || '', salutation: l.salutation || '',
          body: l.body || '', closing: l.closing || '', signer_user_id: l.signer_user_id ?? null, signer_name: l.signer_name || '',
          signer_title: l.signer_title || '', show_signature: !!l.show_signature, cc: l.cc || '', enclosures: l.enclosures || '',
        });
        setSignatureUrl(l.signature_url || null);
        await loadOptions(l.company_id, true).catch(() => {});
      })
      .catch((e) => setError(e?.response?.data?.error || 'Could not load the letter.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const companyName = letterCompany?.name || selectedCompany?.name || '';

  const applyTemplate = (tid: string) => {
    const t = LETTER_TEMPLATES.find((x) => x.id === tid);
    if (!t) return;
    if (form.body.trim() && !window.confirm('Replace the current letter text with this template?')) return;
    const fill = (s: string) => s.split('{company}').join(companyName || 'our company');
    setForm((f) => ({
      ...f, subject: fill(t.subject), body: fill(t.body), closing: t.closing,
      salutation: t.salutation === 'Dear [Name],' && f.recipient_name.trim() ? `Dear ${f.recipient_name.trim()},` : t.salutation,
    }));
    setTemplatesOpen(false);
  };

  const pickClient = (c: Client) => setForm((f) => ({
    ...f, recipient_company: c.name, recipient_address: c.address || f.recipient_address,
  }));

  const runAi = async (mode: 'new' | 'improve') => {
    if (!companyId) return;
    if (context.trim().length < 5) { setError('Describe what the letter should say first.'); return; }
    setError('');
    setDrafting(mode);
    try {
      const d = await draftLetterWithAi({
        company_id: companyId, context, tone, improve: mode === 'improve',
        recipient_name: form.recipient_name, recipient_title: form.recipient_title, recipient_company: form.recipient_company,
        signer_name: form.signer_name, signer_title: form.signer_title,
        subject: form.subject, body: form.body,
      });
      setForm((f) => ({ ...f, subject: d.subject || f.subject, salutation: d.salutation || f.salutation, body: d.body, closing: d.closing || f.closing }));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'The AI could not write the letter. Please try again.');
    } finally {
      setDrafting('');
    }
  };

  const onSignatureFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('The image is too large (max 5 MB).'); return; }
    setUploadingSig(true);
    setError('');
    try {
      const me = await uploadMySignature(file);
      if (companyId) {
        const o = await getLetterOptions(companyId);
        setSigners(o.signers);
      }
      if (!form.signer_user_id || form.signer_user_id === user?.id) {
        setSignatureUrl(me.signature_url || null);
        setRefreshSignature(true);
        setForm((f) => ({ ...f, signer_user_id: user?.id ?? null, signer_name: f.signer_name || me.name, signer_title: f.signer_title || me.job_title || '' }));
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not upload the signature.');
    } finally {
      setUploadingSig(false);
    }
  };

  const remaining = useMemo(
    () => placeholdersIn(form.subject, form.salutation, form.body, form.recipient_name, form.recipient_company),
    [form.subject, form.salutation, form.body, form.recipient_name, form.recipient_company]
  );

  const save = async (ignorePlaceholders = false) => {
    setError('');
    if (!form.body.trim()) { setError('Write the letter first — use a template, AI or type it.'); return; }
    if (!ignorePlaceholders && remaining.length) { setPlaceholderWarning(remaining); return; }
    setPlaceholderWarning(null);
    if (!companyId) return;
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        letter_number: form.letter_number,
        date: form.date,
        reference: form.reference,
        recipient_name: form.recipient_name,
        recipient_title: form.recipient_title,
        recipient_company: form.recipient_company,
        recipient_address: form.recipient_address,
        subject: form.subject,
        salutation: form.salutation,
        body: form.body,
        closing: form.closing,
        signer_user_id: form.signer_user_id,
        refresh_signature: refreshSignature,
        signer_name: form.signer_name,
        signer_title: form.signer_title,
        show_signature: form.show_signature,
        cc: form.cc,
        enclosures: form.enclosures,
      };
      const saved = isEdit ? await updateLetter(Number(id), payload) : await createLetter(payload);
      navigate(`/letters/${saved.id}`, { replace: isEdit });
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not save the letter.');
    } finally {
      setSaving(false);
    }
  };

  if (!selectedCompany) return <div className="text-center">Please select a company</div>;
  if (loading) return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={30} /></div>;

  const docCompany: LetterDocCompany = letterCompany || {
    name: selectedCompany.name, address: selectedCompany.address, tpin: selectedCompany.tpin,
    logo_url: selectedCompany.quote_logo_url || selectedCompany.logo_url,
    primary_color: selectedCompany.primary_color, secondary_color: selectedCompany.secondary_color,
    template: selectedCompany.template, letterhead: selectedCompany.letterhead, letter_details: selectedCompany.letter_details,
  };
  const primary = brandColorFor(docCompany.primary_color || '#4f46e5', theme === 'dark');
  const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const label = 'block text-sm font-medium text-gray-700 mb-1.5';
  const card = 'bg-white rounded-lg shadow-sm border border-gray-200 p-6';
  const me = signers.find((s) => s.id === user?.id);
  const signingAsMe = !form.signer_user_id || form.signer_user_id === user?.id;
  const categories = Array.from(new Set(LETTER_TEMPLATES.map((t) => t.category)));

  return (
    <div className={showPreview ? 'max-w-[1700px] mx-auto' : 'max-w-4xl mx-auto'}>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={() => navigate(-1)} className="inline-flex items-center px-4 py-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </button>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-gray-900">{isEdit ? `Edit Letter ${form.letter_number}` : 'New Letter'}</h1>
            <p className="text-gray-600 mt-2">On {companyName}'s letterhead, ready to download as PDF.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PreviewToggleButton show={showPreview} onToggle={togglePreview} />
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="inline-flex items-center px-6 py-3 rounded-lg shadow-sm text-base font-medium text-white hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: primary }}
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {isEdit ? 'Save changes' : 'Save letter'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg text-sm flex items-center gap-2 bg-red-50 text-red-700">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </div>
      )}
      {placeholderWarning && (
        <div className="mb-6 px-4 py-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Some blanks still need filling in:</p>
              <p className="mt-1 break-words">{placeholderWarning.join(', ')}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setPlaceholderWarning(null)} className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 font-medium">Keep editing</button>
                <button onClick={() => save(true)} className="px-3 py-1.5 rounded-lg text-amber-800 hover:bg-amber-100">Save anyway</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={showPreview ? 'grid grid-cols-1 xl:grid-cols-2 gap-8 items-start' : ''}>
        <div className="space-y-6">
          {/* Start: AI + templates */}
          <div className={card}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5" style={{ color: primary }} />
              <h2 className="text-xl font-semibold">Write with AI</h2>
            </div>
            {aiEnabled ? (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  Say what the letter is about. Include names, amounts and dates; the AI won't make them up.
                  Fill in the recipient below first for a better letter.
                </p>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={3}
                  className={input}
                  placeholder="e.g. Remind ABC Ltd that invoice SP-INV-0042 for MK 850,000 was due on 30 October. Ask them to pay by 30 November."
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-lg border border-gray-300 p-0.5">
                    {TONES.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTone(t.key)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium ${tone === t.key ? 'text-white' : 'text-gray-600 hover:text-gray-900'}`}
                        style={tone === t.key ? { backgroundColor: primary } : undefined}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 ml-auto">
                    {form.body.trim() && (
                      <button
                        type="button"
                        onClick={() => runAi('improve')}
                        disabled={!!drafting}
                        className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                        title="Rewrite the current letter using these instructions"
                      >
                        {drafting === 'improve' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1.5" />}
                        Improve current
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => runAi('new')}
                      disabled={!!drafting}
                      className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: primary }}
                    >
                      {drafting === 'new' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                      {drafting === 'new' ? 'Writing…' : 'Write letter'}
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-400">Check the letter before sending — you can edit everything the AI writes.</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                {aiUnavailableText(aiStatus, isAdmin)} Start from a template below or type the letter.
              </p>
            )}

            <div className="mt-5 pt-5 border-t border-gray-200">
              <button type="button" onClick={() => setTemplatesOpen((o) => !o)} className="w-full flex items-center justify-between text-left">
                <span className="flex items-center gap-2 font-semibold text-gray-900">
                  <FileText className="h-4 w-4 text-gray-500" /> Start from a template
                </span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${templatesOpen ? 'rotate-180' : ''}`} />
              </button>
              {templatesOpen && (
                <div className="mt-4 space-y-3">
                  {categories.map((cat) => (
                    <div key={cat}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{cat}</p>
                      <div className="flex flex-wrap gap-2">
                        {LETTER_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => applyTemplate(t.id)}
                            className="px-3 py-1.5 rounded-full border border-gray-300 bg-white text-sm text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400">Replace the words in [square brackets] with your details.</p>
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className={card}>
            <h2 className="text-xl font-semibold mb-5">Letter details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className={label}>Our reference</label>
                <input value={form.letter_number} onChange={(e) => set('letter_number', e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Date</label>
                <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Your reference <span className="text-gray-400 font-normal">(optional)</span></label>
                <input value={form.reference} onChange={(e) => set('reference', e.target.value)} className={input} placeholder="Their letter / LPO no." />
              </div>
            </div>
          </div>

          {/* Recipient */}
          <div className={card}>
            <h2 className="text-xl font-semibold mb-5">To</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={label}>Name</label>
                <input value={form.recipient_name} onChange={(e) => setRecipientName(e.target.value)} className={input} placeholder="e.g. Mr. J. Banda" />
              </div>
              <div>
                <label className={label}>Position</label>
                <input value={form.recipient_title} onChange={(e) => set('recipient_title', e.target.value)} className={input} placeholder="e.g. Procurement Manager" />
              </div>
              <div className="md:col-span-2">
                <label className={label}>Organisation</label>
                <ClientPicker
                  companyId={companyId || selectedCompany.id}
                  value={form.recipient_company}
                  onChange={(name) => set('recipient_company', name)}
                  onSelect={pickClient}
                />
                <p className="mt-1 text-xs text-gray-400">Pick a client to fill in their address.</p>
              </div>
              <div className="md:col-span-2">
                <label className={label}>Address</label>
                <textarea value={form.recipient_address} onChange={(e) => set('recipient_address', e.target.value)} rows={3} className={input} placeholder={'P.O. Box 123\nLilongwe'} />
              </div>
            </div>
          </div>

          {/* Letter */}
          <div className={card}>
            <h2 className="text-xl font-semibold mb-5">Letter</h2>
            <div className="space-y-5">
              <div>
                <label className={label}>Subject</label>
                <input value={form.subject} onChange={(e) => set('subject', e.target.value)} className={input} placeholder="Printed as “RE: …”" />
              </div>
              <div>
                <label className={label}>Greeting</label>
                <input value={form.salutation} onChange={(e) => set('salutation', e.target.value)} className={input} list="letter-salutations" />
                <datalist id="letter-salutations">
                  {['Dear Sir/Madam,', 'Dear Sir,', 'Dear Madam,', 'To Whom It May Concern,', form.recipient_name ? `Dear ${form.recipient_name},` : ''].filter(Boolean).map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <label className={label}>Letter text</label>
                <GrowingTextarea
                  minRows={10}
                  value={form.body}
                  onChange={(e) => set('body', e.target.value)}
                  className={`${input} leading-relaxed resize-none overflow-hidden`}
                  placeholder={'Write the letter here.\n\nLeave an empty line between paragraphs. Start lines with "- " for a list.'}
                />
                {remaining.length > 0 && (
                  <p className="mt-1.5 text-xs text-amber-700">Still to fill in: {remaining.slice(0, 6).join(', ')}{remaining.length > 6 ? '…' : ''}</p>
                )}
              </div>
              <div className="md:w-1/2">
                <label className={label}>Closing</label>
                <select value={form.closing} onChange={(e) => set('closing', e.target.value)} className={`${input} bg-white`}>
                  {(CLOSINGS.includes(form.closing) ? CLOSINGS : [form.closing, ...CLOSINGS]).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Signature */}
          <div className={card}>
            <div className="flex items-center gap-2 mb-5">
              <PenLine className="h-5 w-5" style={{ color: primary }} />
              <h2 className="text-xl font-semibold">Signed by</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {isAdmin && signers.length > 1 && (
                <div className="md:col-span-2">
                  <label className={label}>Signature of</label>
                  <select
                    value={form.signer_user_id ?? ''}
                    onChange={(e) => applySigner(signers.find((s) => s.id === Number(e.target.value)))}
                    className={`${input} bg-white`}
                  >
                    {!signers.some((s) => s.id === form.signer_user_id) && form.signer_user_id && <option value={form.signer_user_id}>{form.signer_name} (saved)</option>}
                    {signers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.job_title ? ` — ${s.job_title}` : ''}{s.signature_url ? '' : ' (no signature yet)'}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className={label}>Name</label>
                <input value={form.signer_name} onChange={(e) => set('signer_name', e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Position</label>
                <input value={form.signer_title} onChange={(e) => set('signer_title', e.target.value)} className={input} placeholder="e.g. Managing Director" />
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 p-4">
                <div className="h-16 w-44 flex items-center justify-center rounded-md bg-white border border-dashed border-gray-300 overflow-hidden" style={{ backgroundColor: '#fff' }}>
                  {signatureUrl ? <img src={signatureUrl} alt="Signature" className="max-h-14 max-w-[10rem] object-contain" /> : <span className="text-xs text-gray-400">No signature</span>}
                </div>
                <div className="flex-1 min-w-[12rem] space-y-2">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.show_signature} onChange={(e) => set('show_signature', e.target.checked)} className="h-4 w-4 rounded" />
                    Print the signature on the letter
                  </label>
                  {signingAsMe && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input ref={sigInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { onSignatureFile(e.target.files?.[0] || null); e.target.value = ''; }} />
                      <button
                        type="button"
                        onClick={() => sigInput.current?.click()}
                        disabled={uploadingSig}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        {uploadingSig ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                        {me?.signature_url ? 'Upload a new signature' : 'Upload your signature'}
                      </button>
                      <span className="text-xs text-gray-400">PNG with a white or clear background works best. Saved to <Link to="/profile" className="underline">your profile</Link>.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Extras */}
          <div className={card}>
            <h2 className="text-xl font-semibold mb-5">Enclosures &amp; copies <span className="text-sm font-normal text-gray-400">(optional)</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={label}>Enclosures</label>
                <input value={form.enclosures} onChange={(e) => set('enclosures', e.target.value)} className={input} placeholder="e.g. Quotation SP-QT-0012" />
              </div>
              <div>
                <label className={label}>Copy to (cc)</label>
                <input value={form.cc} onChange={(e) => set('cc', e.target.value)} className={input} placeholder="e.g. Finance Manager" />
              </div>
            </div>
          </div>
        </div>

        {showPreview && (
          <PreviewColumn>
            <DocumentPreview watch={[form, signatureUrl, letterCompany, selectedCompany]}>
              <LetterDocument
                data={{ ...form, signature_url: signatureUrl }}
                company={docCompany}
              />
            </DocumentPreview>
          </PreviewColumn>
        )}
      </div>
    </div>
  );
};

export default LetterForm;
