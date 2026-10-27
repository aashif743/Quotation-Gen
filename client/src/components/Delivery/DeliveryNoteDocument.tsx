import React from 'react';
import SupremeDocument from '../Letterhead/SupremeDocument';
import BrandDocument from '../Document/BrandDocument';

// Quantities are counts: show "60", not "60.00" (keep decimals only if used).
const formatQty = (n: number) =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(Number(n) || 0);

export interface DeliveryDocData {
  delivery_note_number?: string;
  client_name?: string;
  client_address?: string;
  client_email?: string;
  client_phone?: string;
  date?: string;
  items?: { description: string; quantity: number }[];
  /** Linked invoice number — shown as "REF" on the letterhead design. */
  invoice_number?: string | null;
}

export interface DeliveryDocCompany {
  name: string;
  address?: string;
  tpin?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  /** Company design (Settings → Quotation Design); 'supreme' switches to the client letterhead. */
  template?: string | null;
  letterhead?: string | null;
}

interface DeliveryNoteDocumentProps {
  data: DeliveryDocData;
  company: DeliveryDocCompany;
  rootClassName?: string;
}

const DeliveryNoteDocument: React.FC<DeliveryNoteDocumentProps> = ({
  data,
  company,
  rootClassName = '',
}) => {
  if (company.template === 'supreme') {
    return (
      <SupremeDocument
        kind="delivery"
        rootClassName={rootClassName}
        data={{ ...data, number: data.delivery_note_number, reference: data.invoice_number || null }}
        company={{
          name: company.name, tpin: company.tpin, logo_url: company.logo_url,
          primary_color: company.primary_color, secondary_color: company.secondary_color, letterhead: company.letterhead,
        }}
      />
    );
  }

  const items = data.items || [];
  const date = data.date ? new Date(data.date).toLocaleDateString() : 'N/A';

  return (
    <BrandDocument
      template={company.template}
      kind="delivery"
      rootClassName={rootClassName}
      company={company}
      title="Delivery Note"
      number={data.delivery_note_number || 'DN-0000'}
      meta={[{ l: 'Date', v: date }, ...(data.invoice_number ? [{ l: 'Invoice Ref', v: data.invoice_number }] : [])]}
      party={{ label: 'Deliver To', name: data.client_name || 'Client Name', lines: [data.client_address, data.client_email, data.client_phone] }}
      columns={[{ label: 'Description', role: 'desc' }, { label: 'Quantity', role: 'qty', width: 'w-32' }]}
      rows={items.map((it) => [it.description, formatQty(it.quantity)])}
      numbered
      signatures={[
        { title: 'Delivered By', caption: 'Name & Signature' },
        { title: 'Received By', caption: 'Signature / Stamp' },
      ]}
    />
  );
};

export default DeliveryNoteDocument;
