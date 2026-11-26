const db = require('../config/database');

// Shared AI service (Claude, Anthropic API). Every AI feature goes through
// runAi(), which:
//   1. checks AI is set up (ANTHROPIC_API_KEY), switched on for the caller's
//      organization, and that the organization is within its monthly limit;
//   2. picks the model for the job ('fast' for small tasks, 'smart' for
//      writing), calls the API (retrying when Claude is busy) and returns the
//      text or the structured result of a tool;
//   3. logs the request in ai_usage (feature, tokens, estimated cost) — also
//      when it fails, so the platform owner can see problems.
//
// Server settings (Hostinger → Environment variables):
//   ANTHROPIC_API_KEY          required to switch AI on
//   AI_MODEL_FAST / AI_MODEL_SMART   override the models
//   AI_DEFAULT_MONTHLY_LIMIT   requests per organization per month (500)
//   AI_PRICE_FAST_IN / _OUT, AI_PRICE_SMART_IN / _OUT
//                              USD per million tokens, for the cost estimate

const API_URL = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 90_000;
const USER_HOURLY_LIMIT = 60;

const MODELS = {
  fast: () => (process.env.AI_MODEL_FAST || 'claude-haiku-5-5').trim(),
  smart: () => (process.env.AI_MODEL_SMART || 'claude-sonnet-5-5').trim(),
};
// Estimated prices (USD per million tokens); adjust in the environment if
// Anthropic's prices differ. Only used for the usage report.
const PRICES = {
  fast: () => [Number(process.env.AI_PRICE_FAST_IN) || 1, Number(process.env.AI_PRICE_FAST_OUT) || 5],
  smart: () => [Number(process.env.AI_PRICE_SMART_IN) || 3, Number(process.env.AI_PRICE_SMART_OUT) || 15],
};

const defaultMonthlyLimit = () => Math.max(0, Number(process.env.AI_DEFAULT_MONTHLY_LIMIT) || 500);
const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());

class AiError extends Error {
  /** `code`: not_configured | disabled | limit | rate | no_credit | bad_key | busy | failed | bad_request */
  constructor(message, status = 502, code = 'failed') { super(message); this.status = status; this.code = code; }
}

const recentByUser = new Map(); // user id → request timestamps (last hour)

/** The caller's organization AI settings and this month's usage. */
async function orgAiState(orgId) {
  if (!orgId) return { enabled: false, limit: 0, used: 0 };
  const [[org]] = await db.execute('SELECT ai_enabled, ai_monthly_limit FROM organizations WHERE id = ?', [orgId]);
  const [[u]] = await db.execute(
    `SELECT COUNT(*) AS n FROM ai_usage
      WHERE organization_id = ? AND status = 'ok'
        AND created_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')`,
    [orgId]
  );
  return {
    enabled: !!(org && Number(org.ai_enabled) === 1),
    limit: org && org.ai_monthly_limit != null ? Number(org.ai_monthly_limit) : defaultMonthlyLimit(),
    used: Number(u.n) || 0,
  };
}

/** What the app shows: is AI available to this user right now? */
async function aiStatus(user) {
  const configured = aiConfigured();
  const state = await orgAiState(user && user.organization_id);
  const demo = !!(user && user.org_is_demo && !user.is_super_admin);
  return {
    configured,
    enabled: state.enabled,
    available: configured && state.enabled && !demo && state.used < state.limit,
    used_this_month: state.used,
    monthly_limit: state.limit,
    reason: !configured ? 'not_configured' : demo ? 'demo' : !state.enabled ? 'disabled' : state.used >= state.limit ? 'limit' : null,
  };
}

async function logUsage(row) {
  try {
    await db.execute(
      `INSERT INTO ai_usage (organization_id, company_id, user_id, feature, model, input_tokens, output_tokens, cost_usd, status, error, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.organization_id ?? null, row.company_id ?? null, row.user_id ?? null, String(row.feature).slice(0, 50), row.model || null,
        row.input_tokens || 0, row.output_tokens || 0, row.cost_usd || 0, row.status || 'ok',
        row.error ? String(row.error).slice(0, 255) : null, row.duration_ms ?? null]
    );
  } catch (e) {
    console.error('Could not log AI usage:', e.message);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One API call, retried twice when Claude is overloaded or rate-limited. */
async function callApi(body) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1500 * attempt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY.trim(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      clearTimeout(timer);
      if (attempt < 2) continue;
      throw new AiError(e.name === 'AbortError' ? 'The AI took too long to answer. Please try again.' : 'Could not reach the AI service. Please try again.', 502, 'busy');
    }
    clearTimeout(timer);
    const data = await res.json().catch(() => null);
    if (res.ok) return data;
    lastStatus = res.status;
    const msg = (data && data.error && data.error.message) || '';
    if (res.status === 401 || res.status === 403) throw new AiError('The AI key is not valid. Ask the system administrator to check it.', 503, 'bad_key');
    if (/credit balance|billing|purchase credits/i.test(msg)) {
      throw new AiError('The AI credit has run out. Ask the system administrator to top it up.', 503, 'no_credit');
    }
    if ([429, 500, 502, 503, 529].includes(res.status) && attempt < 2) continue;
    console.error('AI API error:', res.status, msg);
    if (res.status === 429 || res.status === 529) throw new AiError('The AI is busy right now. Please wait a moment and try again.', 429, 'busy');
    if (res.status === 400) throw new AiError('The AI could not handle this request.', 502, 'bad_request');
    break;
  }
  throw new AiError('The AI could not complete this. Please try again.', 502, lastStatus === 429 ? 'busy' : 'failed');
}

/**
 * Run one AI task for a signed-in user.
 *   req       the Express request (user, organization)
 *   feature   short name for the usage log, e.g. 'letter_draft'
 *   tier      'fast' | 'smart'
 *   system    system prompt
 *   content   the user message: a string, or content blocks (text / images)
 *   tool      optional { name, description, input_schema } — the answer is
 *             then that tool's input (structured), otherwise plain text
 *   maxTokens default 1500
 *   companyId for the usage log
 * Returns { result, usage }.
 */
async function runAi({ req, feature, tier = 'fast', system, content, tool, maxTokens = 1500, companyId = null }) {
  const user = req.user || {};
  const status = await aiStatus(user);
  if (!status.configured) throw new AiError('AI is not switched on for this system yet.', 503, 'not_configured');
  if (status.reason === 'demo') throw new AiError('AI is not available in the demo.', 403, 'disabled');
  if (!status.enabled) throw new AiError('AI is switched off for your organization.', 403, 'disabled');
  if (status.used_this_month >= status.monthly_limit) {
    throw new AiError(`Your organization has used all ${status.monthly_limit} AI requests for this month.`, 429, 'limit');
  }
  const now = Date.now();
  const times = (recentByUser.get(user.id) || []).filter((t) => now - t < 3600_000);
  if (times.length >= USER_HOURLY_LIMIT) throw new AiError('You have used AI many times in the last hour. Please try again a little later.', 429, 'rate');
  times.push(now);
  recentByUser.set(user.id, times);

  const model = (MODELS[tier] || MODELS.fast)();
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content }],
    ...(tool ? { tools: [tool], tool_choice: { type: 'tool', name: tool.name } } : {}),
  };
  const base = { organization_id: user.organization_id, company_id: companyId, user_id: user.id, feature, model };
  const started = Date.now();
  let data;
  try {
    data = await callApi(body);
  } catch (e) {
    await logUsage({ ...base, status: 'error', error: e.code || e.message, duration_ms: Date.now() - started });
    throw e;
  }
  const usage = data.usage || {};
  const [pin, pout] = (PRICES[tier] || PRICES.fast)();
  const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const outTok = usage.output_tokens || 0;
  await logUsage({
    ...base, input_tokens: inTok, output_tokens: outTok,
    cost_usd: (inTok * pin + outTok * pout) / 1e6, status: 'ok', duration_ms: Date.now() - started,
  });

  let result;
  if (tool) {
    const block = (data.content || []).find((b) => b.type === 'tool_use' && b.name === tool.name);
    result = block ? block.input : null;
  } else {
    result = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  }
  if (!result || (typeof result === 'string' && !result)) throw new AiError('The AI returned an empty answer. Please try again.', 502, 'failed');
  return { result, usage: { input_tokens: inTok, output_tokens: outTok } };
}

/** Express helper: send an AiError as JSON (or rethrow anything else). */
function sendAiError(res, error) {
  if (error instanceof AiError) return res.status(error.status).json({ error: error.message, code: error.code });
  return null;
}

module.exports = { runAi, aiStatus, aiConfigured, orgAiState, AiError, sendAiError, defaultMonthlyLimit, MODELS };
