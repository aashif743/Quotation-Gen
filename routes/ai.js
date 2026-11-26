const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin, isSuperAdmin } = require('../middleware/auth');
const { aiStatus, aiConfigured, runAi, sendAiError, defaultMonthlyLimit, MODELS } = require('../utils/ai');

// The shared AI service: status for the app, usage for organization admins,
// and the platform owner's controls (per-organization on/off and monthly
// limits, usage and estimated cost across organizations, connection test).

const router = express.Router();
router.use(isAuthenticated);

const FEATURE_NAMES = {
  letter_draft: 'Letter writing',
  letter_improve: 'Letter improving',
  test: 'Connection test',
};

const MONTH_START = "DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')";

// GET /api/ai/status — is AI available to me right now?
router.get('/status', async (req, res) => {
  try {
    res.json(await aiStatus(req.user));
  } catch (error) {
    console.error('AI status error:', error);
    res.status(500).json({ error: 'Could not check AI status' });
  }
});

// GET /api/ai/usage — my organization's AI use (admins).
router.get('/usage', isAdmin, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const [byFeature] = await db.execute(
      `SELECT feature, COUNT(*) AS requests FROM ai_usage
        WHERE organization_id = ? AND status = 'ok' AND created_at >= ${MONTH_START}
        GROUP BY feature ORDER BY requests DESC`,
      [orgId]
    );
    const [byUser] = await db.execute(
      `SELECT a.user_id, u.name, COUNT(*) AS requests FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.organization_id = ? AND a.status = 'ok' AND a.created_at >= ${MONTH_START}
        GROUP BY a.user_id, u.name ORDER BY requests DESC LIMIT 10`,
      [orgId]
    );
    const [months] = await db.execute(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS requests FROM ai_usage
        WHERE organization_id = ? AND status = 'ok' AND created_at >= DATE_SUB(${MONTH_START}, INTERVAL 5 MONTH)
        GROUP BY month ORDER BY month`,
      [orgId]
    );
    res.json({
      status: await aiStatus(req.user),
      by_feature: byFeature.map((f) => ({ ...f, name: FEATURE_NAMES[f.feature] || f.feature })),
      by_user: byUser,
      months,
    });
  } catch (error) {
    console.error('AI usage error:', error);
    res.status(500).json({ error: 'Could not load AI usage' });
  }
});

// ---------------------------------------------------------------------------
// Platform owner
// ---------------------------------------------------------------------------

// GET /api/ai/admin/overview — every organization's AI settings and use this month.
router.get('/admin/overview', isSuperAdmin, async (req, res) => {
  try {
    const [orgs] = await db.execute(
      `SELECT o.id, o.name, o.status, o.is_demo, o.ai_enabled, o.ai_monthly_limit,
              IFNULL(m.requests, 0) AS requests, IFNULL(m.input_tokens, 0) AS input_tokens,
              IFNULL(m.output_tokens, 0) AS output_tokens, IFNULL(m.cost_usd, 0) AS cost_usd,
              IFNULL(m.errors, 0) AS errors, m.last_used
         FROM organizations o
         LEFT JOIN (
           SELECT organization_id, SUM(status = 'ok') AS requests, SUM(input_tokens) AS input_tokens,
                  SUM(output_tokens) AS output_tokens, SUM(cost_usd) AS cost_usd,
                  SUM(status <> 'ok') AS errors, MAX(created_at) AS last_used
             FROM ai_usage WHERE created_at >= ${MONTH_START}
            GROUP BY organization_id
         ) m ON m.organization_id = o.id
        ORDER BY o.name`
    );
    const [months] = await db.execute(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, SUM(status = 'ok') AS requests, SUM(cost_usd) AS cost_usd
         FROM ai_usage WHERE created_at >= DATE_SUB(${MONTH_START}, INTERVAL 5 MONTH)
        GROUP BY month ORDER BY month`
    );
    const [features] = await db.execute(
      `SELECT feature, SUM(status = 'ok') AS requests, SUM(cost_usd) AS cost_usd
         FROM ai_usage WHERE created_at >= ${MONTH_START} GROUP BY feature ORDER BY requests DESC`
    );
    const [recentErrors] = await db.execute(
      `SELECT a.created_at, a.feature, a.error, o.name AS organization, u.name AS user_name
         FROM ai_usage a LEFT JOIN organizations o ON o.id = a.organization_id LEFT JOIN users u ON u.id = a.user_id
        WHERE a.status <> 'ok' ORDER BY a.id DESC LIMIT 10`
    );
    res.json({
      configured: aiConfigured(),
      models: { fast: MODELS.fast(), smart: MODELS.smart() },
      default_monthly_limit: defaultMonthlyLimit(),
      organizations: orgs.map((o) => ({ ...o, effective_limit: o.ai_monthly_limit != null ? Number(o.ai_monthly_limit) : defaultMonthlyLimit() })),
      months,
      features: features.map((f) => ({ ...f, name: FEATURE_NAMES[f.feature] || f.feature })),
      recent_errors: recentErrors,
    });
  } catch (error) {
    console.error('AI overview error:', error);
    res.status(500).json({ error: 'Could not load AI usage' });
  }
});

// PUT /api/ai/admin/organizations/:id — { ai_enabled?, ai_monthly_limit? (null = default) }
router.put('/admin/organizations/:id', isSuperAdmin, async (req, res) => {
  try {
    const fields = [];
    const values = [];
    const b = req.body || {};
    if (b.ai_enabled !== undefined) { fields.push('ai_enabled = ?'); values.push(b.ai_enabled ? 1 : 0); }
    if (b.ai_monthly_limit !== undefined) {
      const v = b.ai_monthly_limit;
      if (v === null || v === '') { fields.push('ai_monthly_limit = NULL'); } else {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 1000000) return res.status(400).json({ error: 'The monthly limit must be a whole number (0 or more).' });
        fields.push('ai_monthly_limit = ?'); values.push(n);
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'No changes provided.' });
    values.push(req.params.id);
    const [r] = await db.execute(`UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`, values);
    if (!r.affectedRows) return res.status(404).json({ error: 'Organization not found' });
    const [[o]] = await db.execute('SELECT id, name, ai_enabled, ai_monthly_limit FROM organizations WHERE id = ?', [req.params.id]);
    res.json(o);
  } catch (error) {
    console.error('AI settings error:', error);
    res.status(500).json({ error: 'Could not save the AI settings' });
  }
});

// POST /api/ai/admin/test — a tiny request to check the key and credit.
router.post('/admin/test', isSuperAdmin, async (req, res) => {
  try {
    const started = Date.now();
    const { result } = await runAi({
      req, feature: 'test', tier: 'fast', maxTokens: 20,
      system: 'Reply with exactly: OK', content: 'Connection test.',
    });
    res.json({ ok: true, reply: String(result).slice(0, 50), ms: Date.now() - started, model: MODELS.fast() });
  } catch (error) {
    if (sendAiError(res, error)) return;
    console.error('AI test error:', error);
    res.status(500).json({ error: 'The test failed.' });
  }
});

module.exports = router;
