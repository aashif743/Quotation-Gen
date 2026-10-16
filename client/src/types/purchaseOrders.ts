export type PurchaseOrderStatus = 'draft' | 'sent' | 'received' | 'cancelled';

export interface PurchaseOrderItem {
  id?: number;
  purchase_order_id?: number;
  description: string;
  quantity: number;
  unit_cost: number;
  total?: number;
  sort_order?: number;
}

export interface PurchaseOrder {
  id: number;
  company_id: number;
  created_by?: number | null;
  created_by_name?: string | null;
  vendor_id?: number | null;
  lpo_number: string;
  vendor_name: string;
  vendor_address?: string | null;
  vendor_email?: string | null;
  vendor_phone?: string | null;
  quotation_id?: number | null;
  quotation_number?: string | null;
  job_card_id?: number | null;
  job_card_number?: string | null;
  purchase_id?: number | null;
  purchase_number?: string | null;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'YYYY-MM-DD' or null */
  delivery_date?: string | null;
  delivery_address?: string | null;
  payment_terms?: string | null;
  subtotal: number | string;
  vat_amount: number | string;
  grand_total: number | string;
  status: PurchaseOrderStatus;
  notes?: string | null;
  terms_conditions?: string | null;
  created_at?: string;
  updated_at?: string;
  items?: PurchaseOrderItem[];
  // Company branding (detail endpoint only)
  company_name?: string;
  company_address?: string;
  company_tpin?: string;
  company_logo?: string;
  company_quote_logo?: string;
  primary_color?: string;
  secondary_color?: string;
  company_vat_rate?: number | string;
}

export interface PurchaseOrderInput {
  company_id: number;
  vendor_id?: number | null;
  lpo_number: string;
  vendor_name: string;
  vendor_address?: string;
  vendor_email?: string;
  vendor_phone?: string;
  quotation_id?: number | null;
  job_card_id?: number | null;
  date: string;
  delivery_date?: string | null;
  delivery_address?: string;
  payment_terms?: string;
  include_vat: boolean;
  notes?: string;
  terms_conditions?: string;
  items: { description: string; quantity: number; unit_cost: number }[];
}
