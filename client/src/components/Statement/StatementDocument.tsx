import React from 'react';
import { ClientStatement } from '../../services/api';
import { formatCurrency, formatNumber } from '../../utils/calculations';
import { hexToRgb, rgbToHex } from '../../utils/colors';
import { parseLetterhead, lines } from '../../utils/letterhead';

/**
 * Printable client statement of account (A4), branded with the client's own
 * company: logo, address, TPIN, bank details and colours. Inline styles so
 * html2canvas captures it exactly; root class `statement-document` is what
 * the PDF generator looks for.
 */

const HEX = /^#[0-9a-f]{6}$/i;

// Perceived brightness 0..1, same measure the quotation designs use to pick
// text colour on the brand colour.
const luma = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
const darken = (hex: string, amount: number) => {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
};

const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const s = String(d);
  const x = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return isNaN(x.getTime()) ? s : x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const dayKey = (d: string) => {
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const x = new Date(s);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  paid: { label: 'Paid', color: '#047857', bg: '#ecfdf5' },
  partial: { label: 'Part paid', color: '#b45309', bg: '#fffbeb' },
  pending: { label: 'Unpaid', color: '#b91c1c', bg: '#fef2f2' },
};

interface Props {
  statement: ClientStatement;
  rootClassName?: string;
}

const StatementDocument: React.FC<Props> = ({ statement: st, rootClassName = '' }) => {
  const co = st.company;
  const client = st.client;
  const currency = co?.currency || undefined;
  const money = (n: number) => formatNumber(Number(n || 0));

  const brand = co?.primary_color && HEX.test(co.primary_color) ? co.primary_color : '#1f3b5c';
  // Very light brand colours can't carry white text or be read as text on white.
  const onBrand = luma(brand) > 0.62 ? '#111827' : '#ffffff';
  // Brand colour as text on white: light brands are darkened to stay legible.
  const brandText = luma(brand) > 0.5 ? darken(brand, 0.42) : brand;
  const accent = co?.secondary_color && HEX.test(co.secondary_color) && luma(co.secondary_color) < 0.9
    ? co.secondary_color : brand;

  const logo = co?.quote_logo_url || co?.logo_url || null;
  const lh = parseLetterhead(co?.letterhead);
  const isLetterhead = co?.template === 'supreme';
  const contactLines = isLetterhead
    ? [...lines(lh.address_lines), lines(lh.phones).join('  |  '), [lh.email, lh.website].filter(Boolean).join('  |  ')].filter(Boolean)
    : lines(co?.address);
  const displayName = (isLetterhead && lh.display_name) || co?.name || '';

  // Running-balance ledger: opening balance, then invoices (debits) and
  // payments (credits) in date order. Invoices come first on the same day.
  type Entry = { date: string; ref: string; desc: string; debit: number; credit: number };
  const entries: Entry[] = [
    ...st.invoices.map((i) => ({
      date: i.date, ref: i.invoice_number, desc: 'Invoice', debit: Number(i.grand_total) || 0, credit: 0,
    })),
    ...st.payments.map((p) => ({
      date: p.payment_date,
      ref: p.invoice_number,
      desc: ['Payment received', p.method, p.reference ? `Ref ${p.reference}` : ''].filter(Boolean).join(' · '),
      debit: 0,
      credit: Number(p.amount) || 0,
    })),
  ].sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)) || (b.debit - a.debit));
  let running = Number(st.opening_balance) || 0;
  const ledger = entries.map((e) => {
    running += e.debit - e.credit;
    return { ...e, balance: running };
  });
  const closing = Number(st.closing_balance) || 0;
  const outstanding = st.invoices.filter((i) => Number(i.balance_due) > 0.004);

  const s: Record<string, React.CSSProperties> = {
    root: {
      background: '#fff', color: '#1f2937', width: '100%', minHeight: 0, boxSizing: 'border-box',
      padding: '46px 48px 32px', fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", fontSize: 13, lineHeight: 1.45,
      display: 'flex', flexDirection: 'column',
      // Two-tone brand bar along the top edge.
      backgroundImage: `linear-gradient(90deg, ${brand} 0%, ${brand} 75%, ${accent} 75%, ${accent} 100%)`,
      backgroundSize: '100% 6px', backgroundRepeat: 'no-repeat', backgroundPosition: 'top left',
    },
    label: { fontSize: 10.5, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: '#6b7280', margin: '0 0 4px' },
    th: { padding: '9px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: onBrand, background: brand, textAlign: 'left', whiteSpace: 'nowrap' },
    td: { padding: '8px 10px', borderBottom: '1px solid #eef0f3', verticalAlign: 'top' },
    num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
    h2: { fontSize: 13, fontWeight: 700, color: brandText, margin: '0 0 8px', letterSpacing: 0.3 },
  };

  return (
    <div className={rootClassName} style={s.root}>
      {/* Letterhead */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }} data-pdf-keep>
        <div style={{ maxWidth: '58%' }}>
          {logo ? (
            <img src={logo} alt="" crossOrigin="anonymous" style={{ maxHeight: 72, maxWidth: 260, objectFit: 'contain', display: 'block' }} />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 800, color: brandText }}>{displayName}</div>
          )}
          <div style={{ marginTop: 10, fontSize: 11.5, color: '#4b5563', lineHeight: 1.5 }}>
            {logo && <div style={{ fontWeight: 700, color: '#111827', fontSize: 12.5 }}>{displayName}</div>}
            {contactLines.map((l, i) => <div key={i}>{l}</div>)}
            {co?.tpin && <div>TPIN: {co.tpin}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: brandText, letterSpacing: 0.8, lineHeight: 1.15 }}>STATEMENT</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', letterSpacing: 1.5, textTransform: 'uppercase' }}>of account</div>
          <table style={{ marginTop: 12, marginLeft: 'auto', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {[
                ['Statement date', fmtDate(new Date().toISOString())],
                ['Period', `${fmtDate(st.period.from)} – ${fmtDate(st.period.to)}`],
                ['Currency', (currency || 'MWK').toUpperCase()],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '2px 10px 2px 0', color: '#6b7280', textAlign: 'right' }}>{k}</td>
                  <td style={{ padding: '2px 0', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Client + balance due */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 24 }} data-pdf-keep>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px' }}>
          <p style={s.label}>Statement for</p>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{client?.name || '—'}</div>
          {client?.contact_person && <div style={{ color: '#4b5563' }}>Attn: {client.contact_person}</div>}
          {client?.address && <div style={{ color: '#4b5563', whiteSpace: 'pre-wrap' }}>{client.address}</div>}
          {[client?.phone, client?.email].filter(Boolean).length > 0 && (
            <div style={{ color: '#4b5563' }}>{[client?.phone, client?.email].filter(Boolean).join(' · ')}</div>
          )}
          {client?.tax_id && <div style={{ color: '#4b5563' }}>TPIN: {client.tax_id}</div>}
        </div>
        <div style={{ borderRadius: 10, padding: '12px 16px', background: brand, color: onBrand, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', opacity: 0.85 }}>
            {closing < -0.004 ? 'Credit balance' : 'Balance due'}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(Math.abs(closing), currency)}</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>as at {fmtDate(st.period.to)}</div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }} data-pdf-keep>
        {[
          ['Opening balance', st.opening_balance, '#111827'],
          ['Invoiced', st.total_invoiced, '#111827'],
          ['Payments received', st.total_paid, '#047857'],
          ['Closing balance', closing, closing > 0.004 ? '#b91c1c' : '#111827'],
        ].map(([label, val, color], i) => (
          <div key={label as string} style={{ padding: '10px 14px', borderLeft: i ? '1px solid #e5e7eb' : 'none', background: i === 3 ? '#f9fafb' : '#fff' }}>
            <div style={{ fontSize: 10.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{label as string}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: color as string, fontVariantNumeric: 'tabular-nums' }}>{money(val as number)}</div>
          </div>
        ))}
      </div>

      {/* Ledger */}
      <div style={{ marginTop: 22 }}>
        <p style={s.h2} data-pdf-keep>Account activity</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: 100, borderTopLeftRadius: 6 }}>Date</th>
              <th style={{ ...s.th, width: 120 }}>Reference</th>
              <th style={s.th}>Description</th>
              <th style={{ ...s.th, ...s.num, width: 110 }}>Debit</th>
              <th style={{ ...s.th, ...s.num, width: 110 }}>Credit</th>
              <th style={{ ...s.th, ...s.num, width: 120, borderTopRightRadius: 6 }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: '#f9fafb' }}>
              <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{fmtDate(st.period.from)}</td>
              <td style={s.td} />
              <td style={{ ...s.td, fontWeight: 600 }}>Balance brought forward</td>
              <td style={{ ...s.td, ...s.num }} />
              <td style={{ ...s.td, ...s.num }} />
              <td style={{ ...s.td, ...s.num, fontWeight: 600 }}>{money(st.opening_balance)}</td>
            </tr>
            {ledger.length === 0 ? (
              <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#9ca3af', padding: '18px 10px' }}>No invoices or payments in this period.</td></tr>
            ) : ledger.map((e, i) => (
              <tr key={i} style={{ background: i % 2 ? '#fcfcfd' : '#fff' }}>
                <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                <td style={{ ...s.td, fontWeight: 600, whiteSpace: 'nowrap' }}>{e.ref}</td>
                <td style={{ ...s.td, color: e.credit ? '#047857' : '#374151' }}>{e.desc}</td>
                <td style={{ ...s.td, ...s.num }}>{e.debit ? money(e.debit) : ''}</td>
                <td style={{ ...s.td, ...s.num, color: '#047857' }}>{e.credit ? money(e.credit) : ''}</td>
                <td style={{ ...s.td, ...s.num, fontWeight: 600 }}>{money(e.balance)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} style={{ padding: '10px', fontWeight: 700, borderTop: `2px solid ${brand}`, textAlign: 'right', letterSpacing: 0.4 }}>CLOSING BALANCE</td>
              <td style={{ padding: '10px', ...s.num, fontWeight: 700, borderTop: `2px solid ${brand}` }}>{money(st.total_invoiced)}</td>
              <td style={{ padding: '10px', ...s.num, fontWeight: 700, borderTop: `2px solid ${brand}`, color: '#047857' }}>{money(st.total_paid)}</td>
              <td style={{ padding: '10px', ...s.num, fontWeight: 800, borderTop: `2px solid ${brand}`, color: brandText }}>{money(closing)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Invoices in the period */}
      {st.invoices.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <p style={s.h2} data-pdf-keep>Invoices in this period</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...s.th, borderTopLeftRadius: 6 }}>Invoice</th>
                <th style={s.th}>Date</th>
                <th style={{ ...s.th, ...s.num }}>Amount</th>
                <th style={{ ...s.th, ...s.num }}>Paid</th>
                <th style={{ ...s.th, ...s.num }}>Balance</th>
                <th style={{ ...s.th, textAlign: 'center', borderTopRightRadius: 6 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {st.invoices.map((inv, i) => {
                const tag = STATUS[inv.payment_status] || STATUS.pending;
                return (
                  <tr key={inv.id} style={{ background: i % 2 ? '#fcfcfd' : '#fff' }}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{fmtDate(inv.date)}</td>
                    <td style={{ ...s.td, ...s.num }}>{money(inv.grand_total)}</td>
                    <td style={{ ...s.td, ...s.num, color: '#047857' }}>{money(inv.amount_paid)}</td>
                    <td style={{ ...s.td, ...s.num, fontWeight: 600, color: Number(inv.balance_due) > 0.004 ? '#b91c1c' : '#9ca3af' }}>
                      {Number(inv.balance_due) > 0.004 ? money(inv.balance_due) : '—'}
                    </td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '1px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, color: tag.color, background: tag.bg, whiteSpace: 'nowrap' }}>
                        {tag.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {outstanding.length > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#6b7280' }}>
              {outstanding.length} invoice{outstanding.length === 1 ? '' : 's'} from this period still {outstanding.length === 1 ? 'has' : 'have'} a balance.
            </p>
          )}
        </div>
      )}

      {/* Payment details + note */}
      <div style={{ marginTop: 'auto', paddingTop: 26 }} data-pdf-keep>
        <div style={{ display: 'grid', gridTemplateColumns: co?.bank_details ? '1fr 1fr' : '1fr', gap: 16 }}>
          {co?.bank_details && (
            <div style={{ borderLeft: `3px solid ${accent}`, background: '#f9fafb', padding: '10px 14px', borderRadius: '0 8px 8px 0' }}>
              <p style={s.label}>Payment details</p>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#111827', fontWeight: 500 }}>{co.bank_details.trim()}</div>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: '#4b5563', padding: '10px 2px' }}>
            Please quote the invoice number(s) with your payment. If anything on this statement does not match your records,
            please contact us so we can reconcile it.
            <div style={{ marginTop: 8, fontWeight: 600, color: brandText }}>Thank you for your business.</div>
          </div>
        </div>
        <div style={{ marginTop: 18, paddingTop: 8, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af' }}>
          <span>{displayName}</span>
          <span>Statement for {client?.name} · {fmtDate(st.period.from)} – {fmtDate(st.period.to)}</span>
        </div>
      </div>
    </div>
  );
};

export default StatementDocument;
