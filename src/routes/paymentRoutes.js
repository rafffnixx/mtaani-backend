const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const {
  getPaymentMethods,
  getDefaultPaymentMethod,
  setDefaultPaymentMethod,
  addMpesaPaymentMethod,
  addCardPaymentMethod,
  deletePaymentMethod
} = require('../controllers/paymentController');

// All routes are protected
router.get('/methods', requireAuth, getPaymentMethods);
router.get('/methods/default', requireAuth, getDefaultPaymentMethod);
router.put('/methods/:id/default', requireAuth, setDefaultPaymentMethod);
router.post('/methods/mpesa', requireAuth, addMpesaPaymentMethod);
router.post('/methods/card', requireAuth, addCardPaymentMethod);
router.delete('/methods/:id', requireAuth, deletePaymentMethod);

module.exports = router;