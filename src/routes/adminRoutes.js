const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { adminAuth, requireRole } = require('../middleware/adminAuth');

// Public routes
router.post('/login', adminController.login);
router.post('/signup', adminController.signup);

// Protected routes (require admin authentication)
router.use(adminAuth);

// Admin profile management
router.get('/profile', adminController.getProfile);
router.put('/profile', adminController.updateProfile);

// Admin user management (super_admin only)
router.get('/admins', requireRole(['super_admin']), adminController.getAdmins);
router.put('/admins/:id', requireRole(['super_admin']), adminController.updateAdmin);
router.delete('/admins/:id', requireRole(['super_admin']), adminController.deleteAdmin);
router.post('/admins/:id/reset-password', requireRole(['super_admin']), adminController.resetAdminPassword);

// Dashboard
router.get('/stats', adminController.getStats);

// Orders management
router.get('/orders', adminController.getOrders);
router.get('/orders/:id', adminController.getOrder);
router.put('/orders/:id', adminController.updateOrder);
router.post('/orders/:id/assign', adminController.assignOrder);

// Agents management
router.get('/agents', adminController.getAgents);
router.get('/agents/:id', adminController.getAgent);

// Customers management
router.get('/customers', adminController.getCustomers);

// Analytics
router.get('/analytics', adminController.getAnalytics);

module.exports = router;