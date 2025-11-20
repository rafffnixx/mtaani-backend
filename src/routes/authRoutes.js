// backend/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();

// ✅ CORRECT IMPORTS
const { 
  registerUser, 
  loginUser, 
  getProfile,
  getTestUsers ,
  changePassword,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  resendOTP
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/test-users', getTestUsers); // Debug route to see all users
router.post('/change-password', requireAuth, changePassword);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-otp', verifyResetOTP);
router.post('/reset-password', resetPassword);
router.post('/resend-otp', resendOTP);

// Protected routes
router.get('/profile', requireAuth, getProfile);

module.exports = router;