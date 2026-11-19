import { api } from './api';
import { InvoiceItem, Payment } from '../types';

/** A cash sale: sold and paid on the spot. Stored as an invoice + its payment. */
export interface CashSale {
  id: number;
  company_id: number;
  invoice_number: string;
  doc_type: 'cash_sale';
  client_id?: number | null;
  client_name: string;
  client_address?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  date: string;
  /** The sale date as YYYY-MM-DD (no time-zone shifts). */
  sale_date: string;
  title?: string | null;
  items: InvoiceItem[];
  item_count?: number;
  subtotal: number | string;
  discount_type?: 'amount' | 'percent' | null;
  discount_value?: number | string | null;
  discount_amount?: number | string | null;
  vat_rate?: number | string | null;
  vat_amount: number | string;
  ppda_amount: number | string;
  grand_total: number | string;
  amount_paid: number | string;
  notes?: string | null;
  created_by?: number | null;
  created_by_name?: string | null;
  created_at?: string;
  // The payment recorded with the sale.
  payment_id?: number | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_account_id?: number | null;
  payment_account_name?: string | null;
  receipt_number?: string | null;
  // Company (letterhead) details.
  company_name: string;
  company_address?: string | null;
  company_tpin?: string | null;
  company_bank_details?: string | null;
  company_logo?: string | null;
  company_quote_logo?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  company_template?: string | null;
  company_letterhead?: string | null;
  company_currency?: string | null;
}

export interface CashSaleInput {
  company_id?: number;
  invoice_number?: string;
  client_id?: number | null;
  client_name?: string;
  client_address?: string;
  client_email?: string;
  client_phone?: string;
  date?: string;
  title?: string;
  items: { description: string; quantity: number; unit_price: number }[];
  vat_rate?: number;
  ppda_rate?: number;
  discount_type?: 'amount' | 'percent' | null;
  discount_value?: number;
  notes?: string;
  method?: string;
  reference?: string;
  account_id?: number | null;
}

export const getCashSales = async (companyId: number, filters: { from?: string; to?: string } = {}): Promise<CashSale[]> => {
  const params: Record<string, string | number> = { company_id: companyId };
  Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
  return (await api.get('/cash-sales', { params })).data;
};

export const getCashSale = async (id: number): Promise<CashSale> => (await api.get(`/cash-sales/${id}`)).data;

export const getNextCashSaleNumber = async (companyId: number): Promise<string> =>
  (await api.get('/cash-sales/next-number', { params: { company_id: companyId } })).data.number;

export const createCashSale = async (data: CashSaleInput): Promise<CashSale> => (await api.post('/cash-sales', data)).data;

export const updateCashSale = async (id: number, data: CashSaleInput): Promise<CashSale> =>
  (await api.put(`/cash-sales/${id}`, data)).data;

export const deleteCashSale = async (id: number): Promise<void> => { await api.delete(`/cash-sales/${id}`); };

/** Everything a printed payment receipt shows. */
export interface ReceiptData extends Payment {
  receipt_number: string | null;
  invoice: {
    id: number;
    invoice_number: string;
    doc_type: 'invoice' | 'cash_sale';
    date: string;
    title?: string | null;
    client_id?: number | null;
    client_name: string;
    client_address?: string | null;
    client_email?: string | null;
    client_phone?: string | null;
    grand_total: number | string;
    company_name: string;
    company_address?: string | null;
    company_tpin?: string | null;
    company_logo?: string | null;
    company_quote_logo?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    company_currency?: string | null;
    company_template?: string | null;
  };
  /** Settled on the invoice before this payment (discounts included). */
  paid_before: number;
  /** A settlement discount given together with this payment. */
  discount_with_payment: number;
  balance_after: number;
}

export const getReceipt = async (paymentId: number): Promise<ReceiptData> =>
  (await api.get(`/payments/${paymentId}/receipt`)).data;
