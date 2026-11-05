import { api } from './api';

export type ServicePricing = 'unit' | 'sqm';

export interface CatalogService {
  id: number;
  company_id: number;
  name: string;
  pricing: ServicePricing;
  price: number;
  notes?: string | null;
  created_by_name?: string | null;
  updated_at?: string;
}

export const getServices = async (companyId: number): Promise<CatalogService[]> =>
  (await api.get('/services', { params: { company_id: companyId } })).data;

export const createService = async (data: { company_id: number; name: string; pricing: ServicePricing; price: number; notes?: string }): Promise<CatalogService> =>
  (await api.post('/services', data)).data;

export const updateService = async (id: number, data: { name: string; pricing: ServicePricing; price: number; notes?: string | null }): Promise<CatalogService> =>
  (await api.put(`/services/${id}`, data)).data;

export const deleteService = async (id: number): Promise<void> => {
  await api.delete(`/services/${id}`);
};
