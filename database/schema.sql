SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `users`, `companies`, `quotations`, `quotation_items`, `invoices`, `invoice_items`, `delivery_notes`, `delivery_note_items`, `clients`;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS `users` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL UNIQUE,
    `password` VARCHAR(255),
    `google_id` VARCHAR(255) UNIQUE,
    `role` ENUM('staff', 'admin') NOT NULL DEFAULT 'staff',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Companies are shared, organization-wide brands. `user_id` records the
-- admin who created the company; it is nullable so a company survives the
-- deletion of its creator.
CREATE TABLE IF NOT EXISTS `companies` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `user_id` INT,
    `name` VARCHAR(255) NOT NULL,
    `logo_url` VARCHAR(255),
    `quote_logo_url` VARCHAR(255),
    `address` TEXT,
    `tpin` VARCHAR(50),
    `bank_details` TEXT,
    `vat_rate` DECIMAL(5,4) DEFAULT 0.165,
    `ppda_rate` DECIMAL(5,4) DEFAULT 0.01,
    `primary_color` VARCHAR(7) DEFAULT '#000000',
    `secondary_color` VARCHAR(7) DEFAULT '#ffffff',
    `template` VARCHAR(30) NOT NULL DEFAULT 'classic',
    `default_terms_conditions` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `clients` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `company_id` INT NOT NULL,
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
