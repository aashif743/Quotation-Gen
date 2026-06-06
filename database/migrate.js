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

async function tableExists(table) {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS count
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [DB_NAME, table]
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

  // 3c2. companies.default_terms_conditions — terms now live per company so
  //     they don't have to be re-typed on every quotation.
  if (!(await columnExists('companies', 'default_terms_conditions'))) {
    console.log('  • Adding `default_terms_conditions` column to companies...');
    await db.query('ALTER TABLE `companies` ADD COLUMN `default_terms_conditions` TEXT NULL');
  } else {
    console.log('  • companies.default_terms_conditions already present, skipping.');
  }

  // 3d. delivery_notes + delivery_note_items (new feature: 2026-06-04)
  if (!(await tableExists('delivery_notes'))) {
    console.log('  • Creating `delivery_notes` table...');
    await db.query(`
      CREATE TABLE \`delivery_notes\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`created_by\` INT,
        \`quotation_id\` INT,
        \`delivery_note_number\` VARCHAR(50) NOT NULL,
        \`client_name\` VARCHAR(255) NOT NULL,
        \`client_address\` TEXT,
        \`client_email\` VARCHAR(255),
        \`client_phone\` VARCHAR(50),
        \`date\` DATE NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`quotation_id\`) REFERENCES \`quotations\`(\`id\`) ON DELETE SET NULL,
        UNIQUE KEY \`unique_delivery_per_company\` (\`company_id\`, \`delivery_note_number\`)
      ) ENGINE=InnoDB
    `);
  } else {
    console.log('  • delivery_notes already present, skipping.');
  }
  if (!(await tableExists('delivery_note_items'))) {
    console.log('  • Creating `delivery_note_items` table...');
    await db.query(`
      CREATE TABLE \`delivery_note_items\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`delivery_note_id\` INT NOT NULL,
        \`description\` TEXT NOT NULL,
        \`quantity\` DECIMAL(10,2) NOT NULL,
        \`sort_order\` INT DEFAULT 0,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (\`delivery_note_id\`) REFERENCES \`delivery_notes\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  } else {
    console.log('  • delivery_note_items already present, skipping.');
  }

  // 3e. delivery_notes: signed-copy columns (uploaded photo/PDF of the
  //     paper-signed delivery note).
  if (await tableExists('delivery_notes')) {
    if (!(await columnExists('delivery_notes', 'signed_file_url'))) {
      console.log('  • Adding signed-copy columns to delivery_notes...');
      await db.query('ALTER TABLE `delivery_notes` ADD COLUMN `signed_file_url` VARCHAR(255) NULL');
      await db.query('ALTER TABLE `delivery_notes` ADD COLUMN `signed_at` TIMESTAMP NULL');
      await db.query('ALTER TABLE `delivery_notes` ADD COLUMN `signed_by` INT NULL');
      try {
        await db.query(
          'ALTER TABLE `delivery_notes` ADD CONSTRAINT `fk_delivery_notes_signed_by` ' +
            'FOREIGN KEY (`signed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL'
        );
        console.log('  • Added FK delivery_notes.signed_by → users.id');
      } catch (err) {
        console.warn('  ⚠️  Could not add FK on delivery_notes.signed_by:', err.message);
      }
    } else {
      console.log('  • delivery_notes signed columns already present, skipping.');
    }
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
