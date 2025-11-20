// backend/src/routes/agent.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { 
  getAgentProfile, 
  getAgentDashboard, 
  getAgentStats,
  updateAgentProfile
} = require('../controllers/agentController');

// Agent profile and dashboard routes
router.get('/profile', requireAuth, getAgentProfile);
router.get('/dashboard', requireAuth, getAgentDashboard);
router.get('/stats', requireAuth, getAgentStats);
router.patch('/profile', requireAuth, updateAgentProfile);

module.exports = router;