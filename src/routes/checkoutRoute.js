const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');
const { requireAuth } = require('../middleware/authMiddleware'); // ✅ Import specific function

// GET /api/checkout/:orderId - Load order details for checkout
router.get('/:orderId', requireAuth, checkoutController.getCheckoutDetails);

// POST /api/checkout/:orderId/payment - Process payment for order
router.post('/:orderId/payment', requireAuth, checkoutController.processPayment);

// GET /api/checkout/:orderId/payment/status - Check payment status
router.get('/:orderId/payment/status', requireAuth, checkoutController.getPaymentStatus);

module.exports = router;