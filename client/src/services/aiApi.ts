import { api } from './api';

export type AiUnavailableReason = 'not_configured' | 'disabled' | 'limit' | 'demo' | null;

export interface AiStatus {
  /** The server has an AI key. */
  configured: boolean;
  /** AI is switched on for my organization. */
  enabled: boolean;
  /** I can use AI right now. */
  available: boolean;
  used_this_month: number;
  monthly_limit: number;
  reason: AiUnavailableReason;
}

export interface AiUsage {
  status: AiStatus;
  by_feature: { feature: string; name: string; requests: number }[];
  by_user: { user_id: number; name: string | null; requests: number }[];
  months: { month: string; requests: number }[];
}

export interface AiOrgRow {
  id: number;
  name: string;
  status: string;
  is_demo: number;
  ai_enabled: number;
  ai_monthly_limit: number | null;
  effective_limit: number;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | string;
  errors: number;
  last_used: string | null;
}

export interface AiOverview {
  configured: boolean;
  models: { fast: string; smart: string };
  default_monthly_limit: number;
  organizations: AiOrgRow[];
  months: { month: string; requests: number; cost_usd: number | string }[];
  features: { feature: string; name: string; requests: number; cost_usd: number | string }[];
  recent_errors: { created_at: string; feature: string; error: string; organization: string | null; user_name: string | null }[];
}

export const getAiStatus = async (): Promise<AiStatus> => (await api.get('/ai/status')).data;
export const getAiUsage = async (): Promise<AiUsage> => (await api.get('/ai/usage')).data;
export const getAiOverview = async (): Promise<AiOverview> => (await api.get('/ai/admin/overview')).data;
export const updateOrgAi = async (orgId: number, data: { ai_enabled?: boolean; ai_monthly_limit?: number | null }) =>
  (await api.put(`/ai/admin/organizations/${orgId}`, data)).data;
export const testAi = async (): Promise<{ ok: boolean; reply: string; ms: number; model: string }> =>
  (await api.post('/ai/admin/test')).data;

/** A short, user-facing explanation of why AI can't be used. */
export const aiUnavailableText = (s: AiStatus | null | undefined, isAdmin: boolean): string => {
  if (!s) return 'AI is not available right now.';
  switch (s.reason) {
    case 'not_configured':
      return isAdmin ? 'AI is not set up on the server yet (it needs the Anthropic API key).' : 'AI is not switched on yet.';
    case 'disabled':
      return 'AI is switched off for your organization. Contact Orbital IT Solutions to switch it on.';
    case 'limit':
      return `Your organization has used all ${s.monthly_limit} AI requests for this month. It starts again next month.`;
    case 'demo':
      return 'AI is not available in the demo.';
    default:
      return 'AI is not available right now.';
  }
};
