const JWTUtil = require('../../utils/jwt');
const pool = require('../../config/db');

const adminAuth = async (req, res, next) => {
  try {
    const token = JWTUtil.extractToken(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    // Verify JWT token
    const decoded = JWTUtil.verifyToken(token);
    
    // Check if token is for admin
    if (decoded.type !== 'admin') {
      return res.status(401).json({
        success: false,
        error: 'Invalid admin token'
      });
    }

    // Verify admin still exists and is active
    const result = await pool.query(
      'SELECT id, name, email, role, is_active FROM admin_users WHERE id = $1 AND is_active = TRUE',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Admin account not found or inactive'
      });
    }

    const admin = result.rows[0];

    // Add admin info to request
    req.admin = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role
    };

    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    
    if (error.message === 'Invalid token') {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error during authentication'
    });
  }
};

// Middleware for role-based access
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

module.exports = { adminAuth, requireRole };