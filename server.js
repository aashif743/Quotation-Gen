const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./database/init');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const companyRoutes = require('./routes/companies');
const quotationRoutes = require('./routes/quotations');

app.use('/api/companies', companyRoutes);
app.use('/api/quotations', quotationRoutes);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

async function startServer() {
  try {
    console.log('🔄 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized successfully!');

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📱 API available at http://localhost:${PORT}/api`);
      if (process.env.NODE_ENV === 'production') {
        console.log(`🌐 Web app available at http://localhost:${PORT}`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();