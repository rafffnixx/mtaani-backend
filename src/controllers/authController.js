// backend/src/controllers/authController.js
const pool = require('../../config/dbb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// POST /api/auth/register
// backend/src/controllers/authController.js
const registerUser = async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`=== 🚀 REGISTRATION REQUEST ${requestId} START ===`);
  
  const { name, phone, password, location, role = 'client' } = req.body;
  
  console.log(`📥 [${requestId}] Request body received:`, { 
    name, 
    phone, 
    password: password ? `[PRESENT, ${password.length} chars]` : '[MISSING]',
    role,
    location: location ? '[PRESENT]' : '[MISSING]'
  });
  
  try {
    // Validate required fields
    if (!name || !phone || !password) {
      console.log(`❌ [${requestId}] Validation failed - missing fields`);
      return res.status(400).json({
        success: false,
        error: 'Name, phone, and password are required'
      });
    }

    console.log(`🔍 [${requestId}] Checking for existing user with phone: ${phone}`);
    const existingUser = await pool.query(
      'SELECT id, name FROM users WHERE phone = $1',
      [phone]
    );

    if (existingUser.rows.length > 0) {
      const existing = existingUser.rows[0];
      console.log(`❌ [${requestId}] User already exists:`, {
        existingId: existing.id,
        existingName: existing.name,
        existingPhone: phone
      });
      return res.status(400).json({
        success: false,
        error: `Phone number ${phone} is already registered to ${existing.name}`
      });
    }

    console.log(`✅ [${requestId}] No duplicate found, proceeding...`);

    // Handle location
    let locationData = {};
    if (location) {
      try {
        locationData = typeof location === 'string' ? JSON.parse(location) : location;
        console.log(`📍 [${requestId}] Location data:`, JSON.stringify(locationData));
      } catch (e) {
        console.log(`📍 [${requestId}] Location parse failed, using empty object`);
        locationData = {};
      }
    }
    
    console.log(`🔐 [${requestId}] Hashing password...`);
    const hashedPassword = await bcrypt.hash(password, 10);
    
    console.log(`💾 [${requestId}] Executing database insert...`);
    const insertQuery = `
      INSERT INTO users (name, phone, password, location, role) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING id, name, phone, role, location, created_at
    `;
    
    console.log(`📝 [${requestId}] Insert data:`, {
      name,
      phone,
      role,
      location: locationData
    });
    
    const result = await pool.query(insertQuery, [
      name, 
      phone, 
      hashedPassword, 
      JSON.stringify(locationData), 
      role
    ]);

    const user = result.rows[0];
    console.log(`✅ [${requestId}] Database insert successful:`, {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      created_at: user.created_at
    });
    
    // Parse location for response
    let userLocation = {};
    try {
      userLocation = typeof user.location === 'string' 
        ? JSON.parse(user.location) 
        : user.location;
    } catch (e) {
      console.log(`📍 [${requestId}] Response location parse failed`);
    }

    console.log(`🎫 [${requestId}] Generating JWT token...`);
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'fallback-secret-for-development',
      { expiresIn: '7d' }
    );

    const response = {
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        location: userLocation,
        created_at: user.created_at
      }
    };
    
    console.log(`📤 [${requestId}] Sending success response:`, {
      userId: user.id,
      userName: user.name,
      userPhone: user.phone
    });
    
    console.log(`=== 🎉 REGISTRATION REQUEST ${requestId} COMPLETE ===`);
    res.status(201).json(response);
    
  } catch (err) {
    console.error(`❌ [${requestId}] REGISTRATION FAILED:`, err.message);
    console.error(`📚 [${requestId}] Error details:`, {
      code: err.code,
      detail: err.detail,
      constraint: err.constraint
    });
    
    console.log(`=== 💥 REGISTRATION REQUEST ${requestId} FAILED ===`);
    
    let errorMessage = 'Failed to register user';
    if (err.code === '23505') { // Unique violation
      errorMessage = 'Phone number already exists';
    }
    
    res.status(500).json({ 
      success: false,
      error: errorMessage + ': ' + err.message 
    });
  }
};

const loginUser = async (req, res) => {
  const { phone, password } = req.body;
  
  console.log('📥 Received login request for phone:', phone);
  
  try {
    const result = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    
    if (result.rows.length === 0) {
      console.log('❌ Login failed: User not found for phone:', phone);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid phone number or password' 
      });
    }

    const user = result.rows[0];
    console.log('🔍 Found user:', user.id);
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('❌ Login failed: Invalid password for user:', user.id);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid phone number or password' 
      });
    }

    // Parse location for response
    let userLocation = user.location;
    try {
      userLocation = JSON.parse(user.location);
    } catch (e) {
      console.log('Location parse in login failed:', e.message);
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'your-fallback-secret-change-in-production',
      { expiresIn: '7d' }
    );

    console.log('✅ Login successful for user:', user.id);
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        location: userLocation,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to login: ' + err.message 
    });
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log('📥 Fetching profile for user:', userId);
    
    const result = await pool.query(
      'SELECT id, name, phone, role, location, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = result.rows[0];
    
    // Parse location for response
    let userLocation = user.location;
    try {
      userLocation = JSON.parse(user.location);
    } catch (e) {
      console.log('Location parse in profile failed:', e.message);
    }

    console.log('✅ Profile fetched successfully for user:', userId);
    
    res.json({
      success: true,
      user: {
        ...user,
        location: userLocation
      }
    });

  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile: ' + error.message
    });
  }
};

// Test endpoint to see all users (for debugging)
const getTestUsers = async (req, res) => {
  try {
    console.log('📥 Fetching all users for testing...');
    
    const result = await pool.query(
      'SELECT id, name, phone, role, location, created_at FROM users ORDER BY created_at DESC'
    );
    
    // Parse locations for each user
    const users = result.rows.map(user => {
      let location = user.location;
      try {
        location = JSON.parse(user.location);
      } catch (e) {
        console.log('Location parse for user failed:', user.id, e.message);
      }
      return {
        ...user,
        location
      };
    });

    console.log('✅ Retrieved', users.length, 'users');
    
    res.json({
      success: true,
      users,
      count: users.length
    });
  } catch (error) {
    console.error('❌ Get test users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users: ' + error.message
    });
  }
};

const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  console.log('📥 Changing password for user:', userId);
  
  try {
    // Find user
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      console.log('❌ Password change failed: Invalid current password for user:', userId);
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedNewPassword, userId]
    );

    console.log('✅ Password changed successfully for user:', userId);
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (err) {
    console.error('❌ Change password error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to change password: ' + err.message
    });
  }
};

// Forgot Password - Send OTP
const forgotPassword = async (req, res) => {
  const { phone } = req.body;

  try {
    console.log('🔄 Forgot password request for phone:', phone);

    // Find user by phone
    const userResult = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    
    if (userResult.rows.length === 0) {
      console.log('❌ Forgot password failed: Phone not found:', phone);
      return res.status(404).json({
        success: false,
        error: 'Phone number not found'
      });
    }

    const user = userResult.rows[0];
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create password_resets table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL UNIQUE,
        otp VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Store OTP in database
    await pool.query(
      'INSERT INTO password_resets (phone, otp, expires_at) VALUES ($1, $2, $3) ON CONFLICT (phone) DO UPDATE SET otp = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP',
      [phone, otp, otpExpires]
    );

    // In production, you would send the OTP via SMS (Twilio, etc.)
    console.log(`📱 OTP for ${phone}: ${otp} (Expires: ${otpExpires})`);

    // For development, we'll return the OTP
    res.json({
      success: true,
      message: 'OTP sent successfully',
      // Remove this in production - only for development
      otp: process.env.NODE_ENV === 'production' ? undefined : otp
    });

  } catch (err) {
    console.error('❌ Forgot password error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to process forgot password request: ' + err.message
    });
  }
};

// Verify OTP
const verifyResetOTP = async (req, res) => {
  const { phone, otp } = req.body;

  try {
    console.log('🔄 Verifying OTP for phone:', phone);

    // Find valid OTP
    const otpResult = await pool.query(
      'SELECT * FROM password_resets WHERE phone = $1 AND otp = $2 AND expires_at > NOW()',
      [phone, otp]
    );

    if (otpResult.rows.length === 0) {
      console.log('❌ OTP verification failed for phone:', phone);
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OTP'
      });
    }

    console.log('✅ OTP verified successfully for phone:', phone);
    
    res.json({
      success: true,
      message: 'OTP verified successfully'
    });

  } catch (err) {
    console.error('❌ Verify OTP error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to verify OTP: ' + err.message
    });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  const { phone, otp, newPassword } = req.body;

  try {
    console.log('🔄 Resetting password for phone:', phone);

    // Verify OTP first
    const otpResult = await pool.query(
      'SELECT * FROM password_resets WHERE phone = $1 AND otp = $2 AND expires_at > NOW()',
      [phone, otp]
    );

    if (otpResult.rows.length === 0) {
      console.log('❌ Password reset failed: Invalid OTP for phone:', phone);
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OTP'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await pool.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE phone = $2',
      [hashedPassword, phone]
    );

    // Delete used OTP
    await pool.query('DELETE FROM password_resets WHERE phone = $1', [phone]);

    console.log('✅ Password reset successfully for phone:', phone);

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (err) {
    console.error('❌ Reset password error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password: ' + err.message
    });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  const { phone } = req.body;

  try {
    console.log('🔄 Resending OTP for phone:', phone);

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create password_resets table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL UNIQUE,
        otp VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Update OTP in database
    await pool.query(
      'INSERT INTO password_resets (phone, otp, expires_at) VALUES ($1, $2, $3) ON CONFLICT (phone) DO UPDATE SET otp = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP',
      [phone, otp, otpExpires]
    );

    console.log(`📱 New OTP for ${phone}: ${otp} (Expires: ${otpExpires})`);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      // Remove this in production
      otp: process.env.NODE_ENV === 'production' ? undefined : otp
    });

  } catch (err) {
    console.error('❌ Resend OTP error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to resend OTP: ' + err.message
    });
  }
};

// Test endpoint to check if auth routes are working
const testAuth = async (req, res) => {
  try {
    console.log('✅ Auth routes are working correctly');
    res.json({
      success: true,
      message: 'Auth controller is working!',
      timestamp: new Date().toISOString(),
      endpoints: [
        'POST /register',
        'POST /login', 
        'GET /profile',
        'GET /test-users',
        'POST /change-password',
        'POST /forgot-password',
        'POST /verify-otp',
        'POST /reset-password',
        'POST /resend-otp'
      ]
    });
  } catch (error) {
    console.error('❌ Test auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Test failed: ' + error.message
    });
  }
};

module.exports = { 
  registerUser, 
  loginUser, 
  getProfile,
  getTestUsers,
  changePassword,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  resendOTP,
  testAuth
};