import React from 'react';
import { ReceiptData } from '../../services/cashSalesApi';
import { formatCurrency } from '../../utils/calculations';
import { amountInWords } from '../../utils/amountInWords';

/**
 * Printable payment receipt (A4), in the company's brand colour: letterhead,
 * the amount received (in figures and in words), who paid, what it was for,
 * how it was paid, the invoice balance after it, and signature & stamp boxes.
 * Inline styles so html2canvas captures it exactly; the root class
 * `receipt-document` is what the PDF generator looks for.
 */

const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const s = String(d);
  const x = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return isNaN(x.getTime()) ? s : x.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
};

const isHex = (c?: string | null) => !!c && /^#?[0-9a-f]{6}$/i.test(c);
const rgba = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
};

// The ticked payment method on the receipt.
const METHODS: { key: string; label: string; match: RegExp }[] = [
  { key: 'cash', label: 'Cash', match: /cash/i },
  { key: 'bank', label: 'Bank transfer', match: /bank|transfer|eft|deposit/i },
  { key: 'mobile', label: 'Mobile money', match: /mobile|airtel|mpamba|tnm/i },
  { key: 'cheque', label: 'Cheque', match: /cheque|check/i },
  { key: 'other', label: 'Other', match: /.*/ },
];
const methodKey = (m?: string | null) => {
  if (!m) return 'cash';
  if (/card/i.test(m)) return 'other';
  return (METHODS.find((x) => x.match.test(m)) || METHODS[4]).key;
};

const ReceiptDocument: React.FC<{ receipt: ReceiptData; rootClassName?: string }> = ({ receipt: r, rootClassName = '' }) => {
  const inv = r.invoice;
  const primary = isHex(inv.primary_color) ? `#${String(inv.primary_color).replace('#', '')}` : '#1f3b5c';
  const currency = inv.company_currency || undefined;
  const logo = inv.company_quote_logo || inv.company_logo;
  const amount = Number(r.amount) || 0;
  const total = Number(inv.grand_total) || 0;
  const discount = Number(r.discount_with_payment) || 0;
  const balance = Number(r.balance_after) || 0;
  const isSale = inv.doc_type === 'cash_sale';
  const ticked = methodKey(r.method);
  const otherMethod = ticked === 'other' && r.method && !/^other$/i.test(r.method) ? r.method : '';
  const forWhat = isSale ? `Cash sale ${inv.invoice_number}` : `Invoice ${inv.invoice_number}`;
  const note = r.notes && !/^cash sale$/i.test(r.notes.trim()) ? r.notes : '';
  const clientLines = [inv.client_address, inv.client_phone, inv.client_email].filter(Boolean) as string[];

  const sans = "'Segoe UI', Helvetica, Arial, sans-serif";
  const s: Record<string, React.CSSProperties> = {
    root: {
      position: 'relative', background: '#fff', color: '#1f2937', width: '100%', aspectRatio: '210 / 297',
      boxSizing: 'border-box', padding: '44px 56px 36px', display: 'flex', flexDirection: 'column',
      fontFamily: sans, fontSize: 14, lineHeight: 1.5,
    },
    label: { fontSize: 10.5, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: '#6b7280', margin: '0 0 6px' },
    line: { borderBottom: '1.5px dotted #9ca3af', paddingBottom: 6, minHeight: 26 },
    box: { border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px' },
    row: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 13.5 },
  };

  return (
    <div className={rootClassName} style={s.root}>
      {/* Brand bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, background: primary }} />

      {/* Letterhead */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }} data-pdf-keep>
        <div style={{ minWidth: 0 }}>
          {logo
            ? <img src={logo} alt="" crossOrigin="anonymous" style={{ maxHeight: 72, maxWidth: 280, objectFit: 'contain', display: 'block' }} />
            : <div style={{ fontSize: 24, fontWeight: 800, color: primary }}>{inv.company_name}</div>}
          <div style={{ marginTop: 10, fontSize: 12, color: '#4b5563', lineHeight: 1.55 }}>
            {logo && <div style={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>{inv.company_name}</div>}
            {inv.company_address && <div style={{ whiteSpace: 'pre-wrap' }}>{inv.company_address}</div>}
            {inv.company_tpin && <div>TPIN: {inv.company_tpin}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: primary, letterSpacing: 3, lineHeight: 1.1 }}>RECEIPT</div>
          <div style={{ marginTop: 10, display: 'inline-grid', gridTemplateColumns: 'auto auto', columnGap: 14, rowGap: 3, textAlign: 'left', fontSize: 13 }}>
            <span style={{ color: '#6b7280' }}>Receipt No.</span>
            <span style={{ fontWeight: 700, color: '#b91c1c' }}>{r.receipt_number || '—'}</span>
            <span style={{ color: '#6b7280' }}>Date</span>
            <span style={{ fontWeight: 600 }}>{fmtDate(r.payment_date)}</span>
          </div>
        </div>
      </div>

      <div style={{ height: 2, background: primary, margin: '22px 0 26px', opacity: 0.9 }} />

      {/* Amount */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
          background: rgba(primary, 0.06), border: `1px solid ${rgba(primary, 0.22)}`, borderRadius: 14, padding: '18px 24px',
        }}
        data-pdf-keep
      >
        <div style={{ minWidth: 0 }}>
          <p style={{ ...s.label, color: primary }}>Amount received</p>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', letterSpacing: -0.3, lineHeight: 1.15, overflowWrap: 'anywhere' }}>
            {formatCurrency(amount, currency)}
          </div>
        </div>
        <div style={{
          flexShrink: 0, border: '2.5px solid #059669', color: '#059669', borderRadius: 10, padding: '6px 16px',
          fontWeight: 800, fontSize: 18, letterSpacing: 3, transform: 'rotate(-6deg)',
        }}>
          PAID
        </div>
      </div>

      {/* Received from / sum / for */}
      <div style={{ marginTop: 26, display: 'grid', gap: 20 }} data-pdf-keep>
        <div>
          <p style={s.label}>Received with thanks from</p>
          <div style={s.line}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>{inv.client_name}</span>
            {clientLines.length > 0 && <span style={{ fontSize: 12.5, color: '#6b7280' }}>{'  ·  '}{clientLines.join('  ·  ')}</span>}
          </div>
        </div>
        <div>
          <p style={s.label}>The sum of</p>
          <div style={{ ...s.line, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: 'italic', fontSize: 15.5, color: '#111827' }}>
            {amountInWords(amount, currency)}
          </div>
        </div>
        <div>
          <p style={s.label}>Being payment for</p>
          <div style={s.line}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{forWhat}</span>
            {inv.title && <span style={{ fontSize: 13.5, color: '#4b5563' }}>{'  —  '}{inv.title}</span>}
            {note && <div style={{ fontSize: 13, color: '#4b5563', marginTop: 2 }}>{note}</div>}
          </div>
        </div>
      </div>

      {/* Payment details + balance */}
      <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} data-pdf-keep>
        <div style={s.box}>
          <p style={s.label}>Payment received in</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {METHODS.map((m) => {
              const on = m.key === ticked;
              return (
                <span key={m.key} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12.5,
                  border: `1.5px solid ${on ? primary : '#d1d5db'}`, background: on ? rgba(primary, 0.1) : '#fff',
                  color: on ? primary : '#6b7280', fontWeight: on ? 700 : 500,
                }}>
                  <span style={{
                    width: 12, height: 12, borderRadius: 3, border: `1.5px solid ${on ? primary : '#9ca3af'}`,
                    background: on ? primary : '#fff', color: '#fff', fontSize: 9, lineHeight: '10px', textAlign: 'center',
                  }}>{on ? '✓' : ''}</span>
                  {m.key === 'other' && otherMethod ? otherMethod : m.label}
                </span>
              );
            })}
          </div>
          <div style={{ marginTop: 12 }}>
            {r.reference && <div style={s.row}><span style={{ color: '#6b7280' }}>Reference</span><span style={{ fontWeight: 600 }}>{r.reference}</span></div>}
            {r.account_name && <div style={s.row}><span style={{ color: '#6b7280' }}>Paid into</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{r.account_name}</span></div>}
          </div>
        </div>

        <div style={s.box}>
          <p style={s.label}>{isSale ? 'Cash sale' : 'Invoice'} {inv.invoice_number}</p>
          <div style={s.row}><span style={{ color: '#6b7280' }}>{isSale ? 'Sale total' : 'Invoice total'}</span><span>{formatCurrency(total, currency)}</span></div>
          {Number(r.paid_before) > 0 && (
            <div style={s.row}><span style={{ color: '#6b7280' }}>Paid before</span><span>{formatCurrency(Number(r.paid_before), currency)}</span></div>
          )}
          <div style={s.row}><span style={{ color: '#6b7280' }}>This payment</span><span style={{ fontWeight: 700, color: '#047857' }}>{formatCurrency(amount, currency)}</span></div>
          {discount > 0 && (
            <div style={s.row}><span style={{ color: '#6b7280' }}>Discount allowed</span><span style={{ color: '#b45309' }}>{formatCurrency(discount, currency)}</span></div>
          )}
          <div style={{ ...s.row, borderTop: '1.5px solid #e5e7eb', marginTop: 6, paddingTop: 10, fontSize: 14.5 }}>
            <span style={{ fontWeight: 700 }}>Balance</span>
            <span style={{ fontWeight: 800, color: balance > 0.004 ? '#b91c1c' : '#047857' }}>
              {balance > 0.004 ? formatCurrency(balance, currency) : 'Fully paid'}
            </span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div style={{ marginTop: 'auto', paddingTop: 36, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'end' }} data-pdf-keep>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', minHeight: 22 }}>{r.recorded_by_name || ''}</div>
          <div style={{ borderTop: '1.5px solid #6b7280', paddingTop: 6, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#6b7280' }}>
            Received by
          </div>
        </div>
        <div>
          <div style={{ height: 92, border: '1.5px dashed #9ca3af', borderRadius: 12 }} />
          <div style={{ paddingTop: 6, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#6b7280', textAlign: 'center' }}>
            Signature &amp; stamp
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 26, paddingTop: 12, borderTop: `2px solid ${primary}`, textAlign: 'center', fontSize: 12, color: '#6b7280' }} data-pdf-keep>
        Thank you for your business. Please keep this receipt for your records.
      </div>
    </div>
  );
};

export default ReceiptDocument;
