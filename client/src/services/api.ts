import axios from 'axios';
import { Company, Quotation, Invoice, DeliveryNote, User, AuthStatus, ManagedUser, UserRole, Client, ClientDocSummary, Payment } from '../types';

// Use a relative base so the same build works in development (proxied by CRA
// to the local Express server) and in production (served by the same Express
// process from the same origin). Override via REACT_APP_API_URL only if the
// API lives on a different host than the static frontend.
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Single source of truth for "the session is gone". A 401 from *any* API
// call (other than the auth endpoints themselves, where a 401 is just a
// login failure) means the server has lost our session — most commonly
// after 7 days of inactivity. Quietly send the user to the login screen
// with a friendly banner instead of letting `alert()` dialogs fire.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || '';
    const isAuthEndpoint = url.includes('/auth/');
    const alreadyOnLogin = window.location.pathname.startsWith('/login');

    if (status === 401 && !isAuthEndpoint && !alreadyOnLogin) {
      // Tell the login page why we're sending them there.
      try {
        sessionStorage.setItem('sessionExpired', '1');
      } catch {
        /* private mode, etc. */
      }
      window.location.assign('/login');
      // Hang the promise so the page that initiated the call doesn't get
      // a chance to show its own error alert — we're navigating away anyway.
      return new Promise(() => {});
    }

    return Promise.reject(error);
  }
);

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

export const updateDeliveryNote = async (
  id: number,
  data: Partial<DeliveryNote>
): Promise<DeliveryNote> => {
  const response = await api.put(`/delivery-notes/${id}`, data);
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

// Clients API
export const getClients = async (companyId?: number, q?: string): Promise<Client[]> => {
  const params: Record<string, any> = {};
  if (companyId) params.company_id = companyId;
  if (q) params.q = q;
  const response = await api.get('/clients', { params });
  return response.data;
};

export const getClient = async (id: number): Promise<Client> => {
  const response = await api.get(`/clients/${id}`);
  return response.data;
};

export const createClient = async (
  data: Omit<Partial<Client>, 'id'> & { company_id: number; name: string }
): Promise<Client> => {
  const response = await api.post('/clients', data);
  return response.data;
};

export const updateClient = async (id: number, data: Partial<Client>): Promise<Client> => {
  const response = await api.put(`/clients/${id}`, data);
  return response.data;
};

export const deleteClient = async (id: number): Promise<void> => {
  await api.delete(`/clients/${id}`);
};

export const getClientQuotations = async (id: number): Promise<ClientDocSummary[]> => {
  const response = await api.get(`/clients/${id}/quotations`);
  return response.data;
};

export const getClientInvoices = async (id: number): Promise<ClientDocSummary[]> => {
  const response = await api.get(`/clients/${id}/invoices`);
  return response.data;
};

export const getClientDeliveryNotes = async (id: number): Promise<ClientDocSummary[]> => {
  const response = await api.get(`/clients/${id}/delivery-notes`);
  return response.data;
};

// Client statement (payment tracking report for a date range)
export interface ClientStatement {
  client: {
    id: number;
    company_id: number;
    name: string;
    contact_person?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    tax_id?: string | null;
  } | null;
  period: { from: string; to: string };
  opening_balance: number;
  total_invoiced: number;
  total_paid: number;
  closing_balance: number;
  invoices: Array<{
    id: number;
    invoice_number: string;
    date: string;
    grand_total: number;
    amount_paid: number;
    balance_due: number;
    payment_status: 'pending' | 'partial' | 'paid';
  }>;
  payments: Array<{
    id: number;
    amount: number;
    payment_date: string;
    method?: string | null;
    reference?: string | null;
    notes?: string | null;
    invoice_id: number;
    invoice_number: string;
    recorded_by_name?: string | null;
  }>;
}

export const getClientStatement = async (
  id: number,
  from: string,
  to: string
): Promise<ClientStatement> => {
  const response = await api.get(`/clients/${id}/statement`, {
    params: { from, to },
  });
  return response.data;
};

// Payments API
export const getPaymentsForInvoice = async (invoiceId: number): Promise<Payment[]> => {
  const response = await api.get('/payments', { params: { invoice_id: invoiceId } });
  return response.data;
};

export const recordPayment = async (data: {
  invoice_id: number;
  amount: number;
  payment_date: string;
  method?: string;
  reference?: string;
  notes?: string;
}): Promise<Payment> => {
  const response = await api.post('/payments', data);
  return response.data;
};

export const updatePayment = async (id: number, data: Partial<Payment>): Promise<Payment> => {
  const response = await api.put(`/payments/${id}`, data);
  return response.data;
};

export const deletePayment = async (id: number): Promise<void> => {
  await api.delete(`/payments/${id}`);
};