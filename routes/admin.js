const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(isAuthenticated, isAdmin);

// GET /api/admin/storage - per-table DB sizes + uploads folder usage
router.get('/storage', async (req, res) => {
  try {
    const DB = process.env.DB_NAME;

    const [rawTables] = await db.execute(
      `SELECT TABLE_NAME AS name,
              TABLE_ROWS AS row_count,
              DATA_LENGTH AS data_bytes,
              INDEX_LENGTH AS index_bytes,
              (DATA_LENGTH + INDEX_LENGTH) AS size_bytes
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC`,
      [DB]
    );
    const tables = rawTables.map((t) => ({
      name: t.name,
      row_count: Number(t.row_count || 0),
      data_bytes: Number(t.data_bytes || 0),
      index_bytes: Number(t.index_bytes || 0),
      size_bytes: Number(t.size_bytes || 0),
    }));
    const total_bytes = tables.reduce((s, r) => s + r.size_bytes, 0);

    // Walk the uploads folder for any admin-uploaded logos
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const uploads = { directory: 'uploads', file_count: 0, total_bytes: 0 };
    try {
      const entries = await fs.readdir(uploadsDir);
      for (const entry of entries) {
        try {
          const stat = await fs.stat(path.join(uploadsDir, entry));
          if (stat.isFile()) {
            uploads.file_count++;
            uploads.total_bytes += stat.size;
          }
        } catch {
          /* ignore unreadable entry */
        }
      }
    } catch {
      /* uploads dir may not exist yet — leave zeros */
    }

    res.json({
      database: { name: DB, tables, total_bytes },
      uploads,
    });
  } catch (error) {
    console.error('Error fetching storage usage:', error);
    res.status(500).json({ error: 'Failed to fetch storage usage' });
  }
});

module.exports = router;
