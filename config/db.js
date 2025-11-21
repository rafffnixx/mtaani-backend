const { Pool } = require('pg');

// Only load .env in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

// Debug logging
console.log('🔧 Database config:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  ssl: true
});

module.exports = pool;