import { api } from './api';

export interface Letter {
  id: number;
  company_id: number;
  created_by?: number | null;
  created_by_name?: string | null;
  letter_number: string;
  /** YYYY-MM-DD */
  letter_date: string;
  reference?: string | null;
  recipient_name?: string | null;
  recipient_title?: string | null;
  recipient_company?: string | null;
  recipient_address?: string | null;
  subject?: string | null;
  salutation?: string | null;
  body?: string | null;
  closing?: string | null;
  signer_user_id?: number | null;
  signer_name?: string | null;
  signer_title?: string | null;
  signature_url?: string | null;
  show_signature?: number | boolean;
  cc?: string | null;
  enclosures?: string | null;
  created_at?: string;
  updated_at?: string;
  // Letterhead (company) details.
  company_name?: string;
  company_address?: string | null;
  company_tpin?: string | null;
  company_logo?: string | null;
  company_quote_logo?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  company_template?: string | null;
  company_letterhead?: string | null;
  company_letter_details?: string | null;
}

export interface LetterInput {
  company_id?: number;
  letter_number?: string;
  date: string;
  reference?: string;
  recipient_name?: string;
  recipient_title?: string;
  recipient_company?: string;
  recipient_address?: string;
  subject?: string;
  salutation?: string;
  body: string;
  closing?: string;
  signer_user_id?: number | null;
  /** Take the signer's current signature (it changed while editing). */
  refresh_signature?: boolean;
  signer_name?: string;
  signer_title?: string;
  show_signature?: boolean;
  cc?: string;
  enclosures?: string;
}

export interface Signer { id: number; name: string; job_title?: string | null; signature_url?: string | null }

export interface LetterOptions { next_number: string; signers: Signer[]; ai_enabled: boolean }

export type LetterTone = 'formal' | 'friendly' | 'firm' | 'apologetic';

export interface LetterDraft { subject: string; salutation: string; body: string; closing: string }

export const getLetters = async (companyId: number): Promise<Letter[]> =>
  (await api.get('/letters', { params: { company_id: companyId } })).data;

export const getLetter = async (id: number): Promise<Letter> => (await api.get(`/letters/${id}`)).data;

export const getLetterOptions = async (companyId: number): Promise<LetterOptions> =>
  (await api.get('/letters/options', { params: { company_id: companyId } })).data;

export const createLetter = async (data: LetterInput): Promise<Letter> => (await api.post('/letters', data)).data;

export const updateLetter = async (id: number, data: LetterInput): Promise<Letter> => (await api.put(`/letters/${id}`, data)).data;

export const duplicateLetter = async (id: number): Promise<Letter> => (await api.post(`/letters/${id}/duplicate`)).data;

export const deleteLetter = async (id: number): Promise<void> => { await api.delete(`/letters/${id}`); };

export const draftLetterWithAi = async (data: {
  company_id: number;
  context: string;
  tone: LetterTone;
  recipient_name?: string;
  recipient_title?: string;
  recipient_company?: string;
  signer_name?: string;
  signer_title?: string;
  /** Improve the current draft instead of starting over. */
  improve?: boolean;
  subject?: string;
  body?: string;
}): Promise<LetterDraft> => (await api.post('/letters/draft', data)).data;

// The signed-in user's own signature (My Profile).
export interface MySignature { name: string; job_title?: string | null; signature_url?: string | null }

export const getMySignature = async (): Promise<MySignature> => (await api.get('/letters/me/signature')).data;

export const saveMyJobTitle = async (jobTitle: string): Promise<MySignature> =>
  (await api.put('/letters/me/signature', { job_title: jobTitle })).data;

export const uploadMySignature = async (file: File): Promise<MySignature> => {
  const form = new FormData();
  form.append('file', file);
  return (await api.post('/letters/me/signature/file', form)).data;
};

export const removeMySignature = async (): Promise<void> => { await api.delete('/letters/me/signature/file'); };
