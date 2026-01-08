Project Blueprint: Multi-Company Quotation System
1. Technology Stack
* Frontend: React.js + Tailwind CSS (for modern, responsive UI).
* Backend: Node.js (Express.js).
* Database: MySQL (Native to Hostinger Business hosting).
* PDF Generation: jspdf and html2canvas (Client-side) or puppeteer (Server-side).
* Auth: Simple JWT-based login (to protect saved quotations).

2. Database Schema (MySQL)
To keep companies completely separate, we will use a company_id foreign key.
* companies Table: ID, name, logo_url, address, TPIN, bank_details, vat_rate, ppda_rate.
* quotations Table: ID, company_id, quote_number, client_name, date, expiry_days, subtotal, tax_amount, grand_total, created_at.
* quotation_items Table: ID, quote_id, description, quantity, unit_price, total.

3. Detailed Features List
Phase 1: Configuration & Management
* Multi-Profile Toggle: A dashboard switch to choose between "Arkay Pak" and "Electronics Hub."
* Dynamic Settings: A "Settings" page to edit static info (Address, TPIN, Bank Account, Tax % labels) without touching code.
* Logo Uploader: Support for .png and .jpg uploads per company.
Phase 2: Quotation Builder
* Live Preview: A side-by-side view where the PDF updates as the user types.
* Auto-Calculations:
    * Subtotal = Sum of (Qty * Price).
    * VAT (16.5% or 17.5%) based on company settings.
    * PPDA (1%) calculation.
    * Grand Total calculation.
* Unique Reference Generator: Automatic "Quote No" generation based on the last saved ID.
Phase 3: Storage & Output
* Archiving: A "History" page for each company to view/edit/delete past quotes.
* PDF Export: High-quality download with professional fonts (Inter/Roboto).
* Print Optimization: CSS media queries to ensure the web page prints perfectly on A4 paper.

4. Implementation Steps (Task List)
Please follow these steps in order. Mark as [FINISHED] once done.
Step 1: Project Initialization
* [ ] Set up Node.js Express server.
* [ ] Configure MySQL connection for Hostinger environment.
* [ ] Create React frontend with Tailwind CSS.
Step 2: Database & API Setup
* [ ] Create the companies, quotations, and items tables.
* [ ] Build API endpoints to:
    * GET/UPDATE company settings.
    * POST a new quotation.
    * GET quotation history filtered by company_id.
Step 3: Frontend - Company Management
* [ ] Build the "Switch Company" sidebar/header.
* [ ] Build the "Settings" page to manage TPIN, Address, and Bank details for each profile.
Step 4: Frontend - Quotation Form
* [ ] Build dynamic row adding (add/remove item lines).
* [ ] Implement real-time math for VAT, PPDA, and Grand Totals.
* [ ] Create the "Modern Professional" template view.
Step 5: PDF & Print Functionality
* [ ] Integrate PDF download library.
* [ ] Ensure company-specific colors (Green for Electronics Hub, Red/Black for Arkay Pak) apply to the template.
Step 6: History & Archiving
* [ ] Create a table view to list past quotes.
* [ ] Add "View/Redownload" and "Delete" actions.

5. Important Logic for Calculations
For both companies in the images, the calculation logic should be:
1. Subtotal: $\sum (Quantity \times Unit Price)$
2. VAT: $Subtotal \times 0.165$ (or 0.175 depending on the profile).
3. PPDA: $Subtotal \times 0.01$ (Standard 1% levy).
4. Grand Total: $Subtotal + VAT + PPDA$

**** Importatant Note - All currency should be in Malawi Kwacha(MWK). Calculations are should be automatically claculate. Designs should be modern, user freindly and professional.