export type DonationStatus = 'planned' | 'approved' | 'given' | 'cancelled';
export type DonationCategory = 'cash' | 'goods' | 'services' | 'sponsorship';
export type RecipientType =
  | 'individual' | 'school' | 'religious' | 'health' | 'community' | 'ngo' | 'government' | 'sports' | 'other';

export interface DonationItem {
  id?: number;
  description: string;
  quantity: number;
  unit_value: number;
}

export interface Donation {
  id?: number;
  company_id: number;
  created_by?: number | null;
  created_by_name?: string | null;
  donation_number?: string;
  date: string;
  recipient_name: string;
  recipient_type?: RecipientType | null;
  recipient_contact?: string | null;
  recipient_address?: string | null;
  category: DonationCategory;
  purpose?: string | null;
  description?: string | null;
  amount: number | string;
  payment_method?: string | null;
  reference?: string | null;
  status: DonationStatus;
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  received_by?: string | null;
  notes?: string | null;
  proof_url?: string | null;
  proof_name?: string | null;
  items?: DonationItem[];
  item_count?: number;
  created_at?: string;

  company_name?: string;
  company_address?: string;
  company_tpin?: string;
  company_logo?: string;
  company_quote_logo?: string;
  primary_color?: string;
  secondary_color?: string;
  company_currency?: string;
}

export interface DonationSummary {
  year: number;
  given_total: number;
  given_count: number;
  pending_total: number;
  awaiting_approval: number;
  approved_not_given: number;
  recipients: number;
  by_category: { category: DonationCategory; count: number; total: number }[];
  by_month: { month: number; total: number }[];
}

export const DONATION_STATUS_LABELS: Record<DonationStatus, string> = {
  planned: 'Awaiting approval', approved: 'Approved', given: 'Given', cancelled: 'Cancelled',
};
export const DONATION_CATEGORY_LABELS: Record<DonationCategory, string> = {
  cash: 'Cash / money', goods: 'Goods / items', services: 'Services', sponsorship: 'Sponsorship',
};
export const RECIPIENT_TYPE_LABELS: Record<RecipientType, string> = {
  individual: 'Individual', school: 'School / education', religious: 'Church / mosque / religious',
  health: 'Hospital / health', community: 'Community group', ngo: 'NGO / charity',
  government: 'Government / public body', sports: 'Sports / youth club', other: 'Other',
};

/** Badge classes per status. */
export const DONATION_STATUS_STYLE: Record<DonationStatus, string> = {
  planned: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-700',
  given: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500 line-through',
};
