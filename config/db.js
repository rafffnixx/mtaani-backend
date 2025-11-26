const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { 
    rejectUnauthorized: false 
  } : false
});

console.log('🔧 Database Configuration:', {
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  ssl: process.env.DB_SSL === 'true' ? 'enabled' : 'disabled',
  node_env: process.env.NODE_ENV
});

// Test connection immediately
pool.query('SELECT NOW()')
  .then((result) => {
    console.log('✅ Database connection successful. Current time:', result.rows[0].now);
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });

pool.on('error', (err) => {
  console.error('❌ Database pool error:', err.message);
});

module.exports = pool;