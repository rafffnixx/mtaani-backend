// backend/src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');

// ✅ CORRECT: Import orderController
const orderController = require('../controllers/orderController');

// All routes require authentication
router.use(requireAuth);

// POST /api/orders - Create order from cart
router.post('/', orderController.createOrderFromCart);

// GET /api/orders - Get customer orders
router.get('/', orderController.getCustomerOrders);

// GET /api/orders/stats - Get order statistics
router.get('/stats', orderController.getOrderStats);

// GET /api/orders/:orderId - Get order details
router.get('/:orderId', orderController.getOrderDetails);

// GET /api/orders/status/counts - Get order status counts
router.get('/status/counts', orderController.getOrderStatusCounts);

// PATCH /api/orders/:orderId/cancel - Cancel order
router.patch('/:orderId/cancel', orderController.cancelOrder);

module.exports = router;