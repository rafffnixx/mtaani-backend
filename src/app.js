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
const pool = require('../config/db'); // Fixed: using db instead of dbb

// COMPREHENSIVE DEBUG LOGGING
console.log('🚀 Starting Mtaani Gas Backend Server...');

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

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:8081',
    'https://your-frontend-domain.com' // Add your production frontend URL
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request Body:', req.body);
  }
  next();
});

// API Routes
app.use('/api/agents', agentRoutes);
app.use('/api/agent-orders', agentOrdersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/home', homeRoute);
app.use('/api/cart', cartRoutes);
app.use('/api/payments', paymentRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Mtaani Gas backend is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Database test endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    console.log('🧪 Testing database connection...');
    const result = await pool.query('SELECT NOW() as current_time, version() as postgres_version');
    console.log('✅ Database connection successful');
    res.json({ 
      success: true,
      dbTime: result.rows[0].current_time,
      postgresVersion: result.rows[0].postgres_version,
      message: 'Database connection is working'
    });
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    res.status(500).json({ 
      success: false,
      error: err.message,
      message: 'Database connection failed'
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Mtaani Gas API Server',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      testDb: '/api/test-db',
      products: '/api/products',
      home: '/api/home',
      auth: '/api/auth',
      cart: '/api/cart',
      orders: '/api/orders',
      agents: '/api/agents',
      admin: '/api/admin'
    }
  });
});

// FIXED: 404 handler - removed the problematic '*' or use proper syntax
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('💥 Global Error Handler:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🎉 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🗄️  Database test: http://localhost:${PORT}/api/test-db`);
});