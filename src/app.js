// ADD THESE LINES AT THE VERY TOP
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// DEBUG: Check environment variables
console.log('🔍 Environment Variables:', {
  DB_HOST: process.env.DB_HOST ? '✅ Loaded' : '❌ Missing',
  DB_USER: process.env.DB_USER ? '✅ Loaded' : '❌ Missing', 
  DB_NAME: process.env.DB_NAME ? '✅ Loaded' : '❌ Missing',
  NODE_ENV: process.env.NODE_ENV ? '✅ Loaded' : '❌ Missing'
});

const express = require('express');
const cors = require('cors');
const pool = require('../config/dbb'); // Keep using dbb for now

// COMPREHENSIVE DEBUG LOGGING

const agentRoutes = require('./routes/agentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const agentOrdersRoutes = require('./routes/agentOrdersRoutes');
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const productRoutes = require('./routes/products');
const homeRoute = require('./routes/homeRoute');
const cartRoutes = require('./routes/cartRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

app.use('/api/agents', agentRoutes);
app.use('/api/agent-orders', agentOrdersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/home', homeRoute);
app.use('/api/cart', cartRoutes);
app.use('/api/payments', paymentRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'Mtaani Gas backend is running' });
});

app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ dbTime: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));