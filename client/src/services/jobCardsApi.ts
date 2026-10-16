import { api } from './api';
import { Invoice, DeliveryNote } from '../types';
import { JobCard, JobCardStatus } from '../types/jobCards';

export const getJobCards = async (
  companyId?: number,
  filters: { status?: JobCardStatus | ''; q?: string } = {}
): Promise<JobCard[]> => {
  const params: Record<string, string | number> = {};
  if (companyId) params.company_id = companyId;
  if (filters.status) params.status = filters.status;
  if (filters.q) params.q = filters.q;
  const response = await api.get('/job-cards', { params });
  return response.data;
};

export const getJobCard = async (id: number): Promise<JobCard> => {
  const response = await api.get(`/job-cards/${id}`);
  return response.data;
};

export const getNextJobCardNumber = async (companyId: number): Promise<{ jobCardNumber: string }> => {
  const response = await api.get('/job-cards/next-number', { params: { company_id: companyId } });
  return response.data;
};

export const createJobCard = async (data: Partial<JobCard> & { company_id: number }): Promise<JobCard> => {
  const response = await api.post('/job-cards', data);
  return response.data;
};

export const updateJobCard = async (id: number, data: Partial<JobCard>): Promise<JobCard> => {
  const response = await api.put(`/job-cards/${id}`, data);
  return response.data;
};

export const updateJobCardStatus = async (
  id: number,
  status: JobCardStatus,
  completedDate?: string
): Promise<JobCard> => {
  const response = await api.patch(`/job-cards/${id}/status`, { status, completed_date: completedDate });
  return response.data;
};

export const deleteJobCard = async (id: number): Promise<void> => {
  await api.delete(`/job-cards/${id}`);
};

export const createJobCardFromQuotation = async (quotationId: number): Promise<JobCard> => {
  const response = await api.post(`/job-cards/from-quotation/${quotationId}`);
  return response.data;
};

// Workflow conversions that live on other resources' routers.
export const createInvoiceFromJobCard = async (jobCardId: number): Promise<Invoice> => {
  const response = await api.post(`/invoices/from-job-card/${jobCardId}`);
  return response.data;
};

export const createDeliveryNoteFromInvoice = async (invoiceId: number): Promise<DeliveryNote> => {
  const response = await api.post(`/delivery-notes/from-invoice/${invoiceId}`);
  return response.data;
};
