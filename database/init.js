const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function initializeDatabase() {
  try {
    console.log('🔄 Starting database initialization...');

    // The schema file will handle dropping and creating tables.
    // We read the entire file and execute it as a single block.
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📝 Applying schema...');
    await db.query(schema);
    console.log('🎉 Database schema applied successfully!');

  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  }
}

// Allow running this script directly from the command line
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('Closing database connection.');
      db.end();
    })
    .catch(err => {
      console.error('An unexpected error occurred during initialization:', err);
      db.end();
      process.exit(1);
    });
}

module.exports = { initializeDatabase };