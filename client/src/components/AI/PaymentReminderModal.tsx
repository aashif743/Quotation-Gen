import React, { useEffect, useMemo, useState } from 'react';
import { X, Sparkles, Loader2, Copy, Check, MessageCircle, Mail, Smartphone, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { AiStatus, aiUnavailableText } from '../../services/aiApi';
import { formatCurrency, toDateInput } from '../../utils/calculations';

type Channel = 'whatsapp' | 'sms' | 'email';
type Tone = 'gentle' | 'firm' | 'final';
type Lang = 'en' | 'ny';

export interface ReminderInvoice {
  id: number;
  invoice_number: string;
  client_name: string;
  client_phone?: string | null;
  client_email?: string | null;
  grand_total: number | string;
  amount_paid?: number | string;
  balance_due?: number | string;
  date: string;
  due_days?: number | null;
  company_name?: string;
  company_bank_details?: string | null;
}

/** International number for wa.me / sms: Malawi numbers get +265. */
export const phoneForLinks = (raw?: string | null): string => {
  let d = String(raw || '').split(/[,/;]| or /i)[0].replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 10) d = `265${d.slice(1)}`;
  else if (d.length === 9 && /^[89]/.test(d)) d = `265${d}`;
  return d;
};

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** A ready-made reminder (no AI) — always available. */
const templateMessage = (inv: ReminderInvoice, channel: Channel, tone: Tone, bank: boolean, sender: string) => {
  const balance = formatCurrency(Number(inv.balance_due ?? Number(inv.grand_total) - Number(inv.amount_paid || 0)));
  // Local calendar date (an ISO timestamp from the API would shift a day if sliced).
  const issued = new Date(`${toDateInput(inv.date)}T00:00:00`);
  const due = inv.due_days ? new Date(issued.getTime() + Number(inv.due_days) * 86400000) : null;
  const overdue = due ? Math.floor((Date.now() - due.getTime()) / 86400000) : null;
  const dueText = due ? (overdue && overdue > 0 ? `was due on ${fmtDate(due)}` : `is due on ${fmtDate(due)}`) : 'is due';
  const ask = tone === 'final'
    ? 'Please settle this balance within 7 days of this message.'
    : tone === 'firm' ? 'Please arrange payment as soon as possible.' : 'We would appreciate payment at your earliest convenience.';
  const bankText = bank && inv.company_bank_details ? `\n\nPayment details:\n${inv.company_bank_details.trim()}` : '';
  const company = inv.company_name || '';
  if (channel === 'sms') {
    return {
      subject: '',
      message: `${tone === 'final' ? 'FINAL NOTICE: ' : ''}Dear ${inv.client_name}, invoice ${inv.invoice_number} has a balance of ${balance} which ${dueText}. ${ask} If already paid, please ignore. ${company}`,
    };
  }
  const opening = tone === 'gentle' ? 'This is a friendly reminder that' : tone === 'firm' ? 'Our records show that' : 'This is a final notice that';
  const body = `${opening} invoice ${inv.invoice_number} has an outstanding balance of ${channel === 'whatsapp' ? `*${balance}*` : balance}, which ${dueText}.\n\n${ask} If you have already paid, please send us the proof of payment and ignore this reminder.${bankText}`;
  if (channel === 'email') {
    return {
      subject: `${tone === 'final' ? 'Final notice' : 'Payment reminder'}: invoice ${inv.invoice_number}`,
      message: `Dear ${inv.client_name},\n\n${body}\n\nThank you.\n\nKind regards,\n${sender}\n${company}`,
    };
  }
  return { subject: '', message: `Hello ${inv.client_name},\n\n${body}\n\nThank you.\n${sender}\n${company}` };
};

const PaymentReminderModal: React.FC<{
  invoice: ReminderInvoice;
  aiStatus: AiStatus | null;
  isAdmin: boolean;
  senderName: string;
  primary: string;
  onClose: () => void;
}> = ({ invoice, aiStatus, isAdmin, senderName, primary, onClose }) => {
  const [channel, setChannel] = useState<Channel>(invoice.client_phone ? 'whatsapp' : 'email');
  const [tone, setTone] = useState<Tone>('gentle');
  const [lang, setLang] = useState<Lang>('en');
  const [bank, setBank] = useState(!!invoice.company_bank_details);
  const [note, setNote] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [byAi, setByAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const aiOn = !!aiStatus?.available;

  // Start from the ready-made message; it follows the options until AI writes one.
  const template = useMemo(() => templateMessage(invoice, channel, tone, bank, senderName), [invoice, channel, tone, bank, senderName]);
  useEffect(() => {
    if (byAi) return;
    setSubject(template.subject);
    setMessage(template.message);
  }, [template, byAi]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const writeWithAi = async () => {
    setBusy(true);
    setError('');
    try {
      const r = (await api.post('/ai/payment-reminder', {
        invoice_id: invoice.id, channel, tone, language: lang, include_bank: bank, note,
      })).data as { subject: string; message: string };
      setSubject(r.subject || (channel === 'email' ? template.subject : ''));
      setMessage(r.message);
      setByAi(true);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'The AI could not write the reminder.');
    } finally {
      setBusy(false);
    }
  };

  const resetToTemplate = () => { setByAi(false); };

  const phone = phoneForLinks(invoice.client_phone);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(channel === 'email' && subject ? `${subject}\n\n${message}` : message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy. Select the text and copy it manually.');
    }
  };
  const openLink = () => {
    const text = encodeURIComponent(message);
    const url = channel === 'whatsapp'
      ? `https://wa.me/${phone}?text=${text}`
      : channel === 'sms'
        ? `sms:${phone ? `+${phone}` : ''}?&body=${text}`
        : `mailto:${encodeURIComponent(invoice.client_email || '')}?subject=${encodeURIComponent(subject)}&body=${text}`;
    window.open(url, channel === 'whatsapp' ? '_blank' : '_self');
  };

  const seg = (on: boolean) => `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${on ? 'text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`;
  const segStyle = (on: boolean) => (on ? { backgroundColor: primary } : undefined);
  const openLabel = channel === 'whatsapp' ? 'Open WhatsApp' : channel === 'sms' ? 'Open SMS' : 'Open email';
  const OpenIcon = channel === 'whatsapp' ? MessageCircle : channel === 'sms' ? Smartphone : Mail;
  const missingContact = channel === 'email' ? !invoice.client_email : !phone;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Payment reminder</h3>
            <p className="text-sm text-gray-500">
              {invoice.client_name} · {invoice.invoice_number} · balance {formatCurrency(Number(invoice.balance_due ?? 0))}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5">
              {([['whatsapp', 'WhatsApp'], ['sms', 'SMS'], ['email', 'Email']] as [Channel, string][]).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setChannel(k)} className={seg(channel === k)} style={segStyle(channel === k)}>{l}</button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5">
              {([['gentle', 'Gentle'], ['firm', 'Firm'], ['final', 'Final notice']] as [Tone, string][]).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTone(k)} className={seg(tone === k)} style={segStyle(tone === k)}>{l}</button>
              ))}
            </div>
            {aiOn && (
              <div className="inline-flex rounded-lg border border-gray-300 p-0.5">
                {([['en', 'English'], ['ny', 'Chichewa']] as [Lang, string][]).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setLang(k)} className={seg(lang === k)} style={segStyle(lang === k)}>{l}</button>
                ))}
              </div>
            )}
          </div>

          {invoice.company_bank_details && (
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={bank} onChange={(e) => setBank(e.target.checked)} className="h-4 w-4 rounded" />
              Include our bank details
            </label>
          )}

          {aiOn ? (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything to add? e.g. mention the 50% deposit agreed"
                  className="flex-1 min-w-[12rem] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={writeWithAi}
                  disabled={busy}
                  className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: primary }}
                >
                  {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                  {byAi ? 'Write again' : 'Write with AI'}
                </button>
              </div>
              <p className="text-xs text-gray-400">
                {byAi ? <>Written by AI. Check it before sending. <button type="button" onClick={resetToTemplate} className="underline">Use the standard message</button></> : 'Below is the standard message. AI can write a personal one, also in Chichewa.'}
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-400">{aiUnavailableText(aiStatus, isAdmin)} The standard message below is ready to send.</p>
          )}

          {error && <div className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 bg-red-50 text-red-700"><AlertCircle size={15} /> {error}</div>}

          {channel === 'email' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input value={subject} onChange={(e) => { setSubject(e.target.value); setByAi(true); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={message}
              onChange={(e) => { setMessage(e.target.value); setByAi(true); }}
              rows={channel === 'sms' ? 5 : 11}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {channel === 'sms' && <p className={`text-xs mt-1 ${message.length > 320 ? 'text-amber-700' : 'text-gray-400'}`}>{message.length} characters{message.length > 160 ? ` · ${Math.ceil(message.length / 153)} SMS` : ''}</p>}
          </div>
          {missingContact && (
            <p className="text-xs text-amber-700">
              {channel === 'email' ? 'This client has no email address saved — you can pick one in your email app.' : 'This client has no phone number saved — you can pick the contact in WhatsApp / your phone.'}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm">Close</button>
          <button onClick={copy} className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-50">
            {copied ? <Check className="h-4 w-4 mr-1.5 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1.5" />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={openLink} disabled={!message.trim()} className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: channel === 'whatsapp' ? '#16a34a' : primary }}>
            <OpenIcon className="h-4 w-4 mr-1.5" /> {openLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentReminderModal;
