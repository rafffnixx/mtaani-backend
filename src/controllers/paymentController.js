const pool = require('../../config/dbb');

// Get user's payment methods
const getPaymentMethods = async (req, res) => {
  try {
    console.log('🔄 Fetching payment methods for user:', req.user.id);
    
    const methods = await pool.query(
      `SELECT 
        id,
        type,
        provider,
        last_four,
        is_default,
        is_active,
        created_at,
        updated_at
       FROM payment_methods 
       WHERE user_id = $1 AND is_active = true 
       ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );

    console.log('✅ Payment methods fetched:', methods.rows.length);

    res.json({ 
      success: true, 
      methods: methods.rows 
    });

  } catch (error) {
    console.error('❌ Get payment methods error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch payment methods' 
    });
  }
};

// Get default payment method
const getDefaultPaymentMethod = async (req, res) => {
  try {
    console.log('🔄 Fetching default payment method for user:', req.user.id);
    
    const result = await pool.query(
      `SELECT 
        id,
        type,
        provider,
        last_four,
        is_default
       FROM payment_methods 
       WHERE user_id = $1 AND is_default = true AND is_active = true`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        method: null,
        message: 'No default payment method set'
      });
    }

    console.log('✅ Default payment method found');

    res.json({
      success: true,
      method: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Get default payment method error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch default payment method'
    });
  }
};

// Set default payment method
const setDefaultPaymentMethod = async (req, res) => {
  const { id } = req.params;

  try {
    console.log('🔄 Setting default payment method:', { userId: req.user.id, methodId: id });

    // Verify the payment method belongs to the user
    const methodCheck = await pool.query(
      'SELECT id FROM payment_methods WHERE id = $1 AND user_id = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (methodCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment method not found'
      });
    }

    await pool.query('BEGIN');
    
    // Remove default from all methods
    await pool.query(
      'UPDATE payment_methods SET is_default = false WHERE user_id = $1',
      [req.user.id]
    );
    
    // Set new default
    await pool.query(
      'UPDATE payment_methods SET is_default = true WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    
    await pool.query('COMMIT');

    console.log('✅ Default payment method updated successfully');

    res.json({ 
      success: true, 
      message: 'Default payment method updated successfully' 
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Set default payment method error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update default payment method' 
    });
  }
};

// Add M-Pesa payment method
const addMpesaPaymentMethod = async (req, res) => {
  const { phone } = req.body;

  try {
    console.log('🔄 Adding M-Pesa payment method:', { userId: req.user.id, phone });

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    // Validate phone format
    const cleanedPhone = phone.replace(/\D/g, '');
    if (cleanedPhone.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid phone number'
      });
    }

    // Check if M-Pesa already exists for this user
    const existingMpesa = await pool.query(
      'SELECT id FROM payment_methods WHERE user_id = $1 AND type = $2 AND is_active = true',
      [req.user.id, 'mpesa']
    );

    if (existingMpesa.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'M-Pesa payment method already exists'
      });
    }

    // Check if user has any payment methods to determine if this should be default
    const existingMethods = await pool.query(
      'SELECT id FROM payment_methods WHERE user_id = $1 AND is_active = true',
      [req.user.id]
    );

    const isDefault = existingMethods.rows.length === 0;

    await pool.query('BEGIN');

    // Insert new M-Pesa payment method
    const result = await pool.query(
      `INSERT INTO payment_methods 
        (user_id, type, provider, last_four, is_default, is_active) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, type, provider, last_four, is_default, created_at`,
      [
        req.user.id,
        'mpesa',
        'M-Pesa',
        cleanedPhone.slice(-4),
        isDefault,
        true
      ]
    );

    await pool.query('COMMIT');

    console.log('✅ M-Pesa payment method added successfully');

    res.status(201).json({
      success: true,
      message: 'M-Pesa payment method added successfully',
      method: result.rows[0]
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Add M-Pesa payment method error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to add M-Pesa payment method'
    });
  }
};

// Add card payment method
const addCardPaymentMethod = async (req, res) => {
  const { cardNumber, expiryMonth, expiryYear, cvv, cardholderName } = req.body;

  try {
    console.log('🔄 Adding card payment method for user:', req.user.id);

    // Basic validation
    if (!cardNumber || !expiryMonth || !expiryYear || !cvv || !cardholderName) {
      return res.status(400).json({
        success: false,
        error: 'All card details are required'
      });
    }

    // Validate card number (basic check)
    const cleanedCardNumber = cardNumber.replace(/\D/g, '');
    if (cleanedCardNumber.length < 13) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid card number'
      });
    }

    // In a real application, you would:
    // 1. Validate the card with a payment processor
    // 2. Tokenize the card details
    // 3. Store only the token and last 4 digits

    // For now, we'll just store the last 4 digits
    const lastFour = cleanedCardNumber.slice(-4);
    const cardType = getCardType(cleanedCardNumber);

    // Check if user has any payment methods to determine if this should be default
    const existingMethods = await pool.query(
      'SELECT id FROM payment_methods WHERE user_id = $1 AND is_active = true',
      [req.user.id]
    );

    const isDefault = existingMethods.rows.length === 0;

    await pool.query('BEGIN');

    const result = await pool.query(
      `INSERT INTO payment_methods 
        (user_id, type, provider, last_four, is_default, is_active, metadata) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, type, provider, last_four, is_default, created_at`,
      [
        req.user.id,
        'card',
        cardType,
        lastFour,
        isDefault,
        true,
        JSON.stringify({
          cardholder_name: cardholderName,
          expiry_month: expiryMonth,
          expiry_year: expiryYear
        })
      ]
    );

    await pool.query('COMMIT');

    console.log('✅ Card payment method added successfully');

    res.status(201).json({
      success: true,
      message: 'Card payment method added successfully',
      method: result.rows[0]
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Add card payment method error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to add card payment method'
    });
  }
};

// Delete payment method
const deletePaymentMethod = async (req, res) => {
  const { id } = req.params;

  try {
    console.log('🔄 Deleting payment method:', { userId: req.user.id, methodId: id });

    // Check if payment method exists and belongs to user
    const methodCheck = await pool.query(
      'SELECT id, is_default FROM payment_methods WHERE id = $1 AND user_id = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (methodCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment method not found'
      });
    }

    const method = methodCheck.rows[0];

    // Prevent deleting default payment method
    if (method.is_default) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete default payment method. Set another method as default first.'
      });
    }

    // Soft delete by setting is_active to false
    await pool.query(
      'UPDATE payment_methods SET is_active = false WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    console.log('✅ Payment method deleted successfully');

    res.json({ 
      success: true, 
      message: 'Payment method deleted successfully' 
    });

  } catch (error) {
    console.error('❌ Delete payment method error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete payment method' 
    });
  }
};

// Helper function to determine card type
const getCardType = (cardNumber) => {
  // Simple card type detection
  if (/^4/.test(cardNumber)) return 'Visa';
  if (/^5[1-5]/.test(cardNumber)) return 'Mastercard';
  if (/^3[47]/.test(cardNumber)) return 'American Express';
  if (/^6(?:011|5)/.test(cardNumber)) return 'Discover';
  return 'Unknown';
};

module.exports = {
  getPaymentMethods,
  getDefaultPaymentMethod,
  setDefaultPaymentMethod,
  addMpesaPaymentMethod,
  addCardPaymentMethod,
  deletePaymentMethod
};