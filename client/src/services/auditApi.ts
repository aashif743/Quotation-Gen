import { api } from './api';
import { AuditFilters, AuditLog, AuditStats, AuditUser } from '../types/audit';

const clean = (f: AuditFilters) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const getAuditLogs = async (filters: AuditFilters): Promise<{ rows: AuditLog[]; total: number; page: number; limit: number }> =>
  (await api.get('/audit-logs', { params: clean(filters) })).data;

export const getAuditUsers = async (): Promise<AuditUser[]> => (await api.get('/audit-logs/users')).data;

export const getAuditStats = async (): Promise<AuditStats> => (await api.get('/audit-logs/stats')).data;
