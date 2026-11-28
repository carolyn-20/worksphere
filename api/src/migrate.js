const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '../../db/migrations/001_init.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Database schema is ready');
  } finally {
    await pool.end();
  }
}

migrate().catch(error => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
});
