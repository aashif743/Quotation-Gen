export type UserRole = 'staff' | 'admin';

export interface Client {
  id: number;
  company_id: number;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tax_id?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;

  // Joined in list endpoints
  quotation_count?: number;
  invoice_count?: number;
  delivery_note_count?: number;
  total_invoiced?: number;
  total_quoted?: number;
  total_paid?: number;
  last_activity?: string | null;
}

export interface ClientDocSummary {
  id: number;
  number: string;
  client_name: string;
  date: string;
  grand_total?: number;
  signed_file_url?: string | null;
  signed_at?: string | null;
  created_at: string;
  created_by?: number;
  created_by_name?: string;
  // Populated for invoices (used by the Client detail tab)
  amount_paid?: number;
  balance_due?: number;
  payment_status?: PaymentStatus;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

// Returned by the admin user-management endpoints.
export interface ManagedUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  quotation_count: number;
  invoice_count: number;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  user: User | null;
}

export interface Company {
  id: number;
  name: string;
  /** Uploaded thumbnail/website-header logo (managed via Settings) */
  logo_url?: string;
  /** Fixed quotation logo bundled in `client/public/Company_Logos/` */
  quote_logo_url?: string;
  address: string;
  tpin: string;
  bank_details: string;
  vat_rate: number;
  ppda_rate: number;
  primary_color: string;
  secondary_color: string;
  template?: QuotationTemplate;
  default_terms_conditions?: string | null;
  created_at: string;
  updated_at: string;
}

export type QuotationTemplate = 'classic' | 'modern' | 'elegant' | 'bold';

export interface QuotationItem {
  id?: number;
  quotation_id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order?: number;
}

export interface Quotation {
  id?: number;
  company_id: number;
  client_id?: number | null;
  quote_number: string;
  client_name: string;
  client_address?: string;
  client_email?: string;
  client_phone?: string;
  date: string;
  expiry_days: number;
  subtotal: number;
  vat_amount: number;
  ppda_amount: number;
  grand_total: number;
  notes?: string;
  terms_conditions?: string;
  vat_rate?: number;
  ppda_rate?: number;
  items: QuotationItem[];
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  created_by_name?: string;

  company_name?: string;
  company_address?: string;
  company_tpin?: string;
  company_bank_details?: string;
  company_logo?: string;
  company_quote_logo?: string;
  primary_color?: string;
  secondary_color?: string;
  company_template?: QuotationTemplate;
}

export interface InvoiceItem {
  id?: number;
  invoice_id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order?: number;
}

export interface Invoice {
  id?: number;
  company_id: number;
  client_id?: number | null;
  quotation_id?: number;
  invoice_number: string;
  client_name: string;
  client_address?: string;
  client_email?: string;
  client_phone?: string;
  date: string;
  due_days: number;
  subtotal: number;
  vat_amount: number;
  ppda_amount: number;
  grand_total: number;
  notes?: string;
  terms_conditions?: string;
  items: InvoiceItem[];
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  created_by_name?: string;

  company_name?: string;
  company_address?: string;
  company_tpin?: string;
  company_bank_details?: string;
  company_logo?: string;
  company_quote_logo?: string;
  primary_color?: string;
  secondary_color?: string;

  // Payment fields populated by the backend
  amount_paid?: number;
  balance_due?: number;
  payment_status?: PaymentStatus;
}

export type PaymentStatus = 'pending' | 'partial' | 'paid';

export interface Payment {
  id: number;
  invoice_id: number;
  amount: number;
  payment_date: string;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  recorded_by?: number | null;
  recorded_by_name?: string | null;
  created_at?: string;
}

export interface DeliveryNoteItem {
  id?: number;
  delivery_note_id?: number;
  description: string;
  quantity: number;
  sort_order?: number;
}

export interface DeliveryNote {
  id?: number;
  company_id: number;
  client_id?: number | null;
  quotation_id?: number;
  delivery_note_number: string;
  client_name: string;
  client_address?: string;
  client_email?: string;
  client_phone?: string;
  date: string;
  items: DeliveryNoteItem[];
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  created_by_name?: string;

  // Signed/stamped copy uploaded after physical delivery.
  signed_file_url?: string | null;
  signed_at?: string | null;
  signed_by?: number | null;
  signed_by_name?: string | null;

  company_name?: string;
  company_address?: string;
  company_tpin?: string;
  company_bank_details?: string;
  company_logo?: string;
  company_quote_logo?: string;
  primary_color?: string;
  secondary_color?: string;
  company_template?: QuotationTemplate;
}