const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Every route here requires an authenticated admin.
router.use(isAuthenticated, isAdmin);

const VALID_ROLES = ['staff', 'admin'];

// GET /api/users - list all users with how many quotations each has created
router.get('/', async (req, res) => {
  try {
    const [users] = await db.execute(`
      SELECT u.id, u.name, u.email, u.role, u.created_at,
             (SELECT COUNT(*) FROM quotations q WHERE q.created_by = u.id) AS quotation_count,
             (SELECT COUNT(*) FROM invoices i WHERE i.created_by = u.id) AS invoice_count
      FROM users u
      ORDER BY u.created_at DESC
    `);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users - create a new staff or admin account
router.post('/', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }
    const userRole = VALID_ROLES.includes(role) ? role : 'staff';

    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, userRole]
    );

    const [newUser] = await db.execute(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(newUser[0]);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id - update name, role, and optionally reset the password
router.put('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { name, email, role, password } = req.body;

    const [rows] = await db.execute('SELECT id, role FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    const target = rows[0];

    // Guard against removing the final admin (including demoting yourself).
    if (target.role === 'admin' && role && role !== 'admin') {
      const [admins] = await db.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
      if (admins[0].count <= 1) {
        return res.status(400).json({ message: 'You cannot remove the last remaining admin.' });
      }
    }

    if (email) {
      const [dupe] = await db.execute('SELECT id FROM users WHERE email = ? AND id <> ?', [email, userId]);
      if (dupe.length > 0) {
        return res.status(409).json({ message: 'Another account already uses this email.' });
      }
    }

    const fields = [];
    const values = [];
    if (name) { fields.push('name = ?'); values.push(name); }
    if (email) { fields.push('email = ?'); values.push(email); }
    if (role && VALID_ROLES.includes(role)) { fields.push('role = ?'); values.push(role); }
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
      }
      const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));
      fields.push('password = ?');
      values.push(hashed);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No changes provided.' });
    }

    values.push(userId);
    await db.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    const [updated] = await db.execute(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [userId]
    );
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id - remove a user
router.delete('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    if (userId === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account.' });
    }

    const [rows] = await db.execute('SELECT role FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (rows[0].role === 'admin') {
      const [admins] = await db.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
      if (admins[0].count <= 1) {
        return res.status(400).json({ message: 'You cannot delete the last remaining admin.' });
      }
    }

    await db.execute('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
