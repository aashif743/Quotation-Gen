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
  organization_id?: number | null;
  is_super_admin?: boolean;
  // Set when a super-admin has "entered" an organization to inspect it.
  acting_organization?: { id: number; name: string } | null;
}

// ---------------------------------------------------------------------------
// Staff attendance (fingerprint / biometric)
// ---------------------------------------------------------------------------
export interface AttendanceDevice {
  id: number;
  name: string;
  api_key: string;
  active: number | boolean;
  last_seen_at?: string | null;
  created_at?: string;
}
export interface AttendanceEnrollment {
  id: number;
  user_id: number;
  device_user_id: string;
  name: string;
  email?: string;
  role?: string;
  created_at?: string;
}
export interface AttendancePunch {
  id: number;
  user_id: number | null;
  user_name: string | null;
  device_user_id: string | null;
  punch_time: string;
  source: 'device' | 'manual';
  note?: string | null;
}
export interface AttendanceTodayStaff {
  user_id: number;
  name: string;
  status: 'present' | 'late' | 'absent';
  first_in: string | null;
  last_out: string | null;
}
export interface AttendanceReportRow {
  user_id: number;
  name: string;
  date: string;
  first_in: string | null;
  last_out: string | null;
  hours: number;
  late: boolean;
}
export interface AttendanceSettings {
  work_start: string;
  work_end: string;
  late_grace_minutes: number;
}

// A tenant. Managed by the platform owner (super-admin).
export interface Organization {
  id: number;
  name: string;
  status: 'active' | 'suspended';
  created_at?: string;
  user_count?: number;
  company_count?: number;
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
  currency?: string;
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

// ---------------------------------------------------------------------------
// Vendors (buy side) — suppliers the company buys from, the purchases (bills)
// recorded against them, and the payments made OUT to them.
// ---------------------------------------------------------------------------
export interface Vendor {
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

  // Joined in list/detail endpoints
  purchase_count?: number;
  total_purchased?: number;
  total_paid?: number;
  balance_payable?: number;
  last_activity?: string | null;
}

export interface PurchaseItem {
  id?: number;
  purchase_id?: number;
  description: string;
  quantity: number;
  unit_cost: number;
  total: number;
  sort_order?: number;
}

export interface Purchase {
  id?: number;
  company_id: number;
  vendor_id?: number | null;
  purchase_number: string;
  vendor_name: string;
  vendor_address?: string;
  vendor_email?: string;
  vendor_phone?: string;
  quotation_id?: number | null;
  invoice_id?: number | null;
  date: string;
  subtotal: number;
  grand_total: number;
  notes?: string;
  items: PurchaseItem[];
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  created_by_name?: string;

  // Joined / computed by GET /purchases/:id
  quotation_number?: string | null;
  quotation_total?: number | null;
  invoice_number?: string | null;
  invoice_total?: number | null;
  amount_paid?: number;
  balance_due?: number;
  payment_status?: PaymentStatus;
  payments?: VendorPayment[];
  profit?: { sale_value: number; order_cost: number; profit: number } | null;
}

// Compact purchase row used in vendor-detail + history tables.
export interface PurchaseDocSummary {
  id: number;
  number: string;
  vendor_name: string;
  date: string;
  grand_total?: number;
  created_at: string;
  created_by?: number;
  created_by_name?: string;
  amount_paid?: number;
  balance_due?: number;
  payment_status?: PaymentStatus;
}

export interface VendorPayment {
  id: number;
  purchase_id: number;
  amount: number;
  payment_date: string;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  recorded_by?: number | null;
  recorded_by_name?: string | null;
  created_at?: string;
}

// Petty cash ledger entry — a top-up ('in') or payout ('out') of the cash fund.
export interface PettyCashEntry {
  id: number;
  company_id: number;
  created_by?: number;
  entry_number: string;
  type: 'in' | 'out';
  category?: string | null;
  description?: string | null;
  amount: number;
  date: string;
  reference?: string | null;
  receipt_url?: string | null;
  notes?: string | null;
  created_at?: string;
  created_by_name?: string;
}

export interface PettyCashSummary {
  total_in: number;
  total_out: number;
  balance: number;
  count: number;
}

// General business expense (rent, salaries, transport, …).
export interface Expense {
  id: number;
  company_id: number;
  created_by?: number;
  vendor_id?: number | null;
  expense_number: string;
  category?: string | null;
  description?: string | null;
  amount: number;
  date: string;
  payment_method?: string | null;
  reference?: string | null;
  receipt_url?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by_name?: string;
  vendor_name?: string | null;
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