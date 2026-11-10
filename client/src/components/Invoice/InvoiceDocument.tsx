import React from 'react';
import { InvoiceItem } from '../../types';
import { formatCurrency, formatNumber, documentVatRate } from '../../utils/calculations';
import SupremeDocument from '../Letterhead/SupremeDocument';
import BrandDocument from '../Document/BrandDocument';
import { PRICED_COLUMNS, pricedTotals } from '../Quotation/QuotationDocument';

export interface InvoiceDocData {
  invoice_number?: string;
  title?: string | null;
  client_name?: string;
  client_address?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  date?: string;
  due_days?: number | null;
  items?: InvoiceItem[];
  subtotal?: number;
  discount_type?: 'amount' | 'percent' | null;
  discount_value?: number | string | null;
  discount_amount?: number | string | null;
  vat_amount?: number;
  vat_rate?: number | string | null;
  ppda_amount?: number;
  grand_total?: number;
  notes?: string | null;
  terms_conditions?: string | null;
}

export interface InvoiceDocCompany {
  name: string;
  address?: string | null;
  tpin?: string | null;
  bank_details?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  template?: string | null;
  letterhead?: string | null;
  currency?: string | null;
}

/**
 * An invoice in the company's chosen design (or the Supreme letterhead).
 * Used by the invoice page / PDF and by the live preview on the invoice forms.
 */
const InvoiceDocument: React.FC<{ data: InvoiceDocData; company: InvoiceDocCompany; rootClassName?: string }> = ({
  data, company, rootClassName = '',
}) => {
  if (company.template === 'supreme') {
    return (
      <SupremeDocument
        kind="invoice"
        rootClassName={rootClassName}
        data={{ ...data, number: data.invoice_number } as any}
        company={{
          name: company.name, tpin: company.tpin, bank_details: company.bank_details, logo_url: company.logo_url,
          primary_color: company.primary_color, secondary_color: company.secondary_color,
          letterhead: company.letterhead, currency: company.currency,
        }}
      />
    );
  }

  const dueDate = (() => {
    if (!data.date || !data.due_days) return 'N/A';
    const d = new Date(data.date);
    d.setDate(d.getDate() + Number(data.due_days));
    return d.toLocaleDateString();
  })();
  const base = (Number(data.subtotal) || 0) - (Number(data.discount_amount) || 0);

  return (
    <BrandDocument
      template={company.template as any}
      kind="invoice"
      rootClassName={rootClassName}
      company={{
        name: company.name, address: company.address || undefined, tpin: company.tpin || undefined,
        bank_details: company.bank_details || undefined, logo_url: company.logo_url || undefined,
        primary_color: company.primary_color || undefined, secondary_color: company.secondary_color || undefined,
      } as any}
      title="Invoice"
      number={data.invoice_number || 'INV-0000'}
      meta={[
        { l: 'Date', v: data.date ? new Date(data.date).toLocaleDateString() : 'N/A' },
        { l: 'Due Date', v: dueDate },
      ]}
      party={{ label: 'Bill To', name: data.client_name || 'Client Name', lines: [data.client_address, data.client_email, data.client_phone] }}
      columns={PRICED_COLUMNS}
      rows={(data.items || []).map((item) => [
        item.description, formatNumber(Number(item.quantity) || 0), formatCurrency(Number(item.unit_price) || 0),
        formatCurrency(item.total != null ? Number(item.total) : (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)),
      ])}
      totals={pricedTotals(data, documentVatRate(data), base > 0 ? (Number(data.ppda_amount) || 0) / base : null)}
      showBank
      notes={data.notes}
      terms={data.terms_conditions}
    />
  );
};

export default InvoiceDocument;
