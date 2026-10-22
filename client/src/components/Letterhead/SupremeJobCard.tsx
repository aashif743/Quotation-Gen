import React from 'react';
import { formatNumber } from '../../utils/calculations';
import { Letterhead, lines, parseLetterhead } from '../../utils/letterhead';
import { supremeColors, toLocalDate } from './SupremeDocument';

/**
 * Job card in the 'supreme' letterhead design, mirroring the company's paper
 * forms ("JOB CARD" and "INTERIORS JOB CARD"): logo, address / contact lines,
 * customer + date, a MATERIALS table WITH costs, and dotted sign-off lines.
 * Inline styles so html2canvas captures it exactly for the PDF.
 */

export interface SupremeJobCardData {
  job_card_number?: string;
  card_type?: 'job' | 'interiors' | null;
  client_name?: string;
  client_address?: string | null;
  client_phone?: string | null;
  date?: string;
  due_date?: string | null;
  description?: string | null;
  notes?: string | null;
  assigned_to?: string | null;
  quotation_number?: string | null;
  prepared_by?: string | null;
  checked_by?: string | null;
  approved_by?: string | null;
  link_person?: string | null;
  items?: {
    description: string; quantity: number; unit_price?: number;
    size?: string | null; service?: string | null; rate_per_sqm?: number | string | null;
  }[];
}

export interface SupremeJobCardCompany {
  name: string;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  letterhead?: string | Letterhead | null;
}

const MIN_ROWS = 6;

const fmtDate = (d?: string | null) => {
  const x = toLocalDate(d);
  return x ? x.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : (d || '');
};
const qtyFmt = (n: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const money = (n?: number | string | null) => (n == null || n === '' || Number.isNaN(Number(n)) ? '' : formatNumber(Number(n)));

const SupremeJobCard: React.FC<{ data: SupremeJobCardData; company: SupremeJobCardCompany; rootClassName?: string }> = ({
  data, company, rootClassName = '',
}) => {
  const lh: Letterhead = typeof company.letterhead === 'string' || company.letterhead == null
    ? parseLetterhead(company.letterhead as string | null)
    : company.letterhead;
  const { blue } = supremeColors(company, lh);
  const times = "'Times New Roman', Times, serif";
  const arialN = "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
  const interiors = data.card_type === 'interiors';
  const brand = lh.short_name || (lh.display_name || company.name).split(/\s+/)[0];

  const left = [...lines(lh.address_lines), ...lines(lh.postal_lines)];
  const phones = lines(lh.phones);
  const right = [
    phones[0] ? `Tel: ${phones[0]}` : '',
    phones[1] ? `Cell: ${phones[1]}` : '',
    ...phones.slice(2),
    lh.email ? `Email: ${lh.email}` : '',
    lh.website ? `Web: ${lh.website}` : '',
  ].filter(Boolean);

  const items = data.items || [];
  const lineTotal = (it: { quantity: number; unit_price?: number }) => Number(it.quantity || 0) * Number(it.unit_price || 0);
  const grand = items.reduce((s, it) => s + lineTotal(it), 0);
  const fillers = Math.max(0, MIN_ROWS - items.length);

  type Col = { h: string; w: string; render: (it: NonNullable<SupremeJobCardData['items']>[number]) => React.ReactNode; align?: 'left' | 'center' | 'right' };
  const cols: Col[] = interiors
    ? [
        { h: 'DESCRIPTION', w: '42%', render: (it) => it.description },
        { h: 'NO.', w: '10%', render: (it) => qtyFmt(it.quantity), align: 'center' },
        { h: 'SERVICE', w: '14%', render: (it) => it.service || '' },
        { h: 'COST(MK) PER ITEM', w: '15%', render: (it) => money(it.unit_price), align: 'right' },
        { h: 'TOTAL AMOUNT(MK)', w: '19%', render: (it) => money(lineTotal(it)), align: 'right' },
      ]
    : [
        { h: 'JOB DESCRIPTION', w: '21%', render: (it) => it.description },
        { h: 'SIZE', w: '12%', render: (it) => it.size || '' },
        { h: 'NO.', w: '7%', render: (it) => qtyFmt(it.quantity), align: 'center' },
        { h: 'SERVICE', w: '15%', render: (it) => it.service || '' },
        { h: 'COST PER SQUARE METRE', w: '12%', render: (it) => (Number(it.rate_per_sqm) > 0 ? money(it.rate_per_sqm) : ''), align: 'right' },
        { h: 'COST(MK) PER ITEM', w: '15%', render: (it) => money(it.unit_price), align: 'right' },
        { h: 'TOTAL AMOUNT(MK)', w: '18%', render: (it) => money(lineTotal(it)), align: 'right' },
      ];

  const cell: React.CSSProperties = { border: '1px solid #222', padding: '7px 8px', fontFamily: times, fontSize: 14, verticalAlign: 'top' };
  const headCell: React.CSSProperties = { ...cell, fontFamily: arialN, fontWeight: 700, fontSize: 12.5, textAlign: 'left' };
  const label: React.CSSProperties = { fontFamily: arialN, fontWeight: 700, fontSize: 14, color: '#111' };
  const dotted = (title: string, value?: string | null, width = 260) => (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 4 }}>
      <span style={label}>{title}</span>
      <span style={{ minWidth: width, borderBottom: '1.5px dotted #333', fontFamily: times, fontSize: 14, padding: '0 4px 1px' }}>{value || ''}</span>
    </span>
  );

  return (
    <div
      className={rootClassName}
      style={{ background: '#fff', color: '#111', width: '100%', aspectRatio: '210 / 297', padding: '36px 56px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}
    >
      {/* Logo */}
      <div style={{ textAlign: 'center' }} data-pdf-keep>
        {company.logo_url ? (
          <img src={company.logo_url} alt="" crossOrigin="anonymous" style={{ maxWidth: '86%', maxHeight: 110, objectFit: 'contain' }} />
        ) : (
          <div style={{ fontFamily: arialN, fontSize: 44, fontWeight: 800, color: blue }}>{company.name}</div>
        )}
      </div>

      {/* Address | contacts, underlined */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, borderBottom: '1px solid #111', paddingBottom: 2 }} data-pdf-keep>
        <div>{left.map((l, i) => <div key={i} style={{ fontFamily: times, fontSize: 15, lineHeight: 1.25 }}>{l}</div>)}</div>
        <div style={{ alignSelf: 'flex-end' }}>{right.map((l, i) => <div key={i} style={{ fontFamily: times, fontSize: 15, lineHeight: 1.25 }}>{l}</div>)}</div>
      </div>

      {/* Title + customer / date */}
      <div data-pdf-keep>
        <h1 style={{ textAlign: 'center', fontFamily: arialN, fontWeight: 700, fontSize: 28, margin: '26px 0 18px', letterSpacing: 0.3 }}>
          {interiors ? 'INTERIORS JOB CARD' : 'JOB CARD'}
        </h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div><span style={label}>CUSTOMER NAME: </span><span style={{ fontFamily: times, fontSize: 15 }}>{data.client_name}</span></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {dotted('DATE', fmtDate(data.date), 170)}
            {data.job_card_number && (
              <div style={{ marginTop: 6 }}><span style={label}>JOB CARD NO: </span><span style={{ fontFamily: times, fontSize: 15, color: '#d0021b', fontWeight: 700 }}>{data.job_card_number}</span></div>
            )}
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <span style={label}>ADDRESS: </span>
          <span style={{ fontFamily: times, fontSize: 15, whiteSpace: 'pre-wrap' }}>{[data.client_address, data.client_phone].filter(Boolean).join('  ·  ')}</span>
        </div>
        {(data.quotation_number || data.due_date || data.assigned_to) && (
          <div style={{ marginTop: 8, display: 'flex', gap: 24, flexWrap: 'wrap', fontFamily: times, fontSize: 14 }}>
            {data.quotation_number && <span><span style={label}>QUOTATION REF: </span>{data.quotation_number}</span>}
            {data.due_date && <span><span style={label}>DUE DATE: </span>{fmtDate(data.due_date)}</span>}
            {data.assigned_to && <span><span style={label}>ASSIGNED TO: </span>{data.assigned_to}</span>}
          </div>
        )}
        {data.description && (
          <div style={{ marginTop: 8, fontFamily: times, fontSize: 14, whiteSpace: 'pre-wrap' }}>
            <span style={label}>JOB DETAILS: </span>{data.description}
          </div>
        )}
      </div>

      {/* Materials table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: 14 }}>
        <colgroup>{cols.map((c) => <col key={c.h} style={{ width: c.w }} />)}</colgroup>
        <thead>
          <tr>
            <th colSpan={4} style={{ ...headCell, padding: '6px 8px 14px' }}>MATERIALS</th>
            <th colSpan={cols.length - 4} style={headCell} />
          </tr>
          <tr>{cols.map((c) => <th key={c.h} style={{ ...headCell, height: 52 }}>{c.h}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.h} style={{ ...cell, textAlign: c.align || 'left', whiteSpace: 'pre-wrap', height: 40 }}>{c.render(it)}</td>
              ))}
            </tr>
          ))}
          {Array.from({ length: fillers }).map((_, k) => (
            <tr key={`f${k}`}>{cols.map((c) => <td key={c.h} style={{ ...cell, height: 40 }} />)}</tr>
          ))}
          <tr>
            <td colSpan={cols.length - 1} style={{ ...cell, border: 'none', textAlign: 'right', fontFamily: arialN, fontWeight: 700 }}>TOTAL</td>
            <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{items.length ? formatNumber(grand) : ''}</td>
          </tr>
        </tbody>
      </table>

      {data.notes && (
        <div style={{ marginTop: 10, fontFamily: times, fontSize: 14, whiteSpace: 'pre-wrap' }} data-pdf-keep>
          <span style={label}>NOTES: </span>{data.notes}
        </div>
      )}

      {/* Sign-off lines */}
      <div style={{ marginTop: 'auto', paddingTop: 30, display: 'flex', flexDirection: 'column', gap: 30 }} data-pdf-keep>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          {dotted('JOB CARD PREPARED BY', data.prepared_by, 210)}
          {dotted('JOB CARD CHECKED BY', data.checked_by, 150)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          {dotted('JOB CARD APPROVED BY', data.approved_by, 205)}
          {dotted('CUSTOMER’S SIGNATURE', '', 150)}
        </div>
        <div>{dotted(`BUSINESS LINK PERSON (FOR ${brand.toUpperCase()})`, data.link_person, 190)}</div>
      </div>
    </div>
  );
};

export default SupremeJobCard;
