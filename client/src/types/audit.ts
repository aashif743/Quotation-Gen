export type AuditAction =
  | 'login' | 'logout' | 'login_failed'
  | 'create' | 'update' | 'delete' | 'remove' | 'status' | 'action';

export interface AuditLog {
  id: number;
  organization_id: number | null;
  organization_name?: string | null;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  acting_super_admin: boolean;
  action: AuditAction;
  entity_type: string | null;
  entity_id: number | null;
  entity_label: string | null;
  company_id: number | null;
  company_name?: string | null;
  summary: string | null;
  /** { changes: {field: [old, new]} } for edits, { deleted: {...} } for deletes, the submitted fields for creates. */
  details: Record<string, any> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditUser {
  id: number;
  name: string;
  email: string;
  role: string;
  organization_name?: string | null;
  last_login_at: string | null;
  last_seen_at: string | null;
  online: boolean;
  changes_today: number;
  failed_7d: number;
}

export interface AuditStats {
  logins_today: number;
  failed_today: number;
  changes_today: number;
  deletions_today: number;
  online_now: number;
}

export interface AuditFilters {
  user_id?: number | '';
  kind?: 'auth' | 'changes' | '';
  action?: string;
  entity_type?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  limit?: number;
}
