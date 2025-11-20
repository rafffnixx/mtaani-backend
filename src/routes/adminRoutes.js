const express = require('express');
const router = express.Router();
const { assignOrderToCandidates, verifyAgent, getDashboardStats } = require('../controllers/adminController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

router.post('/assign-order-candidates/:orderId', requireAuth, requireAdmin, assignOrderToCandidates);
router.patch('/verify-agent/:id', requireAuth, requireAdmin, verifyAgent);
router.get('/dashboard', requireAuth, requireAdmin, getDashboardStats);

module.exports = router;
