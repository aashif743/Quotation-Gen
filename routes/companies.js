const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { getCompanyPrefix } = require('../utils/quotePrefix');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(isAuthenticated);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Companies are shared organization-wide, so every authenticated user sees
// the full list. Creating, editing, and deleting are admin-only.
router.get('/', async (req, res) => {
  try {
    const [companies] = await db.execute('SELECT * FROM companies ORDER BY name');
    res.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

router.post('/', isAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const [result] = await db.execute(
      'INSERT INTO companies (name, user_id) VALUES (?, ?)',
      [name, userId]
    );

    const [newCompany] = await db.execute('SELECT * FROM companies WHERE id = ?', [result.insertId]);
    res.status(201).json(newCompany[0]);
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [companies] = await db.execute('SELECT * FROM companies WHERE id = ?', [req.params.id]);
    
    if (companies.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    res.json(companies[0]);
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

router.put('/:id', isAdmin, upload.single('logo'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      address,
      tpin,
      bank_details,
      vat_rate,
      ppda_rate,
      primary_color,
      secondary_color,
      template
    } = req.body;

    let updateQuery = `
      UPDATE companies
      SET name = ?, address = ?, tpin = ?, bank_details = ?,
          vat_rate = ?, ppda_rate = ?, primary_color = ?, secondary_color = ?,
          template = ?
    `;
    let queryParams = [name, address, tpin, bank_details, vat_rate, ppda_rate, primary_color, secondary_color, template || 'classic'];

    if (req.file) {
      updateQuery += ', logo_url = ?';
      queryParams.push(`/uploads/${req.file.filename}`);
    }

    updateQuery += ' WHERE id = ?';
    queryParams.push(id);

    const [result] = await db.execute(updateQuery, queryParams);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const [updatedCompany] = await db.execute('SELECT * FROM companies WHERE id = ?', [id]);
    res.json(updatedCompany[0]);
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.execute('DELETE FROM companies WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.status(204).send(); // 204 No Content
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

// Returns the next quotation number for a company. We base the next number
// on the highest numeric suffix already in use for that prefix (not on a row
// count) so that if a user manually enters e.g. `EH-0050`, the next quotation
// auto-generates as `EH-0051`.
router.get('/:id/next-quote-number', async (req, res) => {
  try {
    const { id } = req.params;
    const [company] = await db.execute('SELECT name FROM companies WHERE id = ?', [id]);

    if (company.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const prefix = getCompanyPrefix(company[0].name);
    const [result] = await db.execute(
      `SELECT MAX(CAST(SUBSTRING_INDEX(quote_number, '-', -1) AS UNSIGNED)) AS max_num
         FROM quotations
        WHERE company_id = ? AND quote_number LIKE ?`,
      [id, `${prefix}-%`]
    );

    const nextNumber = (result[0].max_num || 0) + 1;
    const quoteNumber = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

    res.json({ quoteNumber });
  } catch (error) {
    console.error('Error generating quote number:', error);
    res.status(500).json({ error: 'Failed to generate quote number' });
  }
});

router.get('/:id/next-invoice-number', async (req, res) => {
  try {
    const { id } = req.params;
    const [company] = await db.execute('SELECT name FROM companies WHERE id = ?', [id]);

    if (company.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const prefix = `${getCompanyPrefix(company[0].name)}-INV`;
    const [result] = await db.execute(
      `SELECT MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) AS max_num
         FROM invoices
        WHERE company_id = ? AND invoice_number LIKE ?`,
      [id, `${prefix}-%`]
    );

    const nextNumber = (result[0].max_num || 0) + 1;
    const invoiceNumber = `${prefix}-${String(nextNumber).padStart(4, '0')}`;

    res.json({ invoiceNumber });
  } catch (error) {
    console.error('Error generating invoice number:', error);
    res.status(500).json({ error: 'Failed to generate invoice number' });
  }
});

module.exports = router;