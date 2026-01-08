const { initializeDatabase } = require('./database/init');

async function setup() {
  console.log('🚀 Setting up Quotation System...\n');
  
  try {
    console.log('📦 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized successfully!\n');
    
    console.log('🎉 Setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Start the client: cd client && npm start');
    console.log('3. Open http://localhost:3000 in your browser');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error('\nPlease check:');
    console.error('1. MySQL is running');
    console.error('2. Database credentials in .env file');
    console.error('3. Database permissions');
    process.exit(1);
  }
}

setup();