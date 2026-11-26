const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin, isSuperAdmin } = require('../middleware/auth');
const multer = require('multer');
const { aiStatus, aiConfigured, runAi, sendAiError, defaultMonthlyLimit, MODELS } = require('../utils/ai');
const { paymentReminder, scanReceipt } = require('../utils/aiTasks');
const { companyInOrg } = require('../utils/tenancy');

// The shared AI service: status for the app, usage for organization admins,
// and the platform owner's controls (per-organization on/off and monthly
// limits, usage and estimated cost across organizations, connection test).

const router = express.Router();
router.use(isAuthenticated);

const FEATURE_NAMES = {
  letter_draft: 'Letter writing',
  letter_improve: 'Letter improving',
  payment_reminder: 'Payment reminders',
  receipt_scan: 'Receipt scanning',
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
// AI tasks
// ---------------------------------------------------------------------------

// Expense categories offered to the receipt reader (plus the company's own).
const EXPENSE_CATEGORIES = [
  'Rent', 'Salaries', 'Transport', 'Fuel', 'Utilities', 'Office Supplies',
  'Marketing', 'Repairs & Maintenance', 'Bank Charges', 'Taxes & Licenses', 'Other',
];

/** "MK 1,234.50" (Malawi Kwacha) or "USD 1,234.50". */
const money = (n, currency) => {
  const code = String(currency || 'MWK').toUpperCase();
  const v = Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${code === 'MWK' ? 'MK' : code} ${v}`;
};
const longDate = (ymd) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

// POST /api/ai/payment-reminder — { invoice_id, channel, tone, language, include_bank, note }
router.post('/payment-reminder', async (req, res) => {
  try {
    const b = req.body || {};
    const [[inv]] = await db.execute(
      `SELECT i.id, i.company_id, i.created_by, i.invoice_number, i.client_name, i.grand_total, i.doc_type,
              DATE_FORMAT(i.date, '%Y-%m-%d') AS inv_date,
              IF(IFNULL(i.due_days, 0) > 0, DATE_FORMAT(DATE_ADD(i.date, INTERVAL i.due_days DAY), '%Y-%m-%d'), NULL) AS due_date,
              IF(IFNULL(i.due_days, 0) > 0, DATEDIFF(CURRENT_DATE, DATE_ADD(i.date, INTERVAL i.due_days DAY)), NULL) AS days_overdue,
              (SELECT IFNULL(SUM(p.amount), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid,
              c.name AS company_name, c.bank_details, c.currency, c.organization_id
         FROM invoices i JOIN companies c ON c.id = i.company_id
        WHERE i.id = ?`,
      [b.invoice_id || 0]
    );
    if (!inv || inv.organization_id !== req.user.organization_id) return res.status(404).json({ error: 'Invoice not found' });
    if (req.user.role !== 'admin' && inv.created_by !== req.user.id) return res.status(403).json({ error: 'You do not have access to this invoice' });
    const balance = Math.round((Number(inv.grand_total) - Number(inv.paid)) * 100) / 100;
    if (balance <= 0.004) return res.status(400).json({ error: 'This invoice is fully paid — there is nothing to remind about.' });

    const out = await paymentReminder(req, {
      company_id: inv.company_id,
      company_name: inv.company_name,
      client_name: inv.client_name,
      invoice_number: inv.invoice_number,
      invoice_date: longDate(inv.inv_date),
      due_date: inv.due_date ? longDate(inv.due_date) : '',
      days_overdue: inv.days_overdue == null ? null : Number(inv.days_overdue),
      total: money(inv.grand_total, inv.currency),
      paid: money(inv.paid, inv.currency),
      paid_amount: Number(inv.paid),
      balance: money(balance, inv.currency),
      bank_details: b.include_bank ? String(inv.bank_details || '').trim().slice(0, 600) : '',
      sender_name: req.user.name,
    }, { channel: b.channel, tone: b.tone, language: b.language, note: b.note });
    res.json(out);
  } catch (error) {
    if (sendAiError(res, error)) return;
    console.error('Payment reminder error:', error);
    res.status(500).json({ error: 'Could not write the reminder' });
  }
});

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) || file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Upload a photo (JPG or PNG) or a PDF of the receipt.'));
  },
}).single('file');

// POST /api/ai/scan-receipt?company_id=X — multipart "file" (photo or PDF).
router.post('/scan-receipt', (req, res) => {
  receiptUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large (max 8 MB).' : err.message });
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const companyId = req.query.company_id || (req.body && req.body.company_id);
      if (!companyId || !(await companyInOrg(companyId, req.user.organization_id))) return res.status(403).json({ error: 'That company is not in your organization.' });
      const [[co]] = await db.execute('SELECT currency FROM companies WHERE id = ?', [companyId]);
      const [cats] = await db.execute(
        "SELECT DISTINCT category FROM expenses WHERE company_id = ? AND category IS NOT NULL AND category <> '' LIMIT 50",
        [companyId]
      );
      const [vendors] = await db.execute('SELECT name FROM vendors WHERE company_id = ? ORDER BY name LIMIT 150', [companyId]);
      const d = new Date();
      const result = await scanReceipt(req, req.file, {
        company_id: Number(companyId),
        categories: Array.from(new Set([...EXPENSE_CATEGORIES, ...cats.map((c) => String(c.category).trim()).filter(Boolean)])),
        vendors: vendors.map((v) => v.name),
        currency: co && co.currency,
        today: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      });
      res.json(result);
    } catch (error) {
      if (sendAiError(res, error)) return;
      console.error('Receipt scan error:', error);
      res.status(500).json({ error: 'Could not read the receipt' });
    }
  });
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
