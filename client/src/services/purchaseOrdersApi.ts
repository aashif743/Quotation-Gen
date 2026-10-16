import { api } from './api';
import { PurchaseOrder, PurchaseOrderInput, PurchaseOrderStatus } from '../types/purchaseOrders';

// LPO (Local Purchase Order) API — mounted at /api/purchase-orders.

export const getPurchaseOrders = async (params: {
  company_id?: number;
  status?: string;
  vendor_id?: number;
  q?: string;
}): Promise<PurchaseOrder[]> => {
  const response = await api.get('/purchase-orders', { params });
  return response.data;
};

export const getNextLpoNumber = async (companyId: number): Promise<{ lpoNumber: string }> => {
  const response = await api.get('/purchase-orders/next-number', { params: { company_id: companyId } });
  return response.data;
};

export const getPurchaseOrder = async (id: number): Promise<PurchaseOrder> => {
  const response = await api.get(`/purchase-orders/${id}`);
  return response.data;
};

export const createPurchaseOrder = async (data: PurchaseOrderInput): Promise<{ id: number; lpo_number: string }> => {
  const response = await api.post('/purchase-orders', data);
  return response.data;
};

export const updatePurchaseOrder = async (
  id: number,
  data: PurchaseOrderInput
): Promise<{ id: number; lpo_number: string }> => {
  const response = await api.put(`/purchase-orders/${id}`, data);
  return response.data;
};

export const updatePurchaseOrderStatus = async (
  id: number,
  status: PurchaseOrderStatus
): Promise<{ id: number; status: PurchaseOrderStatus }> => {
  const response = await api.patch(`/purchase-orders/${id}/status`, { status });
  return response.data;
};

export const deletePurchaseOrder = async (id: number): Promise<void> => {
  await api.delete(`/purchase-orders/${id}`);
};

export const convertPurchaseOrder = async (
  id: number
): Promise<{ purchase_id: number; purchase_number: string }> => {
  const response = await api.post(`/purchase-orders/${id}/convert`);
  return response.data;
};

/** Job cards for the optional "for job card" link. Resolves to [] if the
 *  job cards module isn't available. */
export const getJobCardOptions = async (
  companyId: number
): Promise<{ id: number; job_card_number: string; client_name?: string }[]> => {
  try {
    const response = await api.get('/job-cards', { params: { company_id: companyId } });
    return Array.isArray(response.data) ? response.data : [];
  } catch {
    return [];
  }
};
