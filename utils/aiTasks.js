// AI tasks built on the shared service (utils/ai.js):
//   - paymentReminder: a WhatsApp / SMS / email reminder for an unpaid invoice
//   - scanReceipt:     read a receipt photo or PDF into expense fields
//
// Only the data each task needs is sent: for a reminder the invoice facts
// (client, number, amounts, dates, company name, optionally bank details);
// for a receipt the image itself plus the company's expense categories and
// vendor names (so the AI can match them).

const { runAi, AiError } = require('./ai');

const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

/* --------------------------- payment reminders --------------------------- */

const CHANNELS = {
  whatsapp: 'a WhatsApp message: short (under 120 words), friendly and clear, a few short lines, no subject. You may use *single asterisks* for bold on the key amount.',
  sms: 'an SMS: plain text under 300 characters, no emojis, no formatting, no subject.',
  email: 'an email: a clear subject line and a short, professional body with a greeting and a sign-off.',
};
const TONES = {
  gentle: 'polite and friendly — a gentle reminder; assume it may have been overlooked',
  firm: 'firm and clear but still polite — the payment is now late',
  final: 'final notice: serious and direct, polite, asking for payment within 7 days',
};
const LANGUAGES = { en: 'English', ny: 'Chichewa (Chinyanja), natural and respectful, with the amounts and invoice number kept as written' };

const REMINDER_TOOL = {
  name: 'write_reminder',
  description: 'Return the reminder.',
  input_schema: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Email subject line; empty string for WhatsApp or SMS.' },
      message: { type: 'string', description: 'The message text, ready to send.' },
    },
    required: ['subject', 'message'],
  },
};

/** `facts`: { company_name, client_name, invoice_number, invoice_date, due_date, days_overdue,
 *  total, paid, balance, currency_text, bank_details, sender_name } (all already formatted). */
async function paymentReminder(req, facts, opts) {
  const channel = CHANNELS[opts.channel] ? opts.channel : 'whatsapp';
  const tone = TONES[opts.tone] ? opts.tone : 'gentle';
  const language = LANGUAGES[opts.language] ? opts.language : 'en';

  const system = [
    'You write payment reminders that a company in Malawi sends to its clients.',
    `Write ${CHANNELS[channel]}`,
    `Tone: ${TONES[tone]}.`,
    `Language: ${LANGUAGES[language]}.`,
    'Use only the facts given, exactly as written (amounts, numbers, dates, names). Never invent a deadline, penalty, phone number or account; if a final notice needs a date, say "within 7 days".',
    'If bank details are given, include them so the client knows where to pay. Ask the client to send proof of payment, or to ignore the message if they have already paid.',
    'Sign off with the sender\'s name and the company name.',
  ].join(' ');

  const content = [
    `Company: ${facts.company_name}`,
    `Client: ${facts.client_name}`,
    `Invoice: ${facts.invoice_number}, dated ${facts.invoice_date}`,
    `Invoice total: ${facts.total}`,
    facts.paid_amount > 0 ? `Already paid: ${facts.paid}` : 'Nothing paid yet.',
    `Balance due: ${facts.balance}`,
    facts.due_date ? `Due date: ${facts.due_date}${facts.days_overdue > 0 ? ` (${facts.days_overdue} days overdue)` : facts.days_overdue === 0 ? ' (due today)' : ' (not yet due)'}` : 'Payment was due on receipt.',
    facts.bank_details ? `Bank details:\n${facts.bank_details}` : 'No bank details to include.',
    `Sender: ${facts.sender_name}`,
    opts.note ? `Extra instruction from the sender: ${clip(opts.note, 500)}` : '',
  ].filter(Boolean).join('\n');

  const { result } = await runAi({
    req, feature: 'payment_reminder', tier: 'fast', system, content, tool: REMINDER_TOOL, maxTokens: 900, companyId: facts.company_id,
  });
  if (!result || !result.message) throw new AiError('The AI returned an empty message. Please try again.');
  return { subject: channel === 'email' ? clip(result.subject, 200) : '', message: String(result.message).trim() };
}

/* ----------------------------- receipt scans ----------------------------- */

const METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque', 'Card', 'Other'];

const RECEIPT_TOOL = {
  name: 'read_receipt',
  description: 'Return what the receipt says. Use empty strings / 0 for anything that is not on it.',
  input_schema: {
    type: 'object',
    properties: {
      is_receipt: { type: 'boolean', description: 'false if the image is not a receipt, invoice or bill.' },
      date: { type: 'string', description: 'Date on the receipt as YYYY-MM-DD, or "".' },
      payee: { type: 'string', description: 'Shop / business that was paid.' },
      amount: { type: 'number', description: 'Total amount paid (the grand total, including tax). 0 if unreadable.' },
      currency: { type: 'string', description: 'ISO code, e.g. MWK, USD. "" if not shown.' },
      category: { type: 'string', description: 'Best matching category from the list given, or "".' },
      description: { type: 'string', description: 'Short description of what was bought, e.g. "Fuel - 40 L diesel" or "Printer paper and toner".' },
      reference: { type: 'string', description: 'Receipt / invoice number on the document, or "".' },
      payment_method: { type: 'string', enum: [...METHODS, ''], description: 'How it was paid if the receipt shows it.' },
      vendor_match: { type: 'string', description: 'Exactly one name from the vendor list if the payee is clearly that vendor, else "".' },
      notes: { type: 'string', description: 'Anything unclear the user should check (e.g. "total partly unreadable"), or "".' },
    },
    required: ['is_receipt', 'date', 'payee', 'amount', 'currency', 'category', 'description', 'reference', 'payment_method', 'vendor_match', 'notes'],
  },
};

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** `file`: { buffer, mimetype }. `ctx`: { company_id, categories[], vendors[], currency, today }. */
async function scanReceipt(req, file, ctx) {
  const isPdf = file.mimetype === 'application/pdf';
  if (!isPdf && !IMAGE_TYPES.includes(file.mimetype)) throw new AiError('Upload a photo (JPG or PNG) or a PDF of the receipt.', 400, 'bad_request');
  const data = file.buffer.toString('base64');
  const media = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: file.mimetype, data } };

  const system = [
    'You read receipts, bills and invoices for a business in Malawi and turn them into an expense record.',
    'Read carefully. Report only what the document shows; never guess an amount or a date.',
    'The amount is the final total paid. Amounts are often in Malawi Kwacha (MK / MWK).',
    'Dates on Malawian receipts are usually day/month/year.',
  ].join(' ');

  const text = [
    `Today is ${ctx.today}. The company's currency is ${ctx.currency || 'MWK'}.`,
    `Expense categories: ${ctx.categories.join(', ')}.`,
    ctx.vendors.length ? `Known vendors: ${ctx.vendors.slice(0, 150).join('; ')}.` : 'No known vendors.',
    'Read this receipt.',
  ].join('\n');

  const { result } = await runAi({
    req, feature: 'receipt_scan', tier: 'smart', system, content: [media, { type: 'text', text }],
    tool: RECEIPT_TOOL, maxTokens: 800, companyId: ctx.company_id,
  });
  const r = result || {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || '')) && !Number.isNaN(Date.parse(r.date)) ? r.date : '';
  const amount = Number(r.amount) > 0 ? Math.round(Number(r.amount) * 100) / 100 : 0;
  return {
    is_receipt: r.is_receipt !== false,
    date,
    payee: clip(r.payee, 150),
    amount,
    currency: clip(r.currency, 3).toUpperCase(),
    category: ctx.categories.includes(r.category) ? r.category : '',
    description: clip(r.description, 250),
    reference: clip(r.reference, 100),
    payment_method: METHODS.includes(r.payment_method) ? r.payment_method : '',
    vendor_match: ctx.vendors.includes(r.vendor_match) ? r.vendor_match : '',
    notes: clip(r.notes, 300),
  };
}

module.exports = { paymentReminder, scanReceipt, CHANNELS, TONES, LANGUAGES, METHODS };
