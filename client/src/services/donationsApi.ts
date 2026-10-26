import { api } from './api';
import { Donation, DonationStatus, DonationSummary } from '../types/donations';

export const getDonations = async (
  companyId: number,
  filters: { status?: string; category?: string; from?: string; to?: string; q?: string } = {}
): Promise<Donation[]> => {
  const params: Record<string, string | number> = { company_id: companyId };
  Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
  return (await api.get('/donations', { params })).data;
};

export const getDonationSummary = async (companyId: number, year: number): Promise<DonationSummary> =>
  (await api.get('/donations/summary', { params: { company_id: companyId, year } })).data;

export const getDonation = async (id: number): Promise<Donation> => (await api.get(`/donations/${id}`)).data;

export const createDonation = async (data: Partial<Donation> & { company_id: number }): Promise<Donation> =>
  (await api.post('/donations', data)).data;

export const updateDonation = async (id: number, data: Partial<Donation>): Promise<Donation> =>
  (await api.put(`/donations/${id}`, data)).data;

export const setDonationStatus = async (
  id: number, status: DonationStatus, extra: { received_by?: string; date?: string } = {}
): Promise<Donation> => (await api.patch(`/donations/${id}/status`, { status, ...extra })).data;

export const uploadDonationProof = async (id: number, file: File): Promise<Donation> => {
  const form = new FormData();
  form.append('file', file);
  return (await api.post(`/donations/${id}/proof`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
};

export const deleteDonationProof = async (id: number): Promise<Donation> => (await api.delete(`/donations/${id}/proof`)).data;

export const deleteDonation = async (id: number): Promise<void> => { await api.delete(`/donations/${id}`); };
