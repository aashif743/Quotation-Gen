
# QuoteFlow — by Orbital IT Solutions

A modern, professional quotation management system built for **Arkay Pak** and **Electronics Hub** with support for multiple companies, dynamic branding, and automated calculations.

## 🚀 Features

### Phase 1: Configuration & Management
- ✅ **Multi-Profile Toggle**: Switch between "Arkay Pak" and "Electronics Hub"
- ✅ **Dynamic Settings**: Edit company information, tax rates, and branding
- ✅ **Logo Uploader**: Support for PNG/JPG uploads per company

### Phase 2: Quotation Builder  
- ✅ **Live Preview**: Real-time quotation preview while editing
- ✅ **Auto-Calculations**: Automated VAT (16.5%/17.5%), PPDA (1%), and totals
- ✅ **Unique Reference Generator**: Automatic quote number generation
- ✅ **Dynamic Items**: Add/remove quotation items with real-time calculations

### Phase 3: Storage & Output
- ✅ **Archiving**: Complete quotation history with search and filtering
- ✅ **PDF Export**: High-quality PDF generation with company branding
- ✅ **Print Optimization**: Perfect A4 printing with CSS media queries

## 🛠 Technology Stack

- **Frontend**: React.js + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express.js
- **Database**: MySQL
- **PDF Generation**: jsPDF + html2canvas
- **Authentication**: JWT-based (ready for implementation)

## 📋 Prerequisites

- Node.js 16+
- MySQL 5.7+
- npm or yarn

## ⚡ Quick Start

### 1. Installation

```bash
# Clone or extract the project
cd Quotation_Gen

# Install all dependencies (backend + frontend)
npm run install-all
```

### 2. Database Setup

```bash
# Configure your database in .env file
cp .env.example .env

# Edit .env with your MySQL credentials:
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=quotation_system
```

### 3. Initialize Database

```bash
# Run the setup script to create tables and seed data
npm run setup
```

### 4. Start Development

```bash
# Start both backend and frontend in development mode
npm run dev-full

# Or start them separately:
# Backend: npm run dev (http://localhost:5000)
# Frontend: cd client && npm start (http://localhost:3000)
```

## 🗂 Project Structure

```
Quotation_Gen/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Main pages
│   │   ├── context/        # React context providers
│   │   ├── services/       # API services
│   │   ├── types/          # TypeScript types
│   │   └── utils/          # Utility functions
│   └── package.json
├── config/                 # Database configuration
├── database/              # Database schema and initialization
├── routes/                # API routes
├── uploads/               # File uploads storage
├── server.js              # Express server
├── setup.js              # Database setup script
└── package.json
```

## 🎨 Company Branding

### Arkay Pak
- **Colors**: Red (#dc2626) and Black (#000000)
- **VAT Rate**: 16.5%
- **Quote Prefix**: AP-XXXX

### Electronics Hub  
- **Colors**: Green (#16a34a) and White (#ffffff)
- **VAT Rate**: 17.5%
- **Quote Prefix**: EH-XXXX

## 💰 Calculation Logic

All calculations use **Malawi Kwacha (MWK)** currency:

1. **Subtotal**: Σ(Quantity × Unit Price)
2. **VAT**: Subtotal × VAT Rate (16.5% or 17.5%)
3. **PPDA**: Subtotal × 1% (Standard levy)
4. **Grand Total**: Subtotal + VAT + PPDA

## 📱 Usage

### 1. Switch Companies
Use the company selector in the sidebar to switch between Arkay Pak and Electronics Hub.

### 2. Create Quotations
1. Navigate to "New Quotation"
2. Fill in client details
3. Add items with descriptions, quantities, and prices
4. Watch real-time calculations
5. Preview and create the quotation

### 3. Manage Settings
1. Go to "Company Settings"
2. Update company information, tax rates, and colors
3. Upload company logos
4. Changes apply immediately

### 4. View History
1. Access "Quotation History"
2. Search and filter quotations
3. View, download PDF, or delete quotations

## 🚀 Deployment

### For Production

```bash
# Build the frontend
npm run build

# Set production environment
NODE_ENV=production

# Start the server
npm start
```

### For Hostinger Business Hosting

1. Upload files to your hosting directory
2. Update `.env` with Hostinger MySQL credentials
3. Run `npm run setup` via SSH/terminal
4. Set up your domain to point to the application

## 🔧 Configuration

### Environment Variables

```env
NODE_ENV=development
PORT=5000
DB_HOST=localhost
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=quotation_system
JWT_SECRET=your_secret_key
```

### Database Schema

The system uses three main tables:
- `companies`: Store company profiles and settings
- `quotations`: Store quotation headers
- `quotation_items`: Store individual line items

## 🎯 API Endpoints

### Companies
- `GET /api/companies` - List all companies
- `GET /api/companies/:id` - Get company details
- `PUT /api/companies/:id` - Update company (with file upload)
- `GET /api/companies/:id/next-quote-number` - Get next quote number

### Quotations  
- `GET /api/quotations` - List quotations (with company filter)
- `GET /api/quotations/:id` - Get quotation details with items
- `POST /api/quotations` - Create new quotation
- `PUT /api/quotations/:id` - Update quotation
- `DELETE /api/quotations/:id` - Delete quotation

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Check MySQL is running
   - Verify credentials in `.env`
   - Ensure database exists

2. **Logo Upload Issues**
   - Check `uploads/` directory permissions
   - Verify file size (max 5MB)
   - Use supported formats (PNG, JPG)

3. **PDF Generation Problems**
   - Ensure quotation document is fully loaded
   - Check browser compatibility
   - Verify canvas rendering

## 📞 Support

For technical support or questions about the quotation system:

1. Check the troubleshooting section
2. Review the API documentation
3. Check database schema and sample data

## 📄 License

This quotation system is proprietary software developed for Arkay Pak and Electronics Hub.

---

**Built with ❤️ for professional quotation management**
=======
# Quotation-Gen
Quotation Generator Web application for Electronics Hub
>>>>>>> 03ddbe27ae301af51866174e10f5b85bc45ba29a
