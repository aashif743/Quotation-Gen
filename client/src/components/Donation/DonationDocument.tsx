import React from 'react';
import { Donation, DONATION_CATEGORY_LABELS, DONATION_STATUS_LABELS, RECIPIENT_TYPE_LABELS } from '../../types/donations';
import { formatCurrency, formatNumber } from '../../utils/calculations';

/**
 * Printable donation voucher (A4). Confirms what the company gave, to whom and
 * why, with signature lines for the preparer, the approver and the recipient.
 * Inline styles so html2canvas captures it exactly; root class
 * `donation-document` is what the PDF generator looks for.
 */

const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const s = String(d);
  const x = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return isNaN(x.getTime()) ? s : x.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
};

const DonationDocument: React.FC<{ donation: Donation; rootClassName?: string }> = ({ donation: d, rootClassName = '' }) => {
  const primary = d.primary_color && /^#?[0-9a-f]{6}$/i.test(d.primary_color) ? d.primary_color : '#1f3b5c';
  const currency = d.company_currency || undefined;
  const logo = d.company_quote_logo || d.company_logo;
  const items = d.items || [];
  const total = Number(d.amount || 0);
  const statusColor: Record<string, string> = { planned: '#b45309', approved: '#1d4ed8', given: '#047857', cancelled: '#b91c1c' };

  const s: Record<string, React.CSSProperties> = {
    root: {
      background: '#fff', color: '#1f2937', width: '100%', aspectRatio: '210 / 297', boxSizing: 'border-box',
      padding: '44px 56px', display: 'flex', flexDirection: 'column',
      fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", fontSize: 14, lineHeight: 1.5,
    },
    label: { fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#6b7280', margin: '0 0 4px' },
    box: { border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' },
    th: { textAlign: 'left', padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#fff', background: primary, letterSpacing: 0.4 },
    td: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
  };

  return (
    <div className={rootClassName} style={s.root}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, borderBottom: `3px solid ${primary}`, paddingBottom: 16 }} data-pdf-keep>
        <div>
          {logo ? <img src={logo} alt="" crossOrigin="anonymous" style={{ maxHeight: 70, maxWidth: 260, objectFit: 'contain' }} />
            : <div style={{ fontSize: 22, fontWeight: 800, color: primary }}>{d.company_name}</div>}
          <div style={{ marginTop: 8, fontSize: 12, color: '#4b5563' }}>
            {logo && <div style={{ fontWeight: 700, color: '#111827' }}>{d.company_name}</div>}
            {d.company_address && <div style={{ whiteSpace: 'pre-wrap' }}>{d.company_address}</div>}
            {d.company_tpin && <div>TPIN: {d.company_tpin}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: primary, letterSpacing: 1 }}>DONATION VOUCHER</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{d.donation_number}</div>
          <div style={{ fontSize: 13, color: '#4b5563' }}>{fmtDate(d.date)}</div>
          <div style={{
            display: 'inline-block', marginTop: 8, padding: '3px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            letterSpacing: 0.8, textTransform: 'uppercase', color: statusColor[d.status] || '#374151',
            border: `1.5px solid ${statusColor[d.status] || '#374151'}`,
          }}>
            {DONATION_STATUS_LABELS[d.status]}
          </div>
        </div>
      </div>

      {/* Recipient + donation */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 22 }} data-pdf-keep>
        <div style={s.box}>
          <p style={s.label}>Donated to</p>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>{d.recipient_name}</div>
          {d.recipient_type && <div style={{ color: '#4b5563' }}>{RECIPIENT_TYPE_LABELS[d.recipient_type]}</div>}
          {d.recipient_address && <div style={{ color: '#4b5563', whiteSpace: 'pre-wrap' }}>{d.recipient_address}</div>}
          {d.recipient_contact && <div style={{ color: '#4b5563' }}>{d.recipient_contact}</div>}
        </div>
        <div style={s.box}>
          <p style={s.label}>Donation</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 3 }}>
            <span style={{ color: '#6b7280' }}>Type</span><span style={{ fontWeight: 600 }}>{DONATION_CATEGORY_LABELS[d.category]}</span>
            {d.purpose && <><span style={{ color: '#6b7280' }}>Purpose</span><span style={{ fontWeight: 600 }}>{d.purpose}</span></>}
            {d.payment_method && <><span style={{ color: '#6b7280' }}>Paid by</span><span>{d.payment_method}</span></>}
            {d.reference && <><span style={{ color: '#6b7280' }}>Reference</span><span>{d.reference}</span></>}
          </div>
        </div>
      </div>

      {d.description && (
        <div style={{ marginTop: 16 }} data-pdf-keep>
          <p style={s.label}>Details</p>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#374151' }}>{d.description}</p>
        </div>
      )}

      {/* Items or single amount */}
      {items.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
          <thead>
            <tr>
              <th style={{ ...s.th, borderTopLeftRadius: 8 }}>Item</th>
              <th style={{ ...s.th, textAlign: 'center', width: 90 }}>Qty</th>
              <th style={{ ...s.th, textAlign: 'right', width: 140 }}>Unit value</th>
              <th style={{ ...s.th, textAlign: 'right', width: 150, borderTopRightRadius: 8 }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                <td style={{ ...s.td, whiteSpace: 'pre-wrap' }}>{it.description}</td>
                <td style={{ ...s.td, textAlign: 'center' }}>{formatNumber(Number(it.quantity), Number(it.quantity) % 1 ? 2 : 0)}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>{formatNumber(Number(it.unit_value))}</td>
                <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{formatNumber(Number(it.quantity) * Number(it.unit_value))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }} data-pdf-keep>
        <div style={{ minWidth: 300, borderRadius: 10, overflow: 'hidden', border: `1px solid ${primary}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: primary, color: '#fff' }}>
            <span style={{ fontWeight: 700, letterSpacing: 0.6 }}>{d.category === 'cash' ? 'AMOUNT DONATED' : 'TOTAL VALUE'}</span>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{formatCurrency(total, currency)}</span>
          </div>
        </div>
      </div>

      {d.notes && (
        <div style={{ marginTop: 16 }} data-pdf-keep>
          <p style={s.label}>Notes</p>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#374151' }}>{d.notes}</p>
        </div>
      )}

      {/* Acknowledgement + signatures, pinned to the bottom */}
      <div style={{ marginTop: 'auto', paddingTop: 28 }} data-pdf-keep>
        <p style={{ margin: '0 0 26px', color: '#374151', fontSize: 13 }}>
          This voucher confirms the above donation by <strong>{d.company_name}</strong> to <strong>{d.recipient_name}</strong>.
          The recipient acknowledges receipt by signing below.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28 }}>
          {[
            ['Prepared by', d.created_by_name],
            ['Approved by', d.approved_by_name],
            ['Received by (recipient)', d.received_by],
          ].map(([t, name]) => (
            <div key={t as string}>
              <div style={{ height: 42, display: 'flex', alignItems: 'flex-end', fontWeight: 600, color: '#111827' }}>{name || ''}</div>
              <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#6b7280' }}>
                {t}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 10 }}>Signature &amp; date</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DonationDocument;
