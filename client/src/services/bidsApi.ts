import { api } from './api';

/* --------------------------------- Profile -------------------------------- */

export interface Director { name: string; address: string; nationality?: string }
export interface BeneficialOwner {
  name: string; nationality: string; residence: string; address: string;
  shares: boolean; votes: boolean; board: boolean;
}
export interface Experience { client: string; description: string; amount: string; year: string; contact: string }

/** The facts every bid asks for (one per company). */
export interface BidProfile {
  legal_name?: string;
  registration_number?: string;
  tpin?: string;
  vat_number?: string;
  ppda_number?: string;
  physical_address?: string;
  postal_address?: string;
  phone?: string;
  email?: string;
  website?: string;
  nationality?: string;
  year_established?: string;
  signatory_user_id?: number | null;
  signatory_name?: string;
  signatory_title?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_branch?: string;
  bank_account_type?: string;
  swift_code?: string;
  /** Older free-text bank details (from company settings). */
  bank_details?: string;
  validity_days?: number;
  payment_terms?: string;
  warranty?: string;
  delivery?: string;
  directors?: Director[];
  beneficial_owners?: BeneficialOwner[];
  experience?: Experience[];
}

export const getBidProfile = async (companyId: number): Promise<{ saved: boolean; updated_at: string | null; profile: BidProfile }> =>
  (await api.get('/bids/profile', { params: { company_id: companyId } })).data;
export const saveBidProfile = async (companyId: number, profile: BidProfile) =>
  (await api.put('/bids/profile', { company_id: companyId, profile })).data;

/* ---------------------------------- Vault --------------------------------- */

export interface BidDocument {
  id: number;
  company_id: number;
  doc_type: string;
  title: string;
  file_url: string;
  file_name?: string | null;
  mime?: string | null;
  issued?: string | null;
  expires?: string | null;
  days_left?: number | null;
  notes?: string | null;
  uploaded_by_name?: string | null;
  created_at?: string;
}

export const getBidDocuments = async (companyId: number): Promise<BidDocument[]> =>
  (await api.get('/bids/documents', { params: { company_id: companyId } })).data;
export const uploadBidDocument = async (companyId: number, file: File, meta: { doc_type: string; title: string; issued_on?: string; expires_on?: string; notes?: string }) => {
  const fd = new FormData();
  fd.append('company_id', String(companyId));
  Object.entries(meta).forEach(([k, v]) => { if (v) fd.append(k, v); });
  fd.append('file', file);
  return (await api.post('/bids/documents', fd)).data as BidDocument;
};
export const updateBidDocument = async (id: number, meta: { doc_type: string; title: string; issued_on?: string | null; expires_on?: string | null; notes?: string | null }) =>
  (await api.put(`/bids/documents/${id}`, meta)).data as BidDocument;
export const deleteBidDocument = async (id: number) => { await api.delete(`/bids/documents/${id}`); };

/* ---------------------------------- Bids ---------------------------------- */

export type BidKind = 'tender' | 'rfq';
export type BidStatus = 'draft' | 'review' | 'approved' | 'submitted' | 'won' | 'lost' | 'cancelled';

export interface TenderInfo {
  title?: string;
  procuring_entity?: string;
  addressee?: string;
  reference_number?: string;
  procurement_method?: string;
  lots?: string[];
  deadline?: string;
  submission_place?: string;
  opening?: string;
  validity_days?: number;
  currency?: string;
  copies_required?: string;
  bid_security?: string;
  performance_security?: string;
  performance_security_percent?: number;
  delivery_period?: string;
  delivery_place?: string;
  payment_terms?: string;
  warranty_required?: string;
  price_basis?: string;
  clarification_contact?: string;
  summary?: string;
  warnings?: string[];
}

export interface BidItem { item_no: string; description: string; quantity: number; unit: string; lot?: string; unit_price: number | null; origin?: string }
export interface BidSpec { item_no: string; section: string; requirement: string; mandatory: boolean; offered: string; compliance: 'Comply' | 'Partly comply' | 'Does not comply' | string }
export interface ChecklistItem { label: string; doc_type: string; mandatory: boolean; done: boolean; document_id: number | null }
export interface Commission { name: string; address: string; reason: string; amount: string }

/** What the bidder decides for this bid (prefilled from the Bid Profile). */
export interface BidOptions {
  bid_date?: string;
  validity_days?: number;
  warranty?: string;
  delivery?: string;
  payment_terms?: string;
  addenda?: string;
  alternative_no?: string;
  discounts?: string;
  discount_method?: string;
  nationality?: string;
  commissions?: Commission[];
  prices_include?: string;
  /** 'inclusive' = prices include VAT and the PPDA levy; 'separate' = added as lines. */
  tax_mode?: 'inclusive' | 'separate';
  vat_rate?: number;
  levy_rate?: number;
  show_signature?: boolean;
  cover_subject?: string;
  cover_body?: string;
  /** Vault documents attached to the bid pack, in order. */
  attachments?: number[];
}

export interface BidData {
  kind?: BidKind;
  tender?: TenderInfo;
  items?: BidItem[];
  specs?: BidSpec[];
  checklist?: ChecklistItem[];
  forms?: string[];
  options?: BidOptions;
}

export interface Bid {
  id: number;
  company_id: number;
  created_by?: number | null;
  created_by_name?: string | null;
  bid_number: string;
  kind: BidKind;
  status: BidStatus;
  title?: string | null;
  procuring_entity?: string | null;
  reference_number?: string | null;
  deadline?: string | null;
  minutes_left?: number | null;
  data: BidData;
  source_file_url?: string | null;
  source_file_name?: string | null;
  ai_status?: 'reading' | 'done' | 'failed' | 'unavailable' | null;
  ai_error?: string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  submitted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  // list only
  total?: number;
  item_count?: number;
}

export const getBids = async (companyId: number): Promise<Bid[]> => (await api.get('/bids', { params: { company_id: companyId } })).data;
export const getBid = async (id: number): Promise<Bid> => (await api.get(`/bids/${id}`)).data;
export const uploadTender = async (companyId: number, file: File): Promise<Bid> => {
  const fd = new FormData();
  fd.append('company_id', String(companyId));
  fd.append('file', file);
  return (await api.post('/bids/upload', fd)).data;
};
export const createBid = async (companyId: number, kind: BidKind, title: string): Promise<Bid> =>
  (await api.post('/bids', { company_id: companyId, kind, title })).data;
export const saveBid = async (id: number, data: BidData): Promise<Bid> => (await api.put(`/bids/${id}`, { data })).data;
export const readBidAgain = async (id: number): Promise<Bid> => (await api.post(`/bids/${id}/read`)).data;
export const setBidStatus = async (id: number, status: BidStatus): Promise<Bid> => (await api.post(`/bids/${id}/status`, { status })).data;
export const duplicateBid = async (id: number): Promise<Bid> => (await api.post(`/bids/${id}/duplicate`)).data;
export const deleteBid = async (id: number) => { await api.delete(`/bids/${id}`); };

/* --------------------------------- Labels --------------------------------- */

export const DOC_TYPE_LABELS: Record<string, string> = {
  tax_clearance: 'Tax Clearance Certificate',
  ppda_registration: 'PPDA Registration Certificate',
  business_registration: 'Business Registration Certificate',
  vat_registration: 'VAT Registration Certificate',
  withholding_tax: 'Withholding Tax Exemption Certificate',
  company_profile: 'Company Profile',
  power_of_attorney: 'Power of Attorney',
  audited_accounts: 'Audited Financial Statements',
  bank_letter: 'Bank Letter / Credit Line',
  manufacturer_authorisation: "Manufacturer's Authorisation",
  brochure: 'Brochure / Catalogue',
  joint_venture_agreement: 'Joint Venture Agreement',
  experience: 'Past Contracts / Orders',
  other: 'Other document',
};

export const FORM_LABELS: Record<string, string> = {
  cover_letter: 'Cover letter',
  bid_submission_sheet: 'Bid Submission Sheet',
  price_schedule: 'Price Schedule',
  bid_securing_declaration: 'Bid Securing Declaration',
  beneficial_ownership: 'Beneficial Ownership Disclosure',
  anti_corruption: 'Anti-Corruption Declaration',
  eshs_declaration: 'Environmental, Social, Health & Safety Declaration',
  eligible_countries: 'Eligible Countries Declaration',
  technical_compliance: 'Technical Specifications & Compliance Sheet',
  quotation: 'Quotation',
  experience: 'Past Experience & References',
  bank_details: 'Bank Details',
};
export const FORM_ORDER = Object.keys(FORM_LABELS);

export const STATUS_LABELS: Record<BidStatus, string> = {
  draft: 'Draft', review: 'Ready for review', approved: 'Approved', submitted: 'Submitted', won: 'Won', lost: 'Not won', cancelled: 'Cancelled',
};
export const STATUS_STYLE: Record<BidStatus, string> = {
  draft: 'bg-gray-100 text-gray-700', review: 'bg-amber-100 text-amber-800', approved: 'bg-blue-100 text-blue-700',
  submitted: 'bg-indigo-100 text-indigo-700', won: 'bg-emerald-100 text-emerald-700', lost: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-500',
};

/** The bid form a checklist line refers to (e.g. "Completed Bid Submission Form"), if any. */
export const formForLabel = (label: string): string | null => {
  const l = label.toLowerCase();
  if (/submission (form|sheet)|bid form\b/.test(l)) return 'bid_submission_sheet';
  if (/securing declaration/.test(l)) return 'bid_securing_declaration';
  if (/beneficial owner/.test(l)) return 'beneficial_ownership';
  if (/price schedule|bill of quantities|priced/.test(l)) return 'price_schedule';
  if (/anti.?corruption/.test(l)) return 'anti_corruption';
  if (/environmental|eshs/.test(l)) return 'eshs_declaration';
  if (/eligib(le|ility) countr/.test(l)) return 'eligible_countries';
  if (/technical (spec|compliance)|compliance sheet/.test(l)) return 'technical_compliance';
  if (/cover(ing)? letter/.test(l)) return 'cover_letter';
  if (/past experience|similar contracts|references/.test(l)) return 'experience';
  if (/bank details/.test(l)) return 'bank_details';
  return null;
};

/** Totals — one source for every form, so the figures always agree. */
export const lineTotal = (it: BidItem) => Math.round((Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * 100) / 100;
export const bidTotals = (d: BidData) => {
  const subtotal = (d.items || []).reduce((s, it) => s + lineTotal(it), 0);
  const o = d.options || {};
  if (o.tax_mode !== 'separate') return { subtotal, vat: 0, levy: 0, grand: subtotal, separate: false };
  const vat = Math.round(subtotal * (Number(o.vat_rate ?? 0.165) || 0) * 100) / 100;
  const levy = Math.round(subtotal * (Number(o.levy_rate ?? 0.01) || 0) * 100) / 100;
  return { subtotal, vat, levy, grand: subtotal + vat + levy, separate: true };
};
export const bidTotal = (d: BidData) => bidTotals(d).grand;
