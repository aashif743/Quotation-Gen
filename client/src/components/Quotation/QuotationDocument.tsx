import React from 'react';
import { QuotationTemplate } from '../../types';
import { formatCurrency, formatNumber } from '../../utils/calculations';
import SupremeDocument from '../Letterhead/SupremeDocument';
import BrandDocument, { DocColumn } from '../Document/BrandDocument';

export interface QuotationDocData {
  quote_number?: string;
  client_name?: string;
  client_address?: string;
  client_email?: string;
  client_phone?: string;
  date?: string;
  expiry_days?: number;
  items?: { description: string; quantity: number; unit_price: number; total?: number }[];
  subtotal?: number;
  vat_amount?: number;
  ppda_amount?: number;
  grand_total?: number;
  notes?: string;
  terms_conditions?: string;
  title?: string | null;
}

export interface QuotationDocCompany {
  name: string;
  address?: string;
  tpin?: string;
  bank_details?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  vat_rate?: number;
  ppda_rate?: number;
  /** Letterhead JSON — used only by the 'supreme' design. */
  letterhead?: string | null;
  currency?: string;
}

interface QuotationDocumentProps {
  data: QuotationDocData;
  company: QuotationDocCompany;
  template?: QuotationTemplate;
  /** Class applied to the root element (PDF capture uses `.quotation-document`). */
  rootClassName?: string;
}

/** Item columns for priced documents (quotations, invoices). */
export const PRICED_COLUMNS: DocColumn[] = [
  { label: 'Description', role: 'desc' },
  { label: 'Qty', role: 'qty', width: 'w-20' },
  { label: 'Unit Price', role: 'price', width: 'w-36' },
  { label: 'Total', role: 'amount', width: 'w-36' },
];

/** Subtotal / VAT / PPDA lines + grand total, shared by quotations and invoices. */
export const pricedTotals = (
  d: { subtotal?: number; vat_amount?: number; ppda_amount?: number; grand_total?: number },
  vatRate?: number | null,
  ppdaRate?: number | null,
) => ({
  lines: [
    { l: 'Subtotal', v: formatCurrency(Number(d.subtotal) || 0) },
    { l: vatRate != null ? `VAT (${formatNumber(vatRate * 100, 1)}%)` : 'VAT', v: formatCurrency(Number(d.vat_amount) || 0) },
    ...(Number(d.ppda_amount) > 0
      ? [{ l: ppdaRate != null ? `PPDA (${formatNumber(ppdaRate * 100, 1)}%)` : 'PPDA', v: formatCurrency(Number(d.ppda_amount) || 0) }]
      : []),
  ],
  grand: formatCurrency(Number(d.grand_total) || 0),
});

const QuotationDocument: React.FC<QuotationDocumentProps> = ({
  data,
  company,
  template = 'classic',
  rootClassName = '',
}) => {
  // Client-specific letterhead design (Supreme Printers).
  if (template === 'supreme') {
    return (
      <SupremeDocument
        kind="quotation"
        rootClassName={rootClassName}
        data={{ ...data, number: data.quote_number }}
        company={{
          name: company.name, tpin: company.tpin, bank_details: company.bank_details, logo_url: company.logo_url,
          primary_color: company.primary_color, secondary_color: company.secondary_color,
          vat_rate: company.vat_rate, currency: company.currency, letterhead: company.letterhead,
        }}
      />
    );
  }

  const items = data.items || [];
  const itemTotal = (it: { quantity: number; unit_price: number; total?: number }) =>
    it.total != null ? it.total : it.quantity * it.unit_price;

  const quoteDate = data.date ? new Date(data.date).toLocaleDateString() : 'N/A';
  const expiryDate = (() => {
    if (!data.date || !data.expiry_days) return 'N/A';
    const d = new Date(data.date);
    d.setDate(d.getDate() + data.expiry_days);
    return d.toLocaleDateString();
  })();

  return (
    <BrandDocument
      template={template}
      kind="quotation"
      rootClassName={rootClassName}
      company={company}
      title="Quotation"
      number={data.quote_number || 'QT-0000'}
      meta={[{ l: 'Date', v: quoteDate }, { l: 'Valid Until', v: expiryDate }]}
      party={{ label: 'Quote To', name: data.client_name || 'Client Name', lines: [data.client_address, data.client_email, data.client_phone] }}
      columns={PRICED_COLUMNS}
      rows={items.map((it) => [it.description, formatNumber(it.quantity), formatCurrency(it.unit_price), formatCurrency(itemTotal(it))])}
      totals={pricedTotals(data, company.vat_rate, company.ppda_rate)}
      showBank
      notes={data.notes}
      terms={data.terms_conditions}
    />
  );
};

export default QuotationDocument;
