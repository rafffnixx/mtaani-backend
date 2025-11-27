const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');
const auth = require('../middleware/auth');

// GET /api/checkout/:orderId - Load order details for checkout
router.get('/:orderId', auth, checkoutController.getCheckoutDetails);

// POST /api/checkout/:orderId/payment - Process payment for order
router.post('/:orderId/payment', auth, checkoutController.processPayment);

// GET /api/checkout/:orderId/payment/status - Check payment status
router.get('/:orderId/payment/status', auth, checkoutController.getPaymentStatus);

module.exports = router;