import React from 'react';
import { InvoiceItem } from '../../types';
import { formatCurrency, formatNumber, documentVatRate } from '../../utils/calculations';
import SupremeDocument from '../Letterhead/SupremeDocument';
import BrandDocument from '../Document/BrandDocument';
import { PRICED_COLUMNS, pricedTotals } from '../Quotation/QuotationDocument';
import { InvoiceDocCompany } from '../Invoice/InvoiceDocument';

export interface CashSaleDocData {
  invoice_number?: string;
  title?: string | null;
  client_name?: string;
  client_address?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  date?: string;
  items?: InvoiceItem[];
  subtotal?: number | string;
  discount_type?: 'amount' | 'percent' | null;
  discount_value?: number | string | null;
  discount_amount?: number | string | null;
  vat_amount?: number | string;
  vat_rate?: number | string | null;
  ppda_amount?: number | string;
  grand_total?: number | string;
  notes?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  receipt_number?: string | null;
}

const fmtDate = (d?: string) => {
  if (!d) return 'N/A';
  const s = String(d);
  const x = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return isNaN(x.getTime()) ? s : x.toLocaleDateString();
};

/** "Cash", or "Bank Transfer · Ref CHQ 12". */
export const paidByText = (method?: string | null, reference?: string | null) =>
  [method || 'Cash', reference ? `Ref ${reference}` : ''].filter(Boolean).join(' · ');

const PaidBadge: React.FC = () => (
  <span style={{
    display: 'inline-block', padding: '1px 10px', borderRadius: 999, border: '1.5px solid #059669',
    color: '#059669', fontWeight: 800, fontSize: 11, letterSpacing: 1.5,
  }}>
    PAID IN FULL
  </span>
);

/**
 * A cash sale in the company's chosen design (or the Supreme letterhead):
 * like an invoice, but marked paid in full with how it was paid, and no due
 * date or bank details (nothing is owed).
 */
const CashSaleDocument: React.FC<{ data: CashSaleDocData; company: InvoiceDocCompany; rootClassName?: string }> = ({
  data, company, rootClassName = '',
}) => {
  const paidBy = paidByText(data.payment_method, data.payment_reference);
  const num = (v: unknown) => Number(v) || 0;
  const docData = {
    ...data,
    subtotal: num(data.subtotal), vat_amount: num(data.vat_amount), ppda_amount: num(data.ppda_amount),
    grand_total: num(data.grand_total),
  };

  if (company.template === 'supreme') {
    return (
      <SupremeDocument
        kind="cash_sale"
        rootClassName={rootClassName}
        data={{ ...docData, number: data.invoice_number, paid_by: paidBy } as any}
        company={{
          name: company.name, tpin: company.tpin, bank_details: company.bank_details, logo_url: company.logo_url,
          primary_color: company.primary_color, secondary_color: company.secondary_color,
          letterhead: company.letterhead, currency: company.currency,
        }}
      />
    );
  }

  const base = docData.subtotal - num(data.discount_amount);
  const totals = pricedTotals(docData as any, documentVatRate(docData as any), base > 0 ? docData.ppda_amount / base : null);

  return (
    <BrandDocument
      template={company.template as any}
      kind="invoice"
      rootClassName={rootClassName}
      company={{
        name: company.name, address: company.address || undefined, tpin: company.tpin || undefined,
        logo_url: company.logo_url || undefined,
        primary_color: company.primary_color || undefined, secondary_color: company.secondary_color || undefined,
      } as any}
      title="Cash Sale"
      number={data.invoice_number || 'CS-0000'}
      meta={[
        { l: 'Date', v: fmtDate(data.date) },
        { l: 'Paid by', v: paidBy },
        ...(data.receipt_number ? [{ l: 'Receipt No.', v: data.receipt_number }] : []),
        { l: 'Status', v: <PaidBadge /> },
      ]}
      party={{ label: 'Sold To', name: data.client_name || 'Walk-in customer', lines: [data.client_address, data.client_email, data.client_phone] }}
      columns={PRICED_COLUMNS}
      rows={(data.items || []).map((item) => [
        item.description, formatNumber(Number(item.quantity) || 0), formatCurrency(Number(item.unit_price) || 0),
        formatCurrency(item.total != null ? Number(item.total) : (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)),
      ])}
      totals={{ ...totals, grandLabel: 'Total Paid' }}
      notes={data.notes}
    />
  );
};

export default CashSaleDocument;
