// src/routes/paymentRoutes.js - UPDATED VERSION
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Simple mock auth middleware (for testing without real auth)
const mockAuth = (req, res, next) => {
  req.user = {
    id: 43,  // ← CHANGE FROM 1 TO 43
    name: 'kiki 0754545454',
    email: 'kiki@example.com',
    role: 'client'  // Note: Your DB shows 'client' not 'customer'
  };
  console.log('🔐 Mock auth: User ID', req.user.id);
  next();
};

const mockAdmin = (req, res, next) => {
  req.user = {
    id: 43,  // ← Optional: Keep as 43 or use a different admin ID
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin'
  };
  console.log('👑 Mock admin auth');
  next();
};

// TEST ROUTE (no auth needed)
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Payment routes are working!',
    timestamp: new Date().toISOString()
  });
});

// Payment methods routes
router.get('/methods', mockAuth, paymentController.getPaymentMethods);
router.get('/methods/default', mockAuth, paymentController.getDefaultPaymentMethod);
router.post('/methods/mpesa', mockAuth, paymentController.addMpesaPaymentMethod);
router.post('/methods/card', mockAuth, paymentController.addCardPaymentMethod);
router.put('/methods/:id/default', mockAuth, paymentController.setDefaultPaymentMethod);
router.delete('/methods/:id', mockAuth, paymentController.deletePaymentMethod);

// Simulation payment system
router.post('/initiate', mockAuth, paymentController.initiatePaymentWithSimulation);
router.post('/verify-code', mockAuth, paymentController.verifyPaymentCode);
router.get('/status/:order_id', mockAuth, paymentController.checkPaymentStatus);
router.get('/history', mockAuth, paymentController.getPaymentHistory);

// Admin routes
router.get('/admin/pending', mockAdmin, paymentController.getPendingPayments);
router.post('/admin/:payment_id/confirm', mockAdmin, paymentController.confirmPayment);
router.post('/admin/:payment_id/reject', mockAdmin, paymentController.rejectPayment);

// Simulation (for testing)
router.post('/simulate/mpesa', mockAuth, paymentController.simulateMpesaStkPush);

// Refunds
router.post('/refund/:payment_id', mockAuth, paymentController.refundPayment);

module.exports = router;