import axios from 'axios';
import { Company, Quotation, Invoice, DeliveryNote, User, AuthStatus, ManagedUser, UserRole } from '../types';

// Use a relative base so the same build works in development (proxied by CRA
// to the local Express server) and in production (served by the same Express
// process from the same origin). Override via REACT_APP_API_URL only if the
// API lives on a different host than the static frontend.
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Auth API functions
export const checkAuthStatus = async (): Promise<AuthStatus> => {
  const response = await api.get('/auth/status');
  return response.data;
};

export const login = async (email: string, password: string): Promise<User> => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
};

export const logout = async (): Promise<void> => {
  await api.post('/auth/logout');
};

// Admin user-management API
export const getUsers = async (): Promise<ManagedUser[]> => {
  const response = await api.get('/users');
  return response.data;
};

export const createUser = async (data: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<ManagedUser> => {
  const response = await api.post('/users', data);
  return response.data;
};

export const updateUser = async (
  id: number,
  data: { name?: string; email?: string; role?: UserRole; password?: string }
): Promise<ManagedUser> => {
  const response = await api.put(`/users/${id}`, data);
  return response.data;
};

export const deleteUser = async (id: number): Promise<void> => {
  await api.delete(`/users/${id}`);
};

// Admin: storage usage
export interface StorageUsage {
  database: {
    name: string;
    tables: {
      name: string;
      row_count: number;
      data_bytes: number;
      index_bytes: number;
      size_bytes: number;
    }[];
    total_bytes: number;
  };
  uploads: { directory: string; file_count: number; total_bytes: number };
}

export const getStorageUsage = async (): Promise<StorageUsage> => {
  const response = await api.get('/admin/storage');
  return response.data;
};

export const getGoogleAuthUrl = (): string => {
  return `${API_BASE_URL}/auth/google`;
};

export const getAuthProviders = async (): Promise<{ local: boolean; google: boolean }> => {
  const response = await api.get('/auth/providers');
  return response.data;
};

export const getCompanies = async (): Promise<Company[]> => {
  const response = await api.get('/companies');
  return response.data;
};

export const getCompany = async (id: number): Promise<Company> => {
  const response = await api.get(`/companies/${id}`);
  return response.data;
};

export const updateCompany = async (
  id: number, 
  data: Partial<Company>, 
  logo?: File
): Promise<Company> => {
  const formData = new FormData();
  
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    formData.append(key, value.toString());
  });

  if (logo) {
    formData.append('logo', logo);
  }

  const response = await api.put(`/companies/${id}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const createCompany = async (companyName: string): Promise<Company> => {
  const response = await api.post('/companies', { name: companyName });
  return response.data;
};

export const deleteCompany = async (id: number): Promise<void> => {
  await api.delete(`/companies/${id}`);
};

export const getNextQuoteNumber = async (companyId: number): Promise<{ quoteNumber: string }> => {
  const response = await api.get(`/companies/${companyId}/next-quote-number`);
  return response.data;
};

export const getQuotations = async (companyId?: number): Promise<Quotation[]> => {
  const params = companyId ? { company_id: companyId } : {};
  const response = await api.get('/quotations', { params });
  return response.data;
};

export const getQuotation = async (id: number): Promise<Quotation> => {
  const response = await api.get(`/quotations/${id}`);
  return response.data;
};

export const createQuotation = async (quotation: Omit<Quotation, 'id'>): Promise<Quotation> => {
  const response = await api.post('/quotations', quotation);
  return response.data;
};

export const updateQuotation = async (
  id: number, 
  quotation: Partial<Quotation>
): Promise<Quotation> => {
  const response = await api.put(`/quotations/${id}`, quotation);
  return response.data;
};

export const deleteQuotation = async (id: number): Promise<void> => {
  await api.delete(`/quotations/${id}`);
};

// Invoice API functions
export const getNextInvoiceNumber = async (companyId: number): Promise<{ invoiceNumber: string }> => {
  const response = await api.get(`/companies/${companyId}/next-invoice-number`);
  return response.data;
};

export const getInvoices = async (companyId?: number): Promise<Invoice[]> => {
  const params = companyId ? { company_id: companyId } : {};
  const response = await api.get('/invoices', { params });
  return response.data;
};

export const getInvoice = async (id: number): Promise<Invoice> => {
  const response = await api.get(`/invoices/${id}`);
  return response.data;
};

export const createInvoice = async (invoice: Omit<Invoice, 'id'>): Promise<Invoice> => {
  const response = await api.post('/invoices', invoice);
  return response.data;
};

export const createInvoiceFromQuotation = async (quotationId: number): Promise<Invoice> => {
  const response = await api.post(`/invoices/from-quotation/${quotationId}`);
  return response.data;
};

export const updateInvoice = async (
  id: number,
  invoice: Partial<Invoice>
): Promise<Invoice> => {
  const response = await api.put(`/invoices/${id}`, invoice);
  return response.data;
};

export const deleteInvoice = async (id: number): Promise<void> => {
  await api.delete(`/invoices/${id}`);
};

// Delivery Note API
export const getNextDeliveryNoteNumber = async (companyId: number): Promise<{ deliveryNoteNumber: string }> => {
  const response = await api.get(`/companies/${companyId}/next-delivery-note-number`);
  return response.data;
};

export const getDeliveryNotes = async (companyId?: number): Promise<DeliveryNote[]> => {
  const params = companyId ? { company_id: companyId } : {};
  const response = await api.get('/delivery-notes', { params });
  return response.data;
};

export const getDeliveryNote = async (id: number): Promise<DeliveryNote> => {
  const response = await api.get(`/delivery-notes/${id}`);
  return response.data;
};

export const createDeliveryNoteFromQuotation = async (quotationId: number): Promise<DeliveryNote> => {
  const response = await api.post(`/delivery-notes/from-quotation/${quotationId}`);
  return response.data;
};

export const deleteDeliveryNote = async (id: number): Promise<void> => {
  await api.delete(`/delivery-notes/${id}`);
};

export const uploadSignedDeliveryNote = async (id: number, file: File): Promise<DeliveryNote> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/delivery-notes/${id}/signed`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const deleteSignedDeliveryNote = async (id: number): Promise<void> => {
  await api.delete(`/delivery-notes/${id}/signed`);
};