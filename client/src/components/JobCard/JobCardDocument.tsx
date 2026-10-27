import React from 'react';
import SupremeJobCard, { SupremeJobCardData } from '../Letterhead/SupremeJobCard';
import BrandDocument, { DocMeta } from '../Document/BrandDocument';
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

/**
 * Printable A4 job card (internal work order) in the company's chosen design.
 * Pass `rootClassName="job-card-document"` so the PDF generator can find it.
 */
const JobCardDocument: React.FC<JobCardDocumentProps> = ({ data, company, rootClassName = '' }) => {
  if (company.template === 'supreme') {
    return <SupremeJobCard data={data} company={company} rootClassName={rootClassName} />;
  }

  const items = data.items || [];
  const statusLabel = data.status ? JOB_CARD_STATUS_LABELS[data.status] : JOB_CARD_STATUS_LABELS.pending;
  const hasSize = items.some((it) => it.size);
  const hasService = items.some((it) => it.service);

  const meta: DocMeta[] = [
    { l: 'Date', v: formatDate(data.date) },
    ...(data.due_date ? [{ l: 'Due', v: formatDate(data.due_date) }] : []),
    ...(data.completed_date ? [{ l: 'Completed', v: formatDate(data.completed_date) }] : []),
    { l: 'Status', v: statusLabel },
    ...(data.quotation_number ? [{ l: 'Quotation Ref', v: data.quotation_number }] : []),
    { l: 'Assigned To', v: data.assigned_to || '—' },
  ];

  // Prices stay off the standard job card; size / service show when used.
  return (
    <BrandDocument
      template={company.template}
      kind="job_card"
      rootClassName={rootClassName}
      company={company}
      title="Job Card"
      number={data.job_card_number || 'JC-0000'}
      meta={meta}
      party={{ label: 'Client', name: data.client_name || 'Client Name', lines: [data.client_address, data.client_email, data.client_phone] }}
      blocks={data.description ? [{ label: 'Job Description / Instructions', content: data.description }] : []}
      columns={[
        { label: 'Description', role: 'desc' },
        ...(hasService ? [{ label: 'Service', role: 'text' as const, width: 'w-36' }] : []),
        ...(hasSize ? [{ label: 'Size', role: 'text' as const, width: 'w-28' }] : []),
        { label: 'Qty', role: 'qty', width: 'w-24' },
      ]}
      rows={items.map((it) => [
        it.description,
        ...(hasService ? [it.service || ''] : []),
        ...(hasSize ? [it.size || ''] : []),
        formatQty(it.quantity),
      ])}
      numbered
      notes={data.notes}
      signatures={[
        { title: 'Job Done By', caption: 'Name & Signature' },
        { title: 'Checked / Approved By', caption: 'Name & Signature' },
        { title: 'Customer Acceptance', caption: 'Signature / Date' },
      ]}
    />
  );
};

export default JobCardDocument;
