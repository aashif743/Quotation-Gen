import React from 'react';
import { formatCurrency, formatNumber } from '../../utils/calculations';
import { Letterhead, lines, parseLetterhead } from '../../utils/letterhead';

/**
 * The 'supreme' letterhead design (Supreme Printers): blue/green top and bottom
 * bars, logo + contact block header, "CLIENT / DATE / TITLE" lines, a green
 * rounded-header item table with grey stripes and a faint logo watermark,
 * totals boxes, bank line, services box and a slogan pill.
 *
 * One component renders the quotation, invoice and delivery note so all three
 * look identical. Only companies whose template is 'supreme' ever reach it.
 * Inline styles (not Tailwind) so html2canvas captures it exactly for the PDF.
 */

export type SupremeKind = 'quotation' | 'invoice' | 'delivery';

export interface SupremeDocData {
  number?: string;
  client_name?: string;
  client_address?: string | null;
  client_phone?: string | null;
  date?: string;
  title?: string | null;
  /** Quotation: validity in days. */
  expiry_days?: number | null;
  /** Invoice: payment terms in days. */
  due_days?: number | null;
  /** Delivery note: reference (invoice / quotation number). */
  reference?: string | null;
  items?: { description: string; quantity: number; unit_price?: number; total?: number }[];
  subtotal?: number;
  vat_amount?: number;
  ppda_amount?: number;
  grand_total?: number;
  notes?: string | null;
  terms_conditions?: string | null;
}

export interface SupremeDocCompany {
  name: string;
  tpin?: string | null;
  bank_details?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  vat_rate?: number | null;
  currency?: string | null;
  /** Raw JSON from companies.letterhead (or an already-parsed object). */
  letterhead?: string | Letterhead | null;
}

interface Props {
  kind: SupremeKind;
  data: SupremeDocData;
  company: SupremeDocCompany;
  rootClassName?: string;
}

const MIN_ROWS = 14;

export { toLocalDate };

export const supremeColors = (company: { primary_color?: string | null; secondary_color?: string | null }, lh: Letterhead) => {
  const isHex = (c?: string | null) => !!c && /^#?[0-9a-f]{6}$/i.test(c);
  const blue = isHex(company.primary_color) ? String(company.primary_color) : '#2E3192';
  const green = isHex(lh.accent_color) ? String(lh.accent_color)
    : isHex(company.secondary_color) && !/^#?f{6}$/i.test(String(company.secondary_color)) ? String(company.secondary_color)
    : '#4CB848';
  return { blue, green };
};

// Dates arrive as 'YYYY-MM-DD' or a full ISO timestamp (MySQL DATE → UTC
// midnight of the local day). A bare date is read as LOCAL midnight; a
// timestamp is converted to local time — slicing it would show the day before.
const toLocalDate = (d?: string | null): Date | null => {
  if (!d) return null;
  const s = String(d);
  const x = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return isNaN(x.getTime()) ? null : x;
};

const fmtDate = (d?: string | null) => {
  const x = toLocalDate(d);
  return x ? x.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : (d || '');
};

const addDays = (d: string | undefined, n: number) => {
  const x = toLocalDate(d);
  if (!x) return '';
  x.setDate(x.getDate() + n);
  return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
};

const qtyFmt = (n: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const SupremeDocument: React.FC<Props> = ({ kind, data, company, rootClassName = '' }) => {
  const lh: Letterhead = typeof company.letterhead === 'string' || company.letterhead == null
    ? parseLetterhead(company.letterhead as string | null)
    : company.letterhead;
  const { blue, green } = supremeColors(company, lh);
  const grey = '#DCDCDC';
  const ink = '#1f1f1f';
  const serif = "'Times New Roman', Times, serif";
  const sans = "'Segoe UI', Helvetica, Arial, sans-serif";

  const isDelivery = kind === 'delivery';
  const docLabel = kind === 'quotation' ? 'QUOTATION NO:' : kind === 'invoice' ? 'INVOICE NO:' : 'DELIVERY NOTE NO:';
  const items = data.items || [];
  const fillers = Math.max(0, MIN_ROWS - items.length);
  const itemTotal = (it: { quantity: number; unit_price?: number; total?: number }) =>
    it.total != null ? Number(it.total) : Number(it.quantity) * Number(it.unit_price || 0);

  // VAT label: the effective rate from the amounts, else the company rate.
  const sub = Number(data.subtotal || 0);
  const vat = Number(data.vat_amount || 0);
  const ppda = Number(data.ppda_amount || 0);
  const vatPct = vat > 0 && sub > 0 ? (vat / sub) * 100 : Number(company.vat_rate || 0) * 100;
  const vatLabel = vatPct > 0 ? `${formatNumber(vatPct, vatPct % 1 ? 1 : 0)}% VAT` : 'VAT';

  const contactBlue: React.CSSProperties = { color: blue, fontFamily: sans, fontSize: 14, lineHeight: 1.3, margin: 0 };
  const fieldRow = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 4 }}>
      <span style={{ width: 58, flexShrink: 0, fontFamily: sans, fontSize: 14, color: '#333', letterSpacing: 0.3 }}>{label}</span>
      <span style={{ fontSize: 14, color: '#333' }}>:</span>
      <span style={{ flex: 1, borderBottom: '1px solid #9a9cc9', minHeight: 20, padding: '0 6px 1px', fontFamily: serif, fontSize: 15, color: ink, whiteSpace: 'pre-wrap' }}>
        {value}
      </span>
    </div>
  );

  const th: React.CSSProperties = {
    background: green, color: '#fff', fontFamily: sans, fontWeight: 700, fontSize: 15,
    padding: '12px 8px', textAlign: 'center', letterSpacing: 0.3,
  };
  const td = (i: number, extra?: React.CSSProperties): React.CSSProperties => ({
    background: i % 2 === 0 ? grey : '#ffffff', padding: '9px 10px', fontFamily: serif, fontSize: 14.5,
    color: ink, verticalAlign: 'top', borderLeft: '1px solid #3a3a3a', ...extra,
  });

  const services = lines(lh.services);
  const contacts = [...lines(lh.address_lines)];
  const phones = lines(lh.phones);
  const bankLines = lines(company.bank_details);

  const note = kind === 'quotation'
    ? `This Quotation is Valid for ${data.expiry_days || 30} Days from the date of issue.`
    : kind === 'invoice'
      ? (data.due_days ? `Payment is due within ${data.due_days} days of the invoice date.` : 'Payment is due on receipt of this invoice.')
      : 'Goods received in good order and condition.';

  return (
    <div
      className={rootClassName}
      style={{
        position: 'relative', background: '#fff', color: ink, width: '100%', aspectRatio: '210 / 297',
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
        // No overflow clipping: a long document grows past one A4 page (the
        // PDF generator then splits it into pages).
      }}
    >
      {/* Top bar + corner squares */}
      <div style={{ position: 'relative', height: 30, flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: blue }} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: 210, height: 45, background: green, opacity: 0.45 }} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: 125, height: 70, background: green, opacity: 0.55 }} />
        <div style={{ position: 'absolute', top: 0, right: 125, width: 85, height: 30, background: '#2f6f5a', opacity: 0.55 }} />
      </div>

      <div style={{ padding: '22px 48px 0 64px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }} data-pdf-keep>
          <div style={{ flex: '0 0 52%' }}>
            {company.logo_url ? (
              <img src={company.logo_url} alt="" crossOrigin="anonymous" style={{ maxWidth: 380, maxHeight: 92, objectFit: 'contain', display: 'block' }} />
            ) : (
              <div style={{ fontFamily: sans, fontSize: 40, fontWeight: 800, color: blue }}>{company.name}</div>
            )}
            <div style={{ height: 2, background: blue, margin: '6px 0 10px 80px', maxWidth: 300 }} />
            <p style={{ margin: '0 0 0 70px', fontFamily: sans, fontWeight: 700, fontSize: 15, color: '#111' }}>{lh.display_name || company.name}</p>
            {company.tpin && <p style={{ margin: '2px 0 0 70px', fontFamily: sans, fontWeight: 700, fontSize: 15, color: '#111' }}>TPIN: {company.tpin}</p>}
          </div>
          <div style={{ flex: 1, borderLeft: `2px solid ${blue}`, paddingLeft: 8, alignSelf: 'flex-start' }}>
            {contacts.map((l, i) => <p key={`a${i}`} style={contactBlue}>{l}</p>)}
            {phones.length > 0 && <div style={{ height: 8 }} />}
            {phones.map((l, i) => <p key={`p${i}`} style={{ ...contactBlue, fontSize: 16 }}>{l}</p>)}
            {lh.email && <p style={{ ...contactBlue, fontSize: 16, marginTop: 8 }}>{lh.email}</p>}
            {lh.website && <p style={{ ...contactBlue, fontSize: 14, marginTop: 2 }}>{lh.website}</p>}
            {lh.social && <p style={{ ...contactBlue, fontSize: 16, marginTop: 6 }}>{lh.social}</p>}
          </div>
        </div>

        {/* Number + Client / Date / Title */}
        <div style={{ marginTop: 14 }} data-pdf-keep>
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 90 }}>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 15, color: '#111', marginRight: 6 }}>{docLabel}</span>
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 18, color: '#d0021b' }}>{data.number || ''}</span>
          </div>
          {fieldRow('CLIENT', data.client_name || '')}
          {fieldRow('DATE', fmtDate(data.date))}
          {kind === 'delivery'
            ? fieldRow('REF', data.reference || '')
            : fieldRow('TITLE', data.title || '')}
          {kind === 'invoice' && fieldRow('DUE', data.due_days ? addDays(data.date, Number(data.due_days)) : 'On receipt')}
        </div>

        {/* Items table */}
        <div style={{ position: 'relative', marginTop: 22, border: '1px solid #3a3a3a', borderRadius: '22px 22px 0 0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: isDelivery ? '14%' : '11.8%' }} />
              <col style={{ width: isDelivery ? '86%' : '53.5%' }} />
              {!isDelivery && <col style={{ width: '16.6%' }} />}
              {!isDelivery && <col style={{ width: '18.1%' }} />}
            </colgroup>
            <thead>
              <tr>
                <th style={th}>QTY</th>
                <th style={{ ...th, borderLeft: '1px solid #3a3a3a' }}>DESCRIPTION</th>
                {!isDelivery && <th style={{ ...th, borderLeft: '1px solid #3a3a3a' }}>UNIT PRICE</th>}
                {!isDelivery && <th style={{ ...th, borderLeft: '1px solid #3a3a3a' }}>TOTAL</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td style={td(i, { textAlign: 'center', borderLeft: 'none' })}>{qtyFmt(it.quantity)}</td>
                  <td style={{ ...td(i), whiteSpace: 'pre-wrap' }}>{it.description}</td>
                  {!isDelivery && <td style={td(i, { textAlign: 'right' })}>{formatNumber(Number(it.unit_price || 0))}</td>}
                  {!isDelivery && <td style={td(i, { textAlign: 'right' })}>{formatNumber(itemTotal(it))}</td>}
                </tr>
              ))}
              {Array.from({ length: fillers }).map((_, k) => {
                const i = items.length + k;
                return (
                  <tr key={`f${k}`}>
                    <td style={td(i, { borderLeft: 'none', height: 24 })}>&nbsp;</td>
                    <td style={td(i)} />
                    {!isDelivery && <td style={td(i)} />}
                    {!isDelivery && <td style={td(i)} />}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {company.logo_url && (
            <img
              src={company.logo_url}
              alt=""
              crossOrigin="anonymous"
              style={{
                position: 'absolute', left: '50%', top: '55%', transform: 'translate(-50%, -50%)',
                width: '78%', maxHeight: '40%', objectFit: 'contain', opacity: 0.13, pointerEvents: 'none',
              }}
            />
          )}
        </div>

        {/* Below table: notes / bank / services | totals or signatures */}
        <div style={{ display: 'flex', gap: 16, marginTop: 0 }} data-pdf-keep>
          <div style={{ flex: 1, paddingTop: 6 }}>
            <p style={{ margin: 0, fontFamily: serif, fontSize: 13.5, color: '#222' }}>{note}</p>
            {data.notes && <p style={{ margin: '4px 0 0', fontFamily: serif, fontSize: 13, color: '#333', whiteSpace: 'pre-wrap' }}>{data.notes}</p>}
            {data.terms_conditions && (
              <p style={{ margin: '4px 0 0', fontFamily: serif, fontSize: 12, color: '#444', whiteSpace: 'pre-wrap' }}>{data.terms_conditions}</p>
            )}
            {!isDelivery && bankLines.length > 0 && (
              <div style={{ marginTop: 12, textAlign: 'center', paddingRight: 30 }}>
                {bankLines.map((l, i) => (
                  <p key={i} style={{ margin: 0, fontFamily: serif, fontSize: 14.5, color: '#111', letterSpacing: 0.2 }}>{l}</p>
                ))}
              </div>
            )}
            {isDelivery && (
              <div style={{ display: 'flex', gap: 28, marginTop: 64 }}>
                {['DELIVERED BY', 'RECEIVED BY (NAME, SIGNATURE & STAMP)'].map((t) => (
                  <div key={t} style={{ flex: 1 }}>
                    <div style={{ borderTop: '1px solid #555', paddingTop: 4, fontFamily: sans, fontSize: 11.5, fontWeight: 700, color: '#333' }}>{t}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!isDelivery && (
            <div style={{ width: 330, flexShrink: 0 }}>
              {[
                ['TOTAL', formatNumber(sub)],
                [vatLabel, vat > 0 ? formatNumber(vat) : 'Incl.'],
                ...(ppda > 0 ? [['PPDA', formatNumber(ppda)]] : []),
                ['GRAND TOTAL', formatCurrency(Number(data.grand_total || 0), company.currency || undefined)],
              ].map(([label, value], i, arr) => (
                <div key={label} style={{ display: 'flex', alignItems: 'stretch' }}>
                  <div style={{ flex: 1, textAlign: 'right', whiteSpace: 'nowrap', padding: '10px 18px 6px 0', fontFamily: sans, fontWeight: 700, fontSize: i === arr.length - 1 || i === 1 ? 17 : 16, color: '#111' }}>
                    {label}
                  </div>
                  <div style={{
                    width: 142, border: '1px solid #3a3a3a', borderTop: i === 0 ? 'none' : '1px solid #3a3a3a',
                    padding: '9px 8px', textAlign: 'center', fontFamily: value === 'Incl.' ? sans : serif,
                    fontWeight: value === 'Incl.' || i === arr.length - 1 ? 700 : 400, fontSize: 15, color: '#111',
                  }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Services box */}
        <div style={{ marginTop: 'auto', paddingTop: 10, paddingBottom: 6, marginLeft: -24 }} data-pdf-keep>
          {services.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: '#231f20', color: '#fff', fontFamily: sans, fontWeight: 700, fontSize: 11, padding: '5px 10px', borderRadius: '10px 0 0 10px' }}>
                SERVICES:
              </span>
              <div style={{ borderLeft: '2px solid #231f20', paddingLeft: 6 }}>
                {services.map((s, i) => <p key={i} style={{ margin: 0, fontFamily: sans, fontSize: 9.5, lineHeight: 1.2, color: '#333' }}>{s}</p>)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar + slogan pill + corner squares */}
      <div style={{ position: 'relative', height: 44, flexShrink: 0 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 16, background: blue }} />
        <div style={{ position: 'absolute', right: 0, bottom: 0, width: 125, height: 30, background: '#2f6f5a', opacity: 0.6 }} />
        <div style={{ position: 'absolute', right: 0, bottom: 16, width: 46, height: 28, background: green, opacity: 0.55 }} />
        {lh.tagline !== '' && (
          <div style={{
            position: 'absolute', left: '22%', bottom: 0, width: '53%', height: 44, background: green,
            borderRadius: '30px 30px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontFamily: serif, fontSize: 17 }}>{lh.tagline || 'Looking forward to doing Business with you.'}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupremeDocument;
