// backend/src/routes/dealerOrders.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const {
  acceptOrder,
  updateOrderStatus,
  getMyOrders,
  getAvailableOrders,
  getOrderDetails
} = require('../controllers/agentOrderController');

// Dealer order management routes
router.get('/my-orders', requireAuth, getMyOrders);
router.get('/available', requireAuth, getAvailableOrders);
router.get('/:orderId', requireAuth, getOrderDetails);
router.post('/:orderId/accept', requireAuth, acceptOrder);
router.patch('/:orderId/status', requireAuth, updateOrderStatus);

module.exports = router;