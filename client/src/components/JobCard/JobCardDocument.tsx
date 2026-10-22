import React from 'react';
import SupremeJobCard, { SupremeJobCardData } from '../Letterhead/SupremeJobCard';
import { JobCardStatus, JOB_CARD_STATUS_LABELS } from '../../types/jobCards';

// Quantities are counts: show "60", not "60.00" (keep decimals only if used).
const formatQty = (n: number) =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const formatDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

export interface JobCardDocData {
  job_card_number?: string;
  client_name?: string;
  client_address?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  date?: string;
  due_date?: string | null;
  completed_date?: string | null;
  status?: JobCardStatus;
  assigned_to?: string | null;
  description?: string | null;
  notes?: string | null;
  quotation_number?: string | null;
  // Prices are NOT part of the standard printed document (only the 'supreme'
  // letterhead design prints them, like the company's paper job card).
  items?: { description: string; quantity: number; unit_price?: number; size?: string | null; service?: string | null; rate_per_sqm?: number | string | null }[];
  card_type?: SupremeJobCardData['card_type'];
  prepared_by?: string | null;
  checked_by?: string | null;
  approved_by?: string | null;
  link_person?: string | null;
}

export interface JobCardDocCompany {
  name: string;
  address?: string;
  tpin?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  /** Company design; 'supreme' switches to the client letterhead job card. */
  template?: string | null;
  letterhead?: string | null;
}

interface JobCardDocumentProps {
  data: JobCardDocData;
  company: JobCardDocCompany;
  rootClassName?: string;
}

const A4_STYLE: React.CSSProperties = { aspectRatio: '210 / 297' };

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 17, g: 24, b: 39 };
};

/**
 * Printable A4 job card (internal work order). Mirrors DeliveryNoteDocument
 * visually. Pass `rootClassName="job-card-document"` so the PDF generator
 * can find it.
 */
const JobCardDocument: React.FC<JobCardDocumentProps> = ({ data, company, rootClassName = '' }) => {
  if (company.template === 'supreme') {
    return <SupremeJobCard data={data} company={company} rootClassName={rootClassName} />;
  }

  const primary = company.primary_color || '#111827';
  const secondary = company.secondary_color || '#ffffff';
  const rgb = hexToRgb(primary);
  const tint = (a: number) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;

  const number = data.job_card_number || 'JC-0000';
  const clientName = data.client_name || 'Client Name';
  const items = data.items || [];
  const hasItems = items.length > 0;
  const statusLabel = data.status ? JOB_CARD_STATUS_LABELS[data.status] : JOB_CARD_STATUS_LABELS.pending;

  const metaRow = (label: string, value: React.ReactNode) => (
    <div className="flex justify-end gap-2 text-sm">
      <span className="text-gray-500">{label}:</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );

  return (
    <div className={`bg-white text-gray-800 flex flex-col ${rootClassName}`} style={A4_STYLE}>
      {/* Header */}
      <div className="px-10 py-7 flex items-start justify-between" style={{ backgroundColor: tint(0.06) }}>
        <div className="flex flex-col">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={`${company.name} logo`}
              className="object-contain"
              style={{ maxHeight: 80, width: 'auto' }}
            />
          ) : (
            <div
              className="rounded-lg flex items-center justify-center font-bold"
              style={{ width: 70, height: 70, backgroundColor: primary, color: secondary, fontSize: 28 }}
            >
              {company.name.charAt(0)}
            </div>
          )}
          <div className="mt-3 max-w-sm">
            {company.address && <p className="text-sm text-gray-600">{company.address}</p>}
            {company.tpin && <p className="text-xs text-gray-500 mt-0.5">TPIN: {company.tpin}</p>}
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-4xl font-extrabold tracking-tight" style={{ color: primary }}>
            JOB CARD
          </h2>
          <p className="text-lg font-semibold text-gray-900 mt-1">{number}</p>
          <div className="mt-2 space-y-0.5">
            {metaRow('Date', formatDate(data.date))}
            {data.due_date && metaRow('Due', formatDate(data.due_date))}
            {data.completed_date && metaRow('Completed', formatDate(data.completed_date))}
            {metaRow('Status', statusLabel)}
            {data.quotation_number && metaRow('Quotation Ref', data.quotation_number)}
          </div>
        </div>
      </div>
      <div className="h-1" style={{ backgroundColor: primary }} />

      <div className="px-10 py-8 flex-1 flex flex-col">
        {/* Client + assigned */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="rounded-lg border p-4" style={{ borderColor: tint(0.25) }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: primary }}>
              Client
            </p>
            <p className="font-semibold text-gray-900">{clientName}</p>
            {data.client_address && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{data.client_address}</p>}
            {data.client_email && <p className="text-sm text-gray-600">{data.client_email}</p>}
            {data.client_phone && <p className="text-sm text-gray-600">{data.client_phone}</p>}
          </div>
          <div className="rounded-lg border p-4" style={{ borderColor: tint(0.25) }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: primary }}>
              Assigned To
            </p>
            <p className="font-semibold text-gray-900 whitespace-pre-wrap">{data.assigned_to || '—'}</p>
          </div>
        </div>

        {/* Job description */}
        {data.description && (
          <div className="rounded-lg border p-4 mb-6" style={{ borderColor: tint(0.25), backgroundColor: tint(0.03) }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: primary }}>
              Job Description / Instructions
            </p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{data.description}</p>
          </div>
        )}

        {/* Items table — no prices */}
        <table className="w-full">
          <thead>
            <tr className="text-left" style={{ backgroundColor: primary, color: secondary }}>
              <th className="px-4 py-3 font-semibold text-sm w-12 text-center">#</th>
              <th className="px-4 py-3 font-semibold text-sm">Description</th>
              <th className="px-4 py-3 font-semibold text-sm text-center w-32">Qty</th>
            </tr>
          </thead>
          <tbody>
            {hasItems ? (
              items.map((item, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 ? tint(0.04) : 'transparent' }}>
                  <td className="px-4 py-3 text-sm text-center align-top border-b border-gray-100 text-gray-500">
                    {i + 1}
                  </td>
                  <td className="px-4 py-3 text-sm align-top border-b border-gray-100 whitespace-pre-wrap">
                    {item.description}
                  </td>
                  <td className="px-4 py-3 text-sm text-center align-top border-b border-gray-100 font-medium tabular-nums">
                    {formatQty(item.quantity)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No items added yet
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Notes */}
        {data.notes && (
          <div className="mt-6" data-pdf-keep>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: primary }}>
              Notes
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.notes}</p>
          </div>
        )}

        {/* Sign-off block — pinned to bottom of the page */}
        <div className="mt-auto pt-12" data-pdf-keep>
          <div className="grid grid-cols-3 gap-8">
            {[
              ['Job Done By', 'Name & Signature'],
              ['Checked / Approved By', 'Name & Signature'],
              ['Customer Acceptance', 'Signature / Date'],
            ].map(([title, caption]) => (
              <div key={title}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-12" style={{ color: primary }}>
                  {title}
                </p>
                <div className="border-t border-gray-400 pt-2 text-xs uppercase tracking-widest text-gray-500">
                  {caption}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobCardDocument;
