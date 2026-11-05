import { api } from './api';

export interface DeletedItem {
  id: number;
  company_id: number | null;
  company_name?: string | null;
  entity_type: string;
  type_name: string;
  entity_id: number;
  label?: string | null;
  summary?: string | null;
  deleted_by_name?: string | null;
  deleted_at: string;
  days_left: number;
}

export const getDeletedItems = async (params: { type?: string; q?: string } = {}): Promise<{ rows: DeletedItem[]; retention_days: number }> =>
  (await api.get('/recycle-bin', { params })).data;

export const restoreDeletedItem = async (id: number): Promise<{ message: string; id: number; entity_type: string }> =>
  (await api.post(`/recycle-bin/${id}/restore`)).data;

export const purgeDeletedItem = async (id: number): Promise<void> => {
  await api.delete(`/recycle-bin/${id}`);
};
