/**
 * Non-destructive migration that upgrades an existing database to support
 * staff/admin roles and per-creator ownership of quotations and invoices.
 *
 * Safe to run multiple times — every step checks the current state first.
 *
 *   node database/migrate.js   (or: npm run migrate)
 */
const bcrypt = require('bcryptjs');
const db = require('../config/database');
require('dotenv').config();

const DB_NAME = process.env.DB_NAME;

async function columnExists(table, column) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_NAME, table, column]
  );
  return rows[0].count > 0;
}

async function foreignKeyExists(table, column) {
  const [rows] = await db.execute(
    `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [DB_NAME, table, column]
  );
  return rows.map((r) => r.CONSTRAINT_NAME);
}

async function migrate() {
  console.log('🔄 Starting migration...');

  // 1. users.role
  if (!(await columnExists('users', 'role'))) {
    console.log('  • Adding `role` column to users...');
    await db.query(
      "ALTER TABLE `users` ADD COLUMN `role` ENUM('staff','admin') NOT NULL DEFAULT 'staff'"
    );
  } else {
    console.log('  • users.role already present, skipping.');
  }

  // 2. quotations.created_by (+ FK)
  if (!(await columnExists('quotations', 'created_by'))) {
    console.log('  • Adding `created_by` column to quotations...');
    await db.query('ALTER TABLE `quotations` ADD COLUMN `created_by` INT NULL');
  } else {
    console.log('  • quotations.created_by already present, skipping.');
  }
  if ((await foreignKeyExists('quotations', 'created_by')).length === 0) {
    try {
      await db.query(
        'ALTER TABLE `quotations` ADD CONSTRAINT `fk_quotations_created_by` ' +
          'FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL'
      );
      console.log('  • Added FK quotations.created_by → users.id');
    } catch (err) {
      console.warn('  ⚠️  Could not add FK on quotations.created_by:', err.message);
    }
  }

  // 3. invoices.created_by (+ FK)
  if (!(await columnExists('invoices', 'created_by'))) {
    console.log('  • Adding `created_by` column to invoices...');
    await db.query('ALTER TABLE `invoices` ADD COLUMN `created_by` INT NULL');
  } else {
    console.log('  • invoices.created_by already present, skipping.');
  }
  if ((await foreignKeyExists('invoices', 'created_by')).length === 0) {
    try {
      await db.query(
        'ALTER TABLE `invoices` ADD CONSTRAINT `fk_invoices_created_by` ' +
          'FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL'
      );
      console.log('  • Added FK invoices.created_by → users.id');
    } catch (err) {
      console.warn('  ⚠️  Could not add FK on invoices.created_by:', err.message);
    }
  }

  // 3b. companies.template (per-company quotation design)
  if (!(await columnExists('companies', 'template'))) {
    console.log('  • Adding `template` column to companies...');
    await db.query("ALTER TABLE `companies` ADD COLUMN `template` VARCHAR(30) NOT NULL DEFAULT 'classic'");
  } else {
    console.log('  • companies.template already present, skipping.');
  }

  // 3c. companies.quote_logo_url — fixed bundled logo used on quotation PDFs,
  //     separate from `logo_url` which is the uploaded thumbnail (sidebar/header).
  if (!(await columnExists('companies', 'quote_logo_url'))) {
    console.log('  • Adding `quote_logo_url` column to companies...');
    await db.query('ALTER TABLE `companies` ADD COLUMN `quote_logo_url` VARCHAR(255) NULL AFTER `logo_url`');

    // Move any /Company_Logos/* paths from logo_url into the new column and
    // clear logo_url so admins can upload a separate thumbnail.
    const [moved] = await db.query(
      "UPDATE companies SET quote_logo_url = logo_url, logo_url = NULL " +
        "WHERE logo_url LIKE '/Company_Logos/%'"
    );
    console.log(`  • Moved ${moved.affectedRows} bundled logo path(s) into quote_logo_url.`);
  } else {
    console.log('  • companies.quote_logo_url already present, skipping.');
  }

  // 4. Backfill created_by from each row's company owner so existing records
  //    are attributed to the user who originally owned the company.
  const [qBackfill] = await db.query(
    `UPDATE quotations q
       JOIN companies c ON q.company_id = c.id
        SET q.created_by = c.user_id
      WHERE q.created_by IS NULL AND c.user_id IS NOT NULL`
  );
  console.log(`  • Backfilled created_by on ${qBackfill.affectedRows} quotation(s).`);

  const [iBackfill] = await db.query(
    `UPDATE invoices i
       JOIN companies c ON i.company_id = c.id
        SET i.created_by = c.user_id
      WHERE i.created_by IS NULL AND c.user_id IS NOT NULL`
  );
  console.log(`  • Backfilled created_by on ${iBackfill.affectedRows} invoice(s).`);

  // 5. Promote (or create) the admin account.
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.warn('  ⚠️  ADMIN_EMAIL not set — skipping admin promotion.');
  } else {
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [adminEmail]);
    if (existing.length > 0) {
      await db.execute("UPDATE users SET role = 'admin' WHERE email = ?", [adminEmail]);
      console.log(`  • Promoted existing account ${adminEmail} to admin.`);
    } else {
      const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
      const hashed = await bcrypt.hash(password, await bcrypt.genSalt(10));
      await db.execute(
        "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')",
        ['Administrator', adminEmail, hashed]
      );
      console.log(`  • Created admin account ${adminEmail}.`);
      console.log(`    ↳ Temporary password: ${password}  (change it after logging in)`);
    }
  }

  console.log('✅ Migration complete.');
}

migrate()
  .then(() => db.end())
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    db.end();
    process.exit(1);
  });
