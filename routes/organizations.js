const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { isAuthenticated, isSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// Organization (tenant) management. Super-admin only — this is the platform
// owner's control panel for onboarding new customers.
router.use(isAuthenticated, isSuperAdmin);

// GET /api/organizations — list tenants with basic counts.
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT o.id, o.name, o.status, o.created_at,
             (SELECT COUNT(*) FROM users u     WHERE u.organization_id = o.id) AS user_count,
             (SELECT COUNT(*) FROM companies c WHERE c.organization_id = o.id) AS company_count
        FROM organizations o
       ORDER BY o.created_at DESC, o.id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// POST /api/organizations — create a new tenant AND its first org-admin.
router.post('/', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { name, admin_name, admin_email, admin_password } = req.body;
    if (!name || !name.trim()) {
      await connection.rollback();
      return res.status(400).json({ error: 'Organization name is required.' });
    }
    if (!admin_name || !admin_email || !admin_password) {
      await connection.rollback();
      return res.status(400).json({ error: 'Admin name, email and password are required.' });
    }
    if (String(admin_password).length < 6) {
      await connection.rollback();
      return res.status(400).json({ error: 'Admin password must be at least 6 characters.' });
    }

    // Email is globally unique (one account = one org).
    const [dupe] = await connection.execute('SELECT id FROM users WHERE email = ?', [admin_email]);
    if (dupe.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'An account with that admin email already exists.' });
    }

    const [orgRes] = await connection.execute('INSERT INTO organizations (name) VALUES (?)', [name.trim()]);
    const orgId = orgRes.insertId;

    const hashed = await bcrypt.hash(String(admin_password), await bcrypt.genSalt(10));
    await connection.execute(
      "INSERT INTO users (organization_id, name, email, password, role) VALUES (?, ?, ?, ?, 'admin')",
      [orgId, admin_name, admin_email, hashed]
    );

    await connection.commit();
    const [created] = await db.execute(
      `SELECT o.id, o.name, o.status, o.created_at,
              (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id) AS user_count,
              (SELECT COUNT(*) FROM companies c WHERE c.organization_id = o.id) AS company_count
         FROM organizations o WHERE o.id = ?`,
      [orgId]
    );
    res.status(201).json(created[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating organization:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  } finally {
    connection.release();
  }
});

// PUT /api/organizations/:id — rename or activate/suspend a tenant.
router.put('/:id', async (req, res) => {
  try {
    const { name, status } = req.body;
    const fields = [];
    const values = [];
    if (name != null && name.trim()) { fields.push('name = ?'); values.push(name.trim()); }
    if (status === 'active' || status === 'suspended') { fields.push('status = ?'); values.push(status); }
    if (fields.length === 0) return res.status(400).json({ error: 'No changes provided.' });
    values.push(req.params.id);
    const [result] = await db.execute(`UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Organization not found' });
    const [updated] = await db.execute('SELECT id, name, status, created_at FROM organizations WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

module.exports = router;
