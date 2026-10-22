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

  // 1b. users.can_manage_attendance — a granular permission that lets a
  // specific (non-admin) staff member access the Attendance section, without
  // granting full admin rights. Admins always have access regardless.
  if (!(await columnExists('users', 'can_manage_attendance'))) {
    console.log('  • Adding `can_manage_attendance` column to users...');
    await db.query(
      'ALTER TABLE `users` ADD COLUMN `can_manage_attendance` TINYINT(1) NOT NULL DEFAULT 0'
    );
  } else {
    console.log('  • users.can_manage_attendance already present, skipping.');
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

  // 3h. payments table (added 2026-06-12) — records partial / full payments
  //     made against invoices. Payment status (pending/partial/paid) is
  //     computed on read by comparing SUM(payments.amount) to
  //     invoice.grand_total.
  if (!(await tableExists('payments'))) {
    console.log('  • Creating `payments` table...');
    await db.query(`
      CREATE TABLE \`payments\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`invoice_id\` INT NOT NULL,
        \`amount\` DECIMAL(15,2) NOT NULL,
        \`payment_date\` DATE NOT NULL,
        \`method\` VARCHAR(50),
        \`reference\` VARCHAR(100),
        \`notes\` TEXT,
        \`recorded_by\` INT,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`recorded_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        INDEX \`idx_payment_invoice\` (\`invoice_id\`),
        INDEX \`idx_payment_date\` (\`payment_date\`)
      ) ENGINE=InnoDB
    `);
  } else {
    console.log('  • payments already present, skipping.');
  }

  // 3g. clients.created_by (added 2026-06-12) — drives role-based scoping so
  //     staff only see clients they created or have documents for.
  if (await tableExists('clients') && !(await columnExists('clients', 'created_by'))) {
    console.log('  • Adding `created_by` column to clients...');
    await db.query('ALTER TABLE `clients` ADD COLUMN `created_by` INT NULL AFTER `company_id`');
    try {
      await db.query(
        'ALTER TABLE `clients` ADD CONSTRAINT `fk_clients_created_by` ' +
          'FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL'
      );
      console.log('  • Added FK clients.created_by → users.id');
    } catch (err) {
      console.warn('  ⚠️  Could not add FK on clients.created_by:', err.message);
    }
  }

  // 3f. clients table + client_id columns (per-company "real client" file)
  if (!(await tableExists('clients'))) {
    console.log('  • Creating `clients` table...');
    await db.query(`
      CREATE TABLE \`clients\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`contact_person\` VARCHAR(255),
        \`email\` VARCHAR(255),
        \`phone\` VARCHAR(50),
        \`address\` TEXT,
        \`tax_id\` VARCHAR(50),
        \`notes\` TEXT,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        UNIQUE KEY \`unique_client_per_company\` (\`company_id\`, \`name\`)
      ) ENGINE=InnoDB
    `);
  } else {
    console.log('  • clients already present, skipping.');
  }

  // Add client_id to documents that reference clients
  for (const tableName of ['quotations', 'invoices', 'delivery_notes']) {
    if (!(await columnExists(tableName, 'client_id'))) {
      console.log(`  • Adding \`client_id\` column to ${tableName}...`);
      await db.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`client_id\` INT NULL`);
      try {
        await db.query(
          `ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`fk_${tableName}_client_id\` ` +
          `FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE SET NULL`
        );
        console.log(`  • Added FK ${tableName}.client_id → clients.id`);
      } catch (err) {
        console.warn(`  ⚠️  Could not add FK on ${tableName}.client_id:`, err.message);
      }
    } else {
      console.log(`  • ${tableName}.client_id already present, skipping.`);
    }
  }

  // Backfill clients from existing documents. Group by (company_id, client_name)
  // so the same recurring customer gets a single client row. Skip rows that
  // already have client_id set so re-running is safe.
  console.log('  • Backfilling clients from existing documents...');
  const docTables = ['quotations', 'invoices', 'delivery_notes'];
  for (const docTable of docTables) {
    const [rows] = await db.query(`
      SELECT DISTINCT d.company_id, d.client_name,
             MIN(d.client_address) AS client_address,
             MIN(d.client_email)   AS client_email,
             MIN(d.client_phone)   AS client_phone
        FROM \`${docTable}\` d
       WHERE d.client_id IS NULL AND d.client_name IS NOT NULL AND d.client_name <> ''
       GROUP BY d.company_id, d.client_name
    `);
    let created = 0;
    let linked = 0;
    for (const r of rows) {
      // Get-or-create the client.
      const [existing] = await db.execute(
        'SELECT id FROM clients WHERE company_id = ? AND name = ?',
        [r.company_id, r.client_name]
      );
      let clientId;
      if (existing.length > 0) {
        clientId = existing[0].id;
      } else {
        const [ins] = await db.execute(
          'INSERT INTO clients (company_id, name, address, email, phone) VALUES (?, ?, ?, ?, ?)',
          [r.company_id, r.client_name, r.client_address || null, r.client_email || null, r.client_phone || null]
        );
        clientId = ins.insertId;
        created++;
      }
      const [upd] = await db.execute(
        `UPDATE \`${docTable}\` SET client_id = ? WHERE company_id = ? AND client_name = ? AND client_id IS NULL`,
        [clientId, r.company_id, r.client_name]
      );
      linked += upd.affectedRows;
    }
    console.log(`    ${docTable}: created ${created} client(s), linked ${linked} row(s)`);
  }

  // 3i. Vendors + purchases (buy side, added 2026-07). Suppliers the company
  //     buys from, the purchases (bills) recorded against them, their line
  //     items, and payments made OUT to vendors. Entirely additive — no
  //     existing table or row is altered.
  if (!(await tableExists('vendors'))) {
    console.log('  • Creating `vendors` table...');
    await db.query(`
      CREATE TABLE \`vendors\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`created_by\` INT,
        \`name\` VARCHAR(255) NOT NULL,
        \`contact_person\` VARCHAR(255),
        \`email\` VARCHAR(255),
        \`phone\` VARCHAR(50),
        \`address\` TEXT,
        \`tax_id\` VARCHAR(50),
        \`notes\` TEXT,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        UNIQUE KEY \`unique_vendor_per_company\` (\`company_id\`, \`name\`)
      ) ENGINE=InnoDB
    `);
  } else {
    console.log('  • vendors already present, skipping.');
  }

  if (!(await tableExists('purchases'))) {
    console.log('  • Creating `purchases` table...');
    await db.query(`
      CREATE TABLE \`purchases\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`created_by\` INT,
        \`vendor_id\` INT,
        \`purchase_number\` VARCHAR(50) NOT NULL,
        \`vendor_name\` VARCHAR(255) NOT NULL,
        \`vendor_address\` TEXT,
        \`vendor_email\` VARCHAR(255),
        \`vendor_phone\` VARCHAR(50),
        \`quotation_id\` INT,
        \`invoice_id\` INT,
        \`date\` DATE NOT NULL,
        \`subtotal\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`grand_total\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`notes\` TEXT,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`vendor_id\`) REFERENCES \`vendors\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`quotation_id\`) REFERENCES \`quotations\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\`(\`id\`) ON DELETE SET NULL,
        UNIQUE KEY \`unique_purchase_per_company\` (\`company_id\`, \`purchase_number\`)
      ) ENGINE=InnoDB
    `);
  } else {
    console.log('  • purchases already present, skipping.');
  }

  if (!(await tableExists('purchase_items'))) {
    console.log('  • Creating `purchase_items` table...');
    await db.query(`
      CREATE TABLE \`purchase_items\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`purchase_id\` INT NOT NULL,
        \`description\` TEXT NOT NULL,
        \`quantity\` DECIMAL(10,2) NOT NULL,
        \`unit_cost\` DECIMAL(15,2) NOT NULL,
        \`total\` DECIMAL(15,2) NOT NULL,
        \`sort_order\` INT DEFAULT 0,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (\`purchase_id\`) REFERENCES \`purchases\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  } else {
    console.log('  • purchase_items already present, skipping.');
  }

  if (!(await tableExists('vendor_payments'))) {
    console.log('  • Creating `vendor_payments` table...');
    await db.query(`
      CREATE TABLE \`vendor_payments\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`purchase_id\` INT NOT NULL,
        \`amount\` DECIMAL(15,2) NOT NULL,
        \`payment_date\` DATE NOT NULL,
        \`method\` VARCHAR(50),
        \`reference\` VARCHAR(100),
        \`notes\` TEXT,
        \`recorded_by\` INT,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (\`purchase_id\`) REFERENCES \`purchases\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`recorded_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        INDEX \`idx_vpayment_purchase\` (\`purchase_id\`),
        INDEX \`idx_vpayment_date\` (\`payment_date\`)
      ) ENGINE=InnoDB
    `);
  } else {
    console.log('  • vendor_payments already present, skipping.');
  }

  // 3j. Expenses (added 2026-07) — general business costs (rent, salaries,
  //     transport, utilities, …). Company-scoped, optionally linked to a
  //     vendor, with an optional uploaded receipt. Additive only.
  if (!(await tableExists('expenses'))) {
    console.log('  • Creating `expenses` table...');
    await db.query(`
      CREATE TABLE \`expenses\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`created_by\` INT,
        \`vendor_id\` INT,
        \`expense_number\` VARCHAR(50) NOT NULL,
        \`category\` VARCHAR(100),
        \`description\` TEXT,
        \`amount\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`date\` DATE NOT NULL,
        \`payment_method\` VARCHAR(50),
        \`reference\` VARCHAR(100),
        \`receipt_url\` VARCHAR(255),
        \`notes\` TEXT,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`vendor_id\`) REFERENCES \`vendors\`(\`id\`) ON DELETE SET NULL,
        UNIQUE KEY \`unique_expense_per_company\` (\`company_id\`, \`expense_number\`)
      ) ENGINE=InnoDB
    `);
  } else {
    console.log('  • expenses already present, skipping.');
  }

  // 3k. Petty cash (added 2026-08) — a small on-hand cash fund tracked as a
  //     ledger of top-ups (type 'in') and payouts (type 'out'). Balance is
  //     computed on read. Shared per company. Additive only.
  if (!(await tableExists('petty_cash'))) {
    console.log('  • Creating `petty_cash` table...');
    await db.query(`
      CREATE TABLE \`petty_cash\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`created_by\` INT,
        \`entry_number\` VARCHAR(50) NOT NULL,
        \`type\` ENUM('in','out') NOT NULL DEFAULT 'out',
        \`category\` VARCHAR(100),
        \`description\` TEXT,
        \`amount\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`date\` DATE NOT NULL,
        \`reference\` VARCHAR(100),
        \`receipt_url\` VARCHAR(255),
        \`notes\` TEXT,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        UNIQUE KEY \`unique_pettycash_per_company\` (\`company_id\`, \`entry_number\`)
      ) ENGINE=InnoDB
    `);
  } else {
    console.log('  • petty_cash already present, skipping.');
  }

  // 3l. Multi-tenancy (added 2026-08): an Organization (tenant) layer above
  //     companies. Existing users + companies are folded into ONE default org
  //     so nothing changes for the current customer. Additive + backfill only —
  //     no row is moved or deleted.
  if (!(await tableExists('organizations'))) {
    console.log('  • Creating `organizations` table...');
    await db.query(`
      CREATE TABLE \`organizations\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`name\` VARCHAR(255) NOT NULL,
        \`status\` ENUM('active','suspended') NOT NULL DEFAULT 'active',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
  } else {
    console.log('  • organizations already present, skipping.');
  }

  if (!(await columnExists('users', 'organization_id'))) {
    console.log('  • Adding `organization_id` to users...');
    await db.query('ALTER TABLE `users` ADD COLUMN `organization_id` INT NULL');
    try {
      await db.query('ALTER TABLE `users` ADD CONSTRAINT `fk_users_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL');
    } catch (e) { console.warn('  ⚠️  FK users.organization_id:', e.message); }
  }
  if (!(await columnExists('users', 'is_super_admin'))) {
    console.log('  • Adding `is_super_admin` to users...');
    await db.query('ALTER TABLE `users` ADD COLUMN `is_super_admin` TINYINT(1) NOT NULL DEFAULT 0');
  }
  if (!(await columnExists('companies', 'organization_id'))) {
    console.log('  • Adding `organization_id` to companies...');
    await db.query('ALTER TABLE `companies` ADD COLUMN `organization_id` INT NULL');
    try {
      await db.query('ALTER TABLE `companies` ADD CONSTRAINT `fk_companies_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE');
    } catch (e) { console.warn('  ⚠️  FK companies.organization_id:', e.message); }
  }

  // Ensure a default organization exists, then fold all existing users +
  // companies into it (only rows not already assigned — safe to re-run).
  {
    const [orgs] = await db.execute('SELECT id FROM organizations ORDER BY id LIMIT 1');
    let defaultOrgId;
    if (orgs.length === 0) {
      const name = process.env.DEFAULT_ORG_NAME || 'Main Organization';
      const [ins] = await db.execute('INSERT INTO organizations (name) VALUES (?)', [name]);
      defaultOrgId = ins.insertId;
      console.log(`  • Created default organization "${name}" (id ${defaultOrgId}).`);
    } else {
      defaultOrgId = orgs[0].id;
    }
    // Super-admins are platform owners, not org members — never backfill them.
    const [u] = await db.execute('UPDATE users SET organization_id = ? WHERE organization_id IS NULL AND is_super_admin = 0', [defaultOrgId]);
    const [c] = await db.execute('UPDATE companies SET organization_id = ? WHERE organization_id IS NULL', [defaultOrgId]);
    console.log(`  • Backfilled organization on ${u.affectedRows} user(s) and ${c.affectedRows} company(ies).`);
  }

  // Promote the platform owner (ADMIN_EMAIL) to super-admin so they can manage
  // organizations.
  if (process.env.ADMIN_EMAIL) {
    const [r] = await db.execute('UPDATE users SET is_super_admin = 1 WHERE email = ?', [process.env.ADMIN_EMAIL]);
    if (r.affectedRows) console.log(`  • Marked ${process.env.ADMIN_EMAIL} as super-admin.`);
  }

  // Super-admins belong to NO organization — they manage all tenants and can
  // "enter" any org to inspect it, but are not a member/admin of one.
  const [sa] = await db.execute('UPDATE users SET organization_id = NULL WHERE is_super_admin = 1 AND organization_id IS NOT NULL');
  if (sa.affectedRows) console.log(`  • Detached ${sa.affectedRows} super-admin(s) from their organization.`);

  // 3m. companies.currency (added 2026-08) — per-company display currency so
  //     each organization/company can use its own (MWK, ZMW, USD, …).
  if ((await tableExists('companies')) && !(await columnExists('companies', 'currency'))) {
    console.log('  • Adding `currency` column to companies...');
    await db.query("ALTER TABLE `companies` ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'MWK'");
  }

  // 3n. Staff attendance (added 2026-08) — fingerprint/biometric attendance.
  //     A local "agent" on the office PC (talking to the ZKTeco reader) pushes
  //     punches to our API using a device api_key. Enrollments map a device's
  //     internal user id to one of our staff; in/out is derived per day
  //     (first punch = check-in, last = check-out). Additive only.
  if (!(await tableExists('attendance_devices'))) {
    console.log('  • Creating `attendance_devices` table...');
    await db.query(`
      CREATE TABLE \`attendance_devices\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`api_key\` VARCHAR(80) NOT NULL UNIQUE,
        \`active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`last_seen_at\` TIMESTAMP NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • attendance_devices already present, skipping.'); }

  if (!(await tableExists('attendance_enrollments'))) {
    console.log('  • Creating `attendance_enrollments` table...');
    await db.query(`
      CREATE TABLE \`attendance_enrollments\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`user_id\` INT NOT NULL,
        \`device_user_id\` VARCHAR(64) NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
        UNIQUE KEY \`uniq_enroll_device_user\` (\`company_id\`, \`device_user_id\`)
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • attendance_enrollments already present, skipping.'); }

  if (!(await tableExists('attendance_punches'))) {
    console.log('  • Creating `attendance_punches` table...');
    await db.query(`
      CREATE TABLE \`attendance_punches\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`device_id\` INT,
        \`user_id\` INT,
        \`device_user_id\` VARCHAR(64),
        \`punch_time\` DATETIME NOT NULL,
        \`source\` ENUM('device','manual') NOT NULL DEFAULT 'device',
        \`note\` VARCHAR(255),
        \`created_by\` INT,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`device_id\`) REFERENCES \`attendance_devices\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        UNIQUE KEY \`uniq_punch\` (\`company_id\`, \`device_user_id\`, \`punch_time\`),
        INDEX \`idx_punch_time\` (\`company_id\`, \`punch_time\`)
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • attendance_punches already present, skipping.'); }

  if (!(await tableExists('attendance_settings'))) {
    console.log('  • Creating `attendance_settings` table...');
    await db.query(`
      CREATE TABLE \`attendance_settings\` (
        \`company_id\` INT PRIMARY KEY,
        \`work_start\` TIME NOT NULL DEFAULT '08:00:00',
        \`work_end\` TIME NOT NULL DEFAULT '17:00:00',
        \`late_grace_minutes\` INT NOT NULL DEFAULT 10,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • attendance_settings already present, skipping.'); }

  // Minimum minutes between scans — ignore accidental re-scans so one tap isn't
  // recorded as both a check-in and a check-out.
  if (!(await columnExists('attendance_settings', 'min_gap_minutes'))) {
    console.log('  • Adding `min_gap_minutes` to attendance_settings...');
    await db.query('ALTER TABLE `attendance_settings` ADD COLUMN `min_gap_minutes` INT NOT NULL DEFAULT 5');
  } else { console.log('  • attendance_settings.min_gap_minutes already present, skipping.'); }

  // 3o. Attendance EMPLOYEES (added 2026-08) — attendance is tracked for people
  //     who are NOT system login accounts (e.g. field/office staff). This is a
  //     standalone roster: add a person by name and they get a device_user_id
  //     (the "Fingerprint ID") used by the reader/bridge. Managed by any admin
  //     OR a staffer granted attendance access. Additive only.
  if (!(await tableExists('attendance_employees'))) {
    console.log('  • Creating `attendance_employees` table...');
    await db.query(`
      CREATE TABLE \`attendance_employees\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`code\` VARCHAR(50) NULL,
        \`device_user_id\` VARCHAR(64) NOT NULL,
        \`active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`created_by\` INT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        UNIQUE KEY \`uniq_emp_device\` (\`company_id\`, \`device_user_id\`),
        INDEX \`idx_emp_company\` (\`company_id\`)
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • attendance_employees already present, skipping.'); }

  // Punches now reference an employee (kept nullable + user_id retained so no
  // existing data is disturbed).
  if (!(await columnExists('attendance_punches', 'employee_id'))) {
    console.log('  • Adding `employee_id` to attendance_punches...');
    await db.query('ALTER TABLE `attendance_punches` ADD COLUMN `employee_id` INT NULL AFTER `device_id`');
    if (!(await foreignKeyExists('attendance_punches', 'employee_id'))) {
      await db.query(
        'ALTER TABLE `attendance_punches` ADD CONSTRAINT `fk_punch_employee` ' +
          'FOREIGN KEY (`employee_id`) REFERENCES `attendance_employees`(`id`) ON DELETE SET NULL'
      );
    }
  } else { console.log('  • attendance_punches.employee_id already present, skipping.'); }

  // One-time: turn any pre-existing user-based enrollments into employees so
  // nothing already set up on the website is lost.
  await db.query(`
    INSERT INTO attendance_employees (company_id, name, device_user_id, created_by)
    SELECT e.company_id, u.name, e.device_user_id, NULL
      FROM attendance_enrollments e JOIN users u ON e.user_id = u.id
     WHERE NOT EXISTS (
       SELECT 1 FROM attendance_employees ae
        WHERE ae.company_id = e.company_id AND ae.device_user_id = e.device_user_id)
  `);
  await db.query(`
    UPDATE attendance_punches p
      JOIN attendance_employees ae
        ON ae.company_id = p.company_id AND ae.device_user_id = p.device_user_id
       SET p.employee_id = ae.id
     WHERE p.employee_id IS NULL
  `);

  // 3p. Contracts (added 2026-09) — professional client contracts generated
  //     from key inputs; each carries editable clause sections (stored as JSON)
  //     plus structured header fields, downloadable as PDF. Additive only.
  if (!(await tableExists('contracts'))) {
    console.log('  • Creating `contracts` table...');
    await db.query(`
      CREATE TABLE \`contracts\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`created_by\` INT,
        \`client_id\` INT,
        \`contract_number\` VARCHAR(50) NOT NULL,
        \`title\` VARCHAR(255) NOT NULL DEFAULT 'Service Contract',
        \`client_name\` VARCHAR(255) NOT NULL,
        \`client_address\` TEXT,
        \`client_email\` VARCHAR(255),
        \`client_phone\` VARCHAR(50),
        \`site\` TEXT,
        \`amount\` DECIMAL(15,2) DEFAULT 0,
        \`currency\` VARCHAR(3),
        \`payment_frequency\` VARCHAR(20),
        \`payment_amount\` DECIMAL(15,2) DEFAULT 0,
        \`effective_date\` DATE,
        \`start_date\` DATE,
        \`end_date\` DATE,
        \`contract_period\` VARCHAR(100),
        \`termination_rules\` TEXT,
        \`comments\` TEXT,
        \`sections\` LONGTEXT,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'draft',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE SET NULL,
        UNIQUE KEY \`unique_contract_per_company\` (\`company_id\`, \`contract_number\`)
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • contracts already present, skipping.'); }

  // 3p-extra. Contract add-ons: insurance & printing charges, an uploaded
  // signature image, plus a per-USER default clause template.
  for (const [col, ddl] of [
    ['insurance', 'ALTER TABLE `contracts` ADD COLUMN `insurance` DECIMAL(15,2) DEFAULT 0'],
    ['printing_charges', 'ALTER TABLE `contracts` ADD COLUMN `printing_charges` DECIMAL(15,2) DEFAULT 0'],
    ['signature_url', 'ALTER TABLE `contracts` ADD COLUMN `signature_url` VARCHAR(255) NULL'],
  ]) {
    if (!(await columnExists('contracts', col))) {
      console.log(`  • Adding \`${col}\` to contracts...`);
      await db.query(ddl);
    } else { console.log(`  • contracts.${col} already present, skipping.`); }
  }

  // Per-user (per-company) default contract clauses. When a user edits their
  // clauses they become that user's default for future contracts — only for
  // them. Falls back to the built-in template when a user has none saved.
  if (!(await tableExists('contract_templates'))) {
    console.log('  • Creating `contract_templates` table...');
    await db.query(`
      CREATE TABLE \`contract_templates\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`user_id\` INT NOT NULL,
        \`title\` VARCHAR(255),
        \`sections\` LONGTEXT,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
        UNIQUE KEY \`uniq_template_company_user\` (\`company_id\`, \`user_id\`)
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • contract_templates already present, skipping.'); }

  // 3q. Job cards (added 2026-10) — the work order between a quotation and an
  //     invoice (quotation → job card → invoice → delivery note). Can be created
  //     standalone or from a quotation. Items keep an internal unit_price (never
  //     printed on the job card) so an invoice can be generated from it.
  //     ADDITIVE ONLY: new tables + nullable link columns; nothing existing is
  //     altered or deleted. Deleting a parent only unlinks (SET NULL).
  if (!(await tableExists('job_cards'))) {
    console.log('  • Creating `job_cards` table...');
    await db.query(`
      CREATE TABLE \`job_cards\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`created_by\` INT,
        \`client_id\` INT,
        \`quotation_id\` INT,
        \`job_card_number\` VARCHAR(50) NOT NULL,
        \`client_name\` VARCHAR(255) NOT NULL,
        \`client_address\` TEXT,
        \`client_email\` VARCHAR(255),
        \`client_phone\` VARCHAR(50),
        \`date\` DATE NOT NULL,
        \`due_date\` DATE NULL,
        \`completed_date\` DATE NULL,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'pending',
        \`assigned_to\` VARCHAR(255) NULL,
        \`description\` TEXT,
        \`notes\` TEXT,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`quotation_id\`) REFERENCES \`quotations\`(\`id\`) ON DELETE SET NULL,
        UNIQUE KEY \`unique_job_card_per_company\` (\`company_id\`, \`job_card_number\`)
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • job_cards already present, skipping.'); }

  if (!(await tableExists('job_card_items'))) {
    console.log('  • Creating `job_card_items` table...');
    await db.query(`
      CREATE TABLE \`job_card_items\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`job_card_id\` INT NOT NULL,
        \`description\` TEXT NOT NULL,
        \`quantity\` DECIMAL(10,2) NOT NULL DEFAULT 1,
        \`unit_price\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`sort_order\` INT DEFAULT 0,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (\`job_card_id\`) REFERENCES \`job_cards\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • job_card_items already present, skipping.'); }

  // Workflow links: invoice ← job card, delivery note ← invoice. Nullable, so
  // every existing invoice / delivery note is untouched (NULL = no link).
  for (const [table, col, refTable] of [
    ['invoices', 'job_card_id', 'job_cards'],
    ['delivery_notes', 'invoice_id', 'invoices'],
  ]) {
    if (!(await columnExists(table, col))) {
      console.log(`  • Adding \`${col}\` to ${table}...`);
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` INT NULL`);
    } else { console.log(`  • ${table}.${col} already present, skipping.`); }
    if ((await foreignKeyExists(table, col)).length === 0) {
      // Adding an FK rebuilds the table, and strict SQL modes refuse to copy
      // legacy rows holding zero dates ('0000-00-00'). Relax ONLY the zero-date
      // checks, only on this dedicated connection, so existing rows are copied
      // exactly as they are (no data is modified).
      const conn = await db.getConnection();
      try {
        await conn.query(
          "SET SESSION sql_mode = REPLACE(REPLACE(@@SESSION.sql_mode, 'NO_ZERO_IN_DATE', ''), 'NO_ZERO_DATE', '')"
        );
        await conn.query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`fk_${table}_${col}\`
             FOREIGN KEY (\`${col}\`) REFERENCES \`${refTable}\`(\`id\`) ON DELETE SET NULL`
        );
        console.log(`  • Added FK ${table}.${col} → ${refTable}.id`);
      } catch (e) {
        console.warn(`  ⚠️  Could not add FK on ${table}.${col}: ${e.message}`);
      } finally {
        conn.release();
      }
    }
  }

  // 3r. LPOs — Local Purchase Orders WE issue to suppliers (vendors). An LPO
  //     can later be converted into a Purchase (vendor bill) when goods arrive.
  if (!(await tableExists('purchase_orders'))) {
    console.log('  • Creating `purchase_orders` table...');
    await db.query(`
      CREATE TABLE \`purchase_orders\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`created_by\` INT,
        \`vendor_id\` INT,
        \`lpo_number\` VARCHAR(50) NOT NULL,
        \`vendor_name\` VARCHAR(255) NOT NULL,
        \`vendor_address\` TEXT,
        \`vendor_email\` VARCHAR(255),
        \`vendor_phone\` VARCHAR(50),
        \`quotation_id\` INT,
        \`job_card_id\` INT,
        \`purchase_id\` INT,
        \`date\` DATE NOT NULL,
        \`delivery_date\` DATE NULL,
        \`delivery_address\` TEXT,
        \`payment_terms\` VARCHAR(255),
        \`subtotal\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`vat_amount\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`grand_total\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'draft',
        \`notes\` TEXT,
        \`terms_conditions\` TEXT,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`vendor_id\`) REFERENCES \`vendors\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`quotation_id\`) REFERENCES \`quotations\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`job_card_id\`) REFERENCES \`job_cards\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`purchase_id\`) REFERENCES \`purchases\`(\`id\`) ON DELETE SET NULL,
        UNIQUE KEY \`unique_lpo_per_company\` (\`company_id\`, \`lpo_number\`)
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • purchase_orders already present, skipping.'); }

  if (!(await tableExists('purchase_order_items'))) {
    console.log('  • Creating `purchase_order_items` table...');
    await db.query(`
      CREATE TABLE \`purchase_order_items\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`purchase_order_id\` INT NOT NULL,
        \`description\` TEXT NOT NULL,
        \`quantity\` DECIMAL(10,2) NOT NULL DEFAULT 1,
        \`unit_cost\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`total\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`sort_order\` INT DEFAULT 0,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (\`purchase_order_id\`) REFERENCES \`purchase_orders\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • purchase_order_items already present, skipping.'); }

  // 3s. Payroll (staff salary + pay slips) built on the attendance staff
  //     roster. Salary details are new NULLABLE/defaulted columns on
  //     attendance_employees (existing rows untouched).
  for (const [col, ddl] of [
    ['position', 'ALTER TABLE `attendance_employees` ADD COLUMN `position` VARCHAR(120) NULL'],
    ['basic_salary', 'ALTER TABLE `attendance_employees` ADD COLUMN `basic_salary` DECIMAL(15,2) NOT NULL DEFAULT 0'],
    ['bank_name', 'ALTER TABLE `attendance_employees` ADD COLUMN `bank_name` VARCHAR(120) NULL'],
    ['bank_account', 'ALTER TABLE `attendance_employees` ADD COLUMN `bank_account` VARCHAR(60) NULL'],
    ['employee_tpin', 'ALTER TABLE `attendance_employees` ADD COLUMN `employee_tpin` VARCHAR(40) NULL'],
    // JSON array of recurring pay lines that prefill each month's pay slip:
    // [{ type: 'allowance' | 'deduction', label, amount, taxable }]
    ['salary_lines', 'ALTER TABLE `attendance_employees` ADD COLUMN `salary_lines` LONGTEXT NULL'],
  ]) {
    if (!(await columnExists('attendance_employees', col))) {
      console.log(`  • Adding \`${col}\` to attendance_employees...`);
      await db.query(ddl);
    } else { console.log(`  • attendance_employees.${col} already present, skipping.`); }
  }

  // Per-company payroll settings: PAYE bands (JSON, editable because MRA
  // revises them) and optional pension percentages.
  if (!(await tableExists('payroll_settings'))) {
    console.log('  • Creating `payroll_settings` table...');
    await db.query(`
      CREATE TABLE \`payroll_settings\` (
        \`company_id\` INT PRIMARY KEY,
        \`paye_bands\` LONGTEXT,
        \`pension_employee_percent\` DECIMAL(5,2) NOT NULL DEFAULT 0,
        \`pension_employer_percent\` DECIMAL(5,2) NOT NULL DEFAULT 0,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • payroll_settings already present, skipping.'); }

  // One pay slip per staff member per month. employee_id is SET NULL on staff
  // removal and the slip keeps a snapshot of name/position/code, so removing a
  // staff member never deletes their payroll history.
  if (!(await tableExists('payslips'))) {
    console.log('  • Creating `payslips` table...');
    await db.query(`
      CREATE TABLE \`payslips\` (
        \`id\` INT PRIMARY KEY AUTO_INCREMENT,
        \`company_id\` INT NOT NULL,
        \`created_by\` INT,
        \`employee_id\` INT NULL,
        \`employee_name\` VARCHAR(255) NOT NULL,
        \`employee_code\` VARCHAR(50) NULL,
        \`position\` VARCHAR(120) NULL,
        \`period\` CHAR(7) NOT NULL,
        \`basic_salary\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`lines\` LONGTEXT,
        \`gross_pay\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`taxable_pay\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`paye\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`pension_employee\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`pension_employer\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`total_deductions\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`net_pay\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`days_present\` INT NULL,
        \`days_absent\` INT NULL,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'draft',
        \`payment_date\` DATE NULL,
        \`payment_method\` VARCHAR(60) NULL,
        \`bank_name\` VARCHAR(120) NULL,
        \`bank_account\` VARCHAR(60) NULL,
        \`notes\` TEXT,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL,
        FOREIGN KEY (\`employee_id\`) REFERENCES \`attendance_employees\`(\`id\`) ON DELETE SET NULL,
        UNIQUE KEY \`uniq_payslip_emp_period\` (\`company_id\`, \`employee_id\`, \`period\`),
        INDEX \`idx_payslip_period\` (\`company_id\`, \`period\`)
      ) ENGINE=InnoDB
    `);
  } else { console.log('  • payslips already present, skipping.'); }

  // 3t. Payment proofs (added 2026-10) — one uploaded proof document (bank
  //     slip / receipt photo or PDF) per payment, for client payments on
  //     invoices AND payments made to vendors. Files live in the persistent
  //     uploads dir (<UPLOADS_ROOT>/payment-proofs/). Additive, nullable only.
  for (const table of ['payments', 'vendor_payments']) {
    for (const [col, type] of [
      ['proof_file_url', 'VARCHAR(255) NULL'],
      ['proof_file_name', 'VARCHAR(255) NULL'],
      ['proof_uploaded_at', 'DATETIME NULL'],
      ['proof_uploaded_by', 'INT NULL'],
    ]) {
      if (!(await columnExists(table, col))) {
        console.log(`  • Adding \`${col}\` to ${table}...`);
        await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${type}`);
      } else { console.log(`  • ${table}.${col} already present, skipping.`); }
    }
  }

  // 3u. Contract template style per organization (added 2026-10). Decides the
  //     built-in clauses a NEW contract starts from when the user has no saved
  //     default: 'billboard' (billboard advertising wording) or 'general'
  //     (neutral wording for any business). New organizations default to
  //     'general'; organizations that already exist when the column is first
  //     added are marked 'billboard' so their contracts stay exactly as before.
  //     Existing contracts and saved templates are never touched.
  //     Adding the column with DEFAULT 'billboard' fills every existing row in
  //     one atomic step; the default is then switched to 'general' for new rows
  //     (re-checked on every run, so an interrupted run self-heals).
  if (!(await columnExists('organizations', 'contract_style'))) {
    console.log('  • Adding `contract_style` to organizations (existing orgs keep billboard)...');
    await db.query("ALTER TABLE `organizations` ADD COLUMN `contract_style` VARCHAR(20) NOT NULL DEFAULT 'billboard'");
  } else { console.log('  • organizations.contract_style already present, skipping.'); }
  const [[styleCol]] = await db.query(
    "SELECT COLUMN_DEFAULT AS d FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organizations' AND COLUMN_NAME = 'contract_style'"
  );
  if (!/general/.test(String(styleCol.d || ''))) {
    console.log("  • Setting organizations.contract_style default to 'general' for new organizations...");
    await db.query("ALTER TABLE `organizations` ALTER COLUMN `contract_style` SET DEFAULT 'general'");
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
