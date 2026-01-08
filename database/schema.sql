CREATE DATABASE IF NOT EXISTS quotation_system;
USE quotation_system;

CREATE TABLE IF NOT EXISTS companies (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    logo_url VARCHAR(255),
    address TEXT,
    tpin VARCHAR(50),
    bank_details TEXT,
    vat_rate DECIMAL(5,4) DEFAULT 0.165,
    ppda_rate DECIMAL(5,4) DEFAULT 0.01,
    primary_color VARCHAR(7) DEFAULT '#000000',
    secondary_color VARCHAR(7) DEFAULT '#ffffff',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    quote_number VARCHAR(50) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    client_address TEXT,
    client_email VARCHAR(255),
    client_phone VARCHAR(50),
    date DATE NOT NULL,
    expiry_days INT DEFAULT 30,
    subtotal DECIMAL(15,2) NOT NULL,
    vat_amount DECIMAL(15,2) NOT NULL,
    ppda_amount DECIMAL(15,2) NOT NULL,
    grand_total DECIMAL(15,2) NOT NULL,
    notes TEXT,
    terms_conditions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE KEY unique_quote_per_company (company_id, quote_number)
);

CREATE TABLE IF NOT EXISTS quotation_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    quotation_id INT NOT NULL,
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(15,2) NOT NULL,
    total DECIMAL(15,2) NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
);

-- Insert default companies
INSERT INTO companies (name, address, tpin, bank_details, vat_rate, ppda_rate, primary_color, secondary_color) VALUES
('Arkay Pak', 'Blantyre, Malawi', 'TPIN123456', 'Standard Bank, Account: 1234567890', 0.165, 0.01, '#dc2626', '#000000'),
('Electronics Hub', 'Lilongwe, Malawi', 'TPIN654321', 'FDH Bank, Account: 0987654321', 0.175, 0.01, '#16a34a', '#ffffff')
ON DUPLICATE KEY UPDATE name=VALUES(name);