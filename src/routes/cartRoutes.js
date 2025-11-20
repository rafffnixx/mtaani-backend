const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { requireAuth } = require('../middleware/authMiddleware'); // Destructure requireAuth

// Apply auth middleware to all cart routes
router.use(requireAuth);

// GET /api/cart - Get user's cart
router.get('/', cartController.getCart);

// POST /api/cart - Add item to cart
router.post('/', cartController.addToCart);

// PATCH /api/cart/:cartId - Update cart item quantity
router.patch('/:cartId', cartController.updateCartItem);

// DELETE /api/cart/:cartId - Remove item from cart
router.delete('/:cartId', cartController.removeFromCart);

// DELETE /api/cart - Clear entire cart
router.delete('/', cartController.clearCart);

module.exports = router;