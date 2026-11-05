const express = require('express');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { requireCompanyAccess, companyTableParamGuard } = require('../utils/tenancy');

// Per-company list of services and their prices, picked from when filling in
// a job card. Everyone in the company can see and add services (new ones are
// also added automatically when a job card is saved); changing or removing a
// price is for admins.
const router = express.Router();
router.use(isAuthenticated);
router.use(requireCompanyAccess);
router.param('id', companyTableParamGuard('service_catalog'));

const PRICING = new Set(['unit', 'sqm']);
const clean = (b) => ({
  name: String(b.name || '').trim().slice(0, 255),
  pricing: PRICING.has(b.pricing) ? b.pricing : 'unit',
  price: Math.max(0, Math.round((Number(b.price) || 0) * 100) / 100),
  notes: b.notes != null ? String(b.notes).trim().slice(0, 255) || null : null,
});

// GET /api/services?company_id=
router.get('/', async (req, res) => {
  try {
    const companyId = Number(req.query.company_id);
    if (!companyId) return res.status(400).json({ message: 'company_id is required.' });
    const [rows] = await db.execute(
      `SELECT s.id, s.company_id, s.name, s.pricing, s.price, s.notes, s.created_at, s.updated_at, u.name AS created_by_name
         FROM service_catalog s LEFT JOIN users u ON u.id = s.created_by
        WHERE s.company_id = ? ORDER BY s.name`,
      [companyId]
    );
    res.json(rows.map((r) => ({ ...r, price: Number(r.price) })));
  } catch (e) {
    console.error('Error listing services:', e);
    res.status(500).json({ error: 'Failed to load services' });
  }
});

// POST /api/services { company_id, name, pricing, price, notes }
router.post('/', async (req, res) => {
  try {
    const companyId = Number(req.body.company_id);
    const s = clean(req.body);
    if (!companyId || !s.name) return res.status(400).json({ message: 'Company and service name are required.' });
    const [r] = await db.execute(
      'INSERT INTO service_catalog (company_id, name, pricing, price, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [companyId, s.name, s.pricing, s.price, s.notes, req.user.id]
    );
    const [[row]] = await db.execute('SELECT * FROM service_catalog WHERE id = ?', [r.insertId]);
    res.status(201).json({ ...row, price: Number(row.price) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A service with this name already exists.' });
    console.error('Error adding service:', e);
    res.status(500).json({ error: 'Failed to add service' });
  }
});

// PUT /api/services/:id (admin)
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const s = clean(req.body);
    if (!s.name) return res.status(400).json({ message: 'Service name is required.' });
    await db.execute(
      'UPDATE service_catalog SET name = ?, pricing = ?, price = ?, notes = ? WHERE id = ?',
      [s.name, s.pricing, s.price, s.notes, req.params.id]
    );
    const [[row]] = await db.execute('SELECT * FROM service_catalog WHERE id = ?', [req.params.id]);
    res.json({ ...row, price: Number(row.price) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A service with this name already exists.' });
    console.error('Error updating service:', e);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// DELETE /api/services/:id (admin)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const [r] = await db.execute('DELETE FROM service_catalog WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Service not found.' });
    res.json({ message: 'Service removed.' });
  } catch (e) {
    console.error('Error deleting service:', e);
    res.status(500).json({ error: 'Failed to remove service' });
  }
});

// Called when a job card is saved: any service on its items that isn't in the
// list yet is added with the price used on the card. Existing prices are left
// alone. Never fails the job card save.
async function rememberServices(companyId, items, userId) {
  try {
    for (const it of items || []) {
      const name = String(it.service || '').trim().slice(0, 255);
      if (!name) continue;
      const sqm = Number(it.rate_per_sqm) > 0;
      const price = Math.max(0, Math.round((sqm ? Number(it.rate_per_sqm) : Number(it.unit_price) || 0) * 100) / 100);
      await db.execute(
        `INSERT IGNORE INTO service_catalog (company_id, name, pricing, price, created_by) VALUES (?, ?, ?, ?, ?)`,
        [companyId, name, sqm ? 'sqm' : 'unit', price, userId || null]
      );
    }
  } catch (e) {
    console.error('Could not save new services:', e.message);
  }
}

module.exports = router;
module.exports.rememberServices = rememberServices;
