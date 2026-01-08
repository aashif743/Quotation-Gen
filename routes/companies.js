const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');

const router = express.Router();

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

router.get('/', async (req, res) => {
  try {
    const [companies] = await db.execute('SELECT * FROM companies ORDER BY name');
    res.json(companies);
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
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

router.put('/:id', upload.single('logo'), async (req, res) => {
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
      secondary_color
    } = req.body;

    let updateQuery = `
      UPDATE companies 
      SET name = ?, address = ?, tpin = ?, bank_details = ?, 
          vat_rate = ?, ppda_rate = ?, primary_color = ?, secondary_color = ?
    `;
    let queryParams = [name, address, tpin, bank_details, vat_rate, ppda_rate, primary_color, secondary_color];

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

router.get('/:id/next-quote-number', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await db.execute(
      'SELECT COUNT(*) as count FROM quotations WHERE company_id = ?',
      [id]
    );
    
    const nextNumber = result[0].count + 1;
    const [company] = await db.execute('SELECT name FROM companies WHERE id = ?', [id]);
    
    if (company.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const prefix = company[0].name === 'Arkay Pak' ? 'AP' : 'EH';
    const quoteNumber = `${prefix}-${String(nextNumber).padStart(4, '0')}`;
    
    res.json({ quoteNumber });
  } catch (error) {
    console.error('Error generating quote number:', error);
    res.status(500).json({ error: 'Failed to generate quote number' });
  }
});

module.exports = router;