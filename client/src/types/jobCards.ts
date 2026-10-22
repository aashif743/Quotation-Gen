export type JobCardStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export const JOB_CARD_STATUSES: JobCardStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];

export const JOB_CARD_STATUS_LABELS: Record<JobCardStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export interface JobCardItem {
  id?: number;
  job_card_id?: number;
  description: string;
  quantity: number;
  /** Internal price, used when generating an invoice. Printed only by the
   *  'supreme' letterhead design (whose paper job card shows costs). */
  unit_price: number;
  sort_order?: number;
  /** 'supreme' design extras (printing jobs). */
  size?: string | null;
  service?: string | null;
  rate_per_sqm?: number | string | null;
}

export type JobCardType = 'job' | 'interiors';

export interface JobCard {
  id?: number;
  company_id: number;
  created_by?: number;
  created_by_name?: string;
  client_id?: number | null;
  quotation_id?: number | null;
  quotation_number?: string | null;
  job_card_number: string;
  client_name: string;
  client_address?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  date: string;
  due_date?: string | null;
  completed_date?: string | null;
  status: JobCardStatus;
  assigned_to?: string | null;
  description?: string | null;
  notes?: string | null;
  items: JobCardItem[];
  /** 'supreme' design extras: card type + sign-off names. */
  card_type?: JobCardType | null;
  prepared_by?: string | null;
  checked_by?: string | null;
  approved_by?: string | null;
  link_person?: string | null;
  created_at?: string;
  updated_at?: string;

  // List extras
  item_count?: number;
  invoice_count?: number;
  first_invoice_id?: number | null;
  first_invoice_number?: string | null;

  // Detail extras
  invoices?: { id: number; invoice_number: string }[];
  company_name?: string;
  company_address?: string;
  company_tpin?: string;
  company_logo?: string;
  company_quote_logo?: string;
  primary_color?: string;
  secondary_color?: string;
  company_template?: string | null;
  company_letterhead?: string | null;
  company_bank_details?: string | null;
}
