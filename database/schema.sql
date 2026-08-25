SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `users`, `companies`, `quotations`, `quotation_items`, `invoices`, `invoice_items`, `delivery_notes`, `delivery_note_items`, `clients`, `payments`, `petty_cash`, `expenses`, `vendor_payments`, `purchase_items`, `purchases`, `vendors`, `attendance_punches`, `attendance_enrollments`, `attendance_settings`, `attendance_devices`, `organizations`;
SET FOREIGN_KEY_CHECKS = 1;

-- Organizations are tenants (separate customers). Each has its own users and
-- companies; all data is isolated per organization. `is_super_admin` users
-- (the platform owner) manage organizations.
CREATE TABLE IF NOT EXISTS `organizations` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `status` ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `users` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `organization_id` INT,
    `is_super_admin` TINYINT(1) NOT NULL DEFAULT 0,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL UNIQUE,
    `password` VARCHAR(255),
    `google_id` VARCHAR(255) UNIQUE,
    `role` ENUM('staff', 'admin') NOT NULL DEFAULT 'staff',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Companies are shared, organization-wide brands. `user_id` records the
-- admin who created the company; it is nullable so a company survives the
-- deletion of its creator.
CREATE TABLE IF NOT EXISTS `companies` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `organization_id` INT,
    `user_id` INT,
    `name` VARCHAR(255) NOT NULL,
    `logo_url` VARCHAR(255),
    `quote_logo_url` VARCHAR(255),
    `address` TEXT,
    `tpin` VARCHAR(50),
    `bank_details` TEXT,
    `vat_rate` DECIMAL(5,4) DEFAULT 0.165,
    `ppda_rate` DECIMAL(5,4) DEFAULT 0.01,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'MWK',
    `primary_color` VARCHAR(7) DEFAULT '#000000',
    `secondary_color` VARCHAR(7) DEFAULT '#ffffff',
    `template` VARCHAR(30) NOT NULL DEFAULT 'classic',
    `default_terms_conditions` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `clients` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `company_id` INT NOT NULL,
    `created_by` INT,
    `name` VARCHAR(255) NOT NULL,
    `contact_person` VARCHAR(255),
    `email` VARCHAR(255),
    `phone` VARCHAR(50),
    `address` TEXT,
    `tax_id` VARCHAR(50),
    `notes` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    UNIQUE KEY `unique_client_per_company` (`company_id`, `name`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `quotations` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `company_id` INT NOT NULL,
    `created_by` INT,
    `client_id` INT,
    `quote_number` VARCHAR(50) NOT NULL,
    `client_name` VARCHAR(255) NOT NULL,
    `client_address` TEXT,
    `client_email` VARCHAR(255),
    `client_phone` VARCHAR(50),
    `date` DATE NOT NULL,
    `expiry_days` INT DEFAULT 30,
    `subtotal` DECIMAL(15,2) NOT NULL,
    `vat_amount` DECIMAL(15,2) NOT NULL,
    `ppda_amount` DECIMAL(15,2) NOT NULL,
    `grand_total` DECIMAL(15,2) NOT NULL,
    `notes` TEXT,
    `terms_conditions` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE SET NULL,
    UNIQUE KEY `unique_quote_per_company` (`company_id`, `quote_number`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `quotation_items` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `quotation_id` INT NOT NULL,
    `description` TEXT NOT NULL,
    `quantity` DECIMAL(10,2) NOT NULL,
    `unit_price` DECIMAL(15,2) NOT NULL,
    `total` DECIMAL(15,2) NOT NULL,
    `sort_order` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `invoices` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `company_id` INT NOT NULL,
    `created_by` INT,
    `client_id` INT,
    `quotation_id` INT,
    `invoice_number` VARCHAR(50) NOT NULL,
    `client_name` VARCHAR(255) NOT NULL,
    `client_address` TEXT,
    `client_email` VARCHAR(255),
    `client_phone` VARCHAR(50),
    `date` DATE NOT NULL,
    `due_days` INT DEFAULT 30,
    `subtotal` DECIMAL(15,2) NOT NULL,
    `vat_amount` DECIMAL(15,2) NOT NULL,
    `ppda_amount` DECIMAL(15,2) NOT NULL,
    `grand_total` DECIMAL(15,2) NOT NULL,
    `notes` TEXT,
    `terms_conditions` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE SET NULL,
    UNIQUE KEY `unique_invoice_per_company` (`company_id`, `invoice_number`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `invoice_items` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `invoice_id` INT NOT NULL,
    `description` TEXT NOT NULL,
    `quantity` DECIMAL(10,2) NOT NULL,
    `unit_price` DECIMAL(15,2) NOT NULL,
    `total` DECIMAL(15,2) NOT NULL,
    `sort_order` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Payments are recorded against invoices. A pending invoice has zero
-- payments; a partial invoice has SUM(payments.amount) < grand_total; a paid
-- invoice has SUM(payments.amount) >= grand_total. The application computes
-- those statuses on read so historical recalc isn't needed.
CREATE TABLE IF NOT EXISTS `payments` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `invoice_id` INT NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `payment_date` DATE NOT NULL,
    `method` VARCHAR(50),
    `reference` VARCHAR(100),
    `notes` TEXT,
    `recorded_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    INDEX `idx_payment_invoice` (`invoice_id`),
    INDEX `idx_payment_date` (`payment_date`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `delivery_notes` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `company_id` INT NOT NULL,
    `created_by` INT,
    `client_id` INT,
    `quotation_id` INT,
    `delivery_note_number` VARCHAR(50) NOT NULL,
    `client_name` VARCHAR(255) NOT NULL,
    `client_address` TEXT,
    `client_email` VARCHAR(255),
    `client_phone` VARCHAR(50),
    `date` DATE NOT NULL,
    `signed_file_url` VARCHAR(255),
    `signed_at` TIMESTAMP NULL,
    `signed_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`signed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE SET NULL,
    UNIQUE KEY `unique_delivery_per_company` (`company_id`, `delivery_note_number`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `delivery_note_items` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `delivery_note_id` INT NOT NULL,
    `description` TEXT NOT NULL,
    `quantity` DECIMAL(10,2) NOT NULL,
    `sort_order` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`delivery_note_id`) REFERENCES `delivery_notes`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Vendors are suppliers the company buys from — the buy-side mirror of
-- `clients`. Same shape, company-scoped, unique by name per company.
CREATE TABLE IF NOT EXISTS `vendors` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `company_id` INT NOT NULL,
    `created_by` INT,
    `name` VARCHAR(255) NOT NULL,
    `contact_person` VARCHAR(255),
    `email` VARCHAR(255),
    `phone` VARCHAR(50),
    `address` TEXT,
    `tax_id` VARCHAR(50),
    `notes` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    UNIQUE KEY `unique_vendor_per_company` (`company_id`, `name`)
) ENGINE=InnoDB;

-- A purchase is a bill/PO recorded against a vendor (money the company owes
-- the vendor). It can optionally link to the client quotation/invoice it was
-- bought for, which is what powers profit = sale − cost.
CREATE TABLE IF NOT EXISTS `purchases` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `company_id` INT NOT NULL,
    `created_by` INT,
    `vendor_id` INT,
    `purchase_number` VARCHAR(50) NOT NULL,
    `vendor_name` VARCHAR(255) NOT NULL,
    `vendor_address` TEXT,
    `vendor_email` VARCHAR(255),
    `vendor_phone` VARCHAR(50),
    `quotation_id` INT,
    `invoice_id` INT,
    `date` DATE NOT NULL,
    `subtotal` DECIMAL(15,2) NOT NULL DEFAULT 0,
    `grand_total` DECIMAL(15,2) NOT NULL DEFAULT 0,
    `notes` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE SET NULL,
    UNIQUE KEY `unique_purchase_per_company` (`company_id`, `purchase_number`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `purchase_items` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `purchase_id` INT NOT NULL,
    `description` TEXT NOT NULL,
    `quantity` DECIMAL(10,2) NOT NULL,
    `unit_cost` DECIMAL(15,2) NOT NULL,
    `total` DECIMAL(15,2) NOT NULL,
    `sort_order` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Staff attendance (fingerprint/biometric). A local agent on the office PC
-- pushes punches via a device api_key; enrollments map a device user id to a
-- staff member; in/out is derived per day (first in, last out).
CREATE TABLE IF NOT EXISTS `attendance_devices` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `company_id` INT NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `api_key` VARCHAR(80) NOT NULL UNIQUE,
    `active` TINYINT(1) NOT NULL DEFAULT 1,
    `last_seen_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `attendance_enrollments` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `company_id` INT NOT NULL,
    `user_id` INT NOT NULL,
    `device_user_id` VARCHAR(64) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `uniq_enroll_device_user` (`company_id`, `device_user_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `attendance_punches` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `company_id` INT NOT NULL,
    `device_id` INT,
    `user_id` INT,
    `device_user_id` VARCHAR(64),
    `punch_time` DATETIME NOT NULL,
    `source` ENUM('device','manual') NOT NULL DEFAULT 'device',
    `note` VARCHAR(255),
    `created_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`device_id`) REFERENCES `attendance_devices`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    UNIQUE KEY `uniq_punch` (`company_id`, `device_user_id`, `punch_time`),
    INDEX `idx_punch_time` (`company_id`, `punch_time`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `attendance_settings` (
    `company_id` INT PRIMARY KEY,
    `work_start` TIME NOT NULL DEFAULT '08:00:00',
    `work_end` TIME NOT NULL DEFAULT '17:00:00',
    `late_grace_minutes` INT NOT NULL DEFAULT 10,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Payments made OUT to vendors against a purchase — the mirror of `payments`.
-- Payable status (pending/partial/paid) is computed on read by comparing
-- SUM(vendor_payments.amount) to purchases.grand_total.
CREATE TABLE IF NOT EXISTS `vendor_payments` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `purchase_id` INT NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `payment_date` DATE NOT NULL,
    `method` VARCHAR(50),
    `reference` VARCHAR(100),
    `notes` TEXT,
    `recorded_by` INT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    INDEX `idx_vpayment_purchase` (`purchase_id`),
    INDEX `idx_vpayment_date` (`payment_date`)
) ENGINE=InnoDB;

-- Petty cash ledger — a small on-hand cash fund. Each row is a top-up
-- (type 'in') or a payout (type 'out'); the balance is computed on read.
-- Shared per company.
CREATE TABLE IF NOT EXISTS `petty_cash` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `company_id` INT NOT NULL,
    `created_by` INT,
    `entry_number` VARCHAR(50) NOT NULL,
    `type` ENUM('in','out') NOT NULL DEFAULT 'out',
    `category` VARCHAR(100),
    `description` TEXT,
    `amount` DECIMAL(15,2) NOT NULL DEFAULT 0,
    `date` DATE NOT NULL,
    `reference` VARCHAR(100),
    `receipt_url` VARCHAR(255),
    `notes` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    UNIQUE KEY `unique_pettycash_per_company` (`company_id`, `entry_number`)
) ENGINE=InnoDB;

-- General business expenses (rent, salaries, transport, utilities, …).
-- Company-scoped, optionally linked to a vendor, with an optional receipt scan.
CREATE TABLE IF NOT EXISTS `expenses` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `company_id` INT NOT NULL,
    `created_by` INT,
    `vendor_id` INT,
    `expense_number` VARCHAR(50) NOT NULL,
    `category` VARCHAR(100),
    `description` TEXT,
    `amount` DECIMAL(15,2) NOT NULL DEFAULT 0,
    `date` DATE NOT NULL,
    `payment_method` VARCHAR(50),
    `reference` VARCHAR(100),
    `receipt_url` VARCHAR(255),
    `notes` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE SET NULL,
    UNIQUE KEY `unique_expense_per_company` (`company_id`, `expense_number`)
) ENGINE=InnoDB;
