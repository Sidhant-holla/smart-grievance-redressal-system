// Creates all tables, views, functions and triggers by running the SQL files
// in the db/ folder in order.  Usage:  npm run db:setup
// WARNING: 01_schema.sql drops the existing tables, so all data is lost.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

process.loadEnvFile(path.join(__dirname, '..', '.env.local'));

// Order matters: views need the tables, and functions need the views.
const files = ['01_schema.sql', '02_views.sql', '03_functions_triggers.sql'];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');
    console.log(`Running ${file} ...`);
    await client.query(sql);
  }

  console.log('Database setup complete.');
  await client.end();
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
