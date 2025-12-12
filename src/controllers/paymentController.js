const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const pool = require('../../config/db');

class PaymentController {
  // ===========================================
  // PAYMENT METHODS MANAGEMENT
  // ===========================================

  // Get payment methods
  getPaymentMethods = async (req, res) => {
    try {
      console.log('🔄 Fetching payment methods for user:', req.user.id);
      
      const methods = await pool.query(
        `SELECT 
          id,
          method_type as type,
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
  getDefaultPaymentMethod = async (req, res) => {
    try {
      console.log('🔄 Fetching default payment method for user:', req.user.id);
      
      const result = await pool.query(
        `SELECT 
          id,
          method_type as type,
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
  setDefaultPaymentMethod = async (req, res) => {
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
  addMpesaPaymentMethod = async (req, res) => {
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

      // Format phone (254XXXXXXXXX)
      let formattedPhone = cleanedPhone;
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
      } else if (!formattedPhone.startsWith('254')) {
        formattedPhone = '254' + formattedPhone;
      }

      // Check if M-Pesa already exists for this user
      const existingMpesa = await pool.query(
        'SELECT id FROM payment_methods WHERE user_id = $1 AND method_type = $2 AND is_active = true',
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
          (user_id, method_type, provider, last_four, is_default, is_active, details) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id, method_type as type, provider, last_four, is_default, created_at`,
        [
          req.user.id,
          'mpesa',
          'M-Pesa',
          formattedPhone.slice(-4),
          isDefault,
          true,
          JSON.stringify({ phone: formattedPhone })
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
  addCardPaymentMethod = async (req, res) => {
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

      // Validate expiry
      const currentYear = new Date().getFullYear() % 100;
      const currentMonth = new Date().getMonth() + 1;
      
      if (expiryYear < currentYear || (expiryYear === currentYear && expiryMonth < currentMonth)) {
        return res.status(400).json({
          success: false,
          error: 'Card has expired'
        });
      }

      // For simulation - in production you would tokenize with a payment gateway
      const lastFour = cleanedCardNumber.slice(-4);
      const cardType = this.getCardType(cleanedCardNumber);

      // Check if user has any payment methods to determine if this should be default
      const existingMethods = await pool.query(
        'SELECT id FROM payment_methods WHERE user_id = $1 AND is_active = true',
        [req.user.id]
      );

      const isDefault = existingMethods.rows.length === 0;

      await pool.query('BEGIN');

      const result = await pool.query(
        `INSERT INTO payment_methods 
          (user_id, method_type, provider, last_four, is_default, is_active, details) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id, method_type as type, provider, last_four, is_default, created_at`,
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
            expiry_year: expiryYear,
            masked_card: `${'*'.repeat(cleanedCardNumber.length - 4)}${lastFour}`
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
  deletePaymentMethod = async (req, res) => {
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

  // ===========================================
  // PAYMENT SIMULATION SYSTEM - FIXED VERSION
  // ===========================================

  // INITIATE PAYMENT WITH SIMULATION - FIXED
  initiatePaymentWithSimulation = async (req, res) => {
    const { order_id, payment_method_id, mpesa_phone } = req.body;
    const user_id = req.user.id;

    try {
      console.log('💰 Initiating payment with simulation:', { 
        order_id, 
        payment_method_id,
        user_id 
      });

      // 1. Validate order
      console.log('🔍 Step 1: Validating order...');
      const orderResult = await pool.query(
        `SELECT id, user_id, total_amount, payment_status 
         FROM orders WHERE id = $1 AND user_id = $2`,
        [order_id, user_id]
      );

      if (orderResult.rows.length === 0) {
        console.log('❌ Order not found or does not belong to user');
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      const order = orderResult.rows[0];
      console.log('✅ Order found:', { 
        order_id: order.id, 
        total_amount: order.total_amount,
        payment_status: order.payment_status 
      });

      // Check if already paid
      if (order.payment_status === 'paid') {
        console.log('❌ Order is already paid');
        return res.status(400).json({
          success: false,
          error: 'Order is already paid'
        });
      }

      // 2. Validate payment method exists and belongs to user
      console.log('🔍 Step 2: Validating payment method ID', payment_method_id, 'for user', user_id);
      const paymentMethodResult = await pool.query(
        `SELECT 
          id,
          method_type,
          provider,
          last_four,
          details,
          is_active
         FROM payment_methods 
         WHERE id = $1 AND user_id = $2 AND is_active = true`,
        [payment_method_id, user_id]
      );

      if (paymentMethodResult.rows.length === 0) {
        console.log('❌ Payment method not found or not active');
        return res.status(404).json({
          success: false,
          error: 'Payment method not found or not active'
        });
      }

      const paymentMethod = paymentMethodResult.rows[0];
      const payment_method_type = paymentMethod.method_type;

      console.log('✅ Found payment method:', {
        id: paymentMethod.id,
        type: payment_method_type,
        provider: paymentMethod.provider,
        is_active: paymentMethod.is_active
      });

      // 3. Generate simulation code
      console.log('🔍 Step 3: Generating simulation code...');
      const simulationCode = Math.floor(1000 + Math.random() * 9000).toString();
      const simulationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      // 4. Extract phone number for M-Pesa if needed
      let formattedPhone = null;
      if (payment_method_type === 'mpesa') {
        console.log('📱 Extracting M-Pesa phone number...');
        try {
          // Handle both string and object details
          let detailsObj;
          if (typeof paymentMethod.details === 'string') {
            detailsObj = JSON.parse(paymentMethod.details || '{}');
          } else if (paymentMethod.details && typeof paymentMethod.details === 'object') {
            detailsObj = paymentMethod.details;
          } else {
            detailsObj = {};
          }
          
          formattedPhone = detailsObj.phone;
          
          if (!formattedPhone && mpesa_phone) {
            // Use provided phone if not in details
            let cleaned = mpesa_phone.replace(/\D/g, '');
            if (cleaned.startsWith('0')) {
              formattedPhone = '254' + cleaned.substring(1);
            } else if (!cleaned.startsWith('254')) {
              formattedPhone = '254' + cleaned;
            } else {
              formattedPhone = cleaned;
            }
          }
          
          console.log('✅ M-Pesa phone:', formattedPhone);
        } catch (error) {
          console.error('❌ Error extracting phone:', error.message);
          formattedPhone = '254700000000'; // Default fallback
        }
      }

      // 5. Create transaction ID
      const transactionId = `SIM${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      
      console.log('🔍 Step 4: Starting database transaction...');
      await pool.query('BEGIN');

      try {
        // 6. Insert payment record with status 'simulation_pending'
        console.log('🔍 Step 5: Inserting payment record...');
        const paymentResult = await pool.query(
          `INSERT INTO payments 
            (order_id, user_id, payment_method, payment_method_id, amount, status, transaction_id,
             mpesa_phone_number, simulation_code, simulation_expires_at,
             mpesa_merchant_request_id, mpesa_checkout_request_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id, simulation_code, transaction_id, payment_method, amount`,
          [
            order.id,
            order.user_id,
            payment_method_type,
            payment_method_id,
            order.total_amount,
            'simulation_pending', // IMPORTANT: This must match verifyPaymentCode query
            transactionId,
            formattedPhone,
            simulationCode,
            simulationExpires,
            `MR${Date.now()}`,
            `CR${Date.now()}`,
            new Date()
          ]
        );

        const newPayment = paymentResult.rows[0];
        console.log('✅ Payment record inserted:', newPayment);

        // 7. Update order
        console.log('🔍 Step 6: Updating order...');
        await pool.query(
          `UPDATE orders 
           SET payment_id = $1,
               payment_method = $2,
               payment_method_id = $3,
               payment_status = 'pending',
               updated_at = NOW()
           WHERE id = $4`,
          [newPayment.id, payment_method_type, payment_method_id, order.id]
        );

        await pool.query('COMMIT');
        console.log('✅ Transaction committed successfully');

        console.log('✅ Payment initiated with simulation code:', simulationCode);

        res.json({
          success: true,
          message: 'Payment initiated. Enter the simulation code to confirm.',
          payment: {
            id: newPayment.id,
            transaction_id: newPayment.transaction_id,
            simulation_code: simulationCode,
            payment_method: newPayment.payment_method,
            amount: newPayment.amount,
            expires_in: 600
          }
        });

      } catch (dbError) {
        await pool.query('ROLLBACK');
        console.error('❌ Database error during payment initiation:', dbError.message);
        throw dbError;
      }

    } catch (error) {
      console.error('❌ Initiate payment error:', error.message);
      console.error('❌ Error stack:', error.stack);
      
      res.status(500).json({
        success: false,
        error: 'Payment initiation failed',
        details: error.message
      });
    }
  };

  // VERIFY PAYMENT CODE - COMPLETELY FIXED VERSION
  verifyPaymentCode = async (req, res) => {
    const { payment_id, entered_code } = req.body;
    const user_id = req.user.id;

    console.log('🔐 [VERIFY START]', { payment_id, entered_code, user_id });

    const client = await pool.connect();

    try {
      // Debug: Check payment exists first
      console.log('🔍 [DEBUG 1] Checking payment exists...');
      const debugQuery = await client.query(
        'SELECT id, status, user_id, simulation_code, simulation_expires_at, verification_attempts FROM payments WHERE id = $1',
        [payment_id]
      );
      
      console.log('🔍 [DEBUG 1 Result]', debugQuery.rows[0]);
      
      if (debugQuery.rows.length === 0) {
        console.log('❌ [ERROR] Payment not found at all');
        return res.status(404).json({
          success: false,
          error: 'Payment not found'
        });
      }

      const debugPayment = debugQuery.rows[0];
      console.log('🔍 [DEBUG 2] Payment details:', {
        id: debugPayment.id,
        db_user_id: debugPayment.user_id,
        req_user_id: user_id,
        db_status: debugPayment.status,
        expected_status: 'simulation_pending',
        status_match: debugPayment.status === 'simulation_pending',
        user_match: debugPayment.user_id === user_id
      });

      await client.query('BEGIN');

      // 1. Get payment details with correct status
      console.log('🔍 [DEBUG 3] Running main query...');
      const paymentResult = await client.query(
        'SELECT * FROM payments WHERE id = $1 AND user_id = $2 AND status = $3',
        [payment_id, user_id, 'simulation_pending']
      );

      console.log('🔍 [DEBUG 3 Result]', {
        rowCount: paymentResult.rowCount,
        payment: paymentResult.rows[0] ? {
          id: paymentResult.rows[0].id,
          status: paymentResult.rows[0].status,
          simulation_code: paymentResult.rows[0].simulation_code
        } : null
      });

      if (paymentResult.rows.length === 0) {
        console.log('❌ [ERROR] Main query returned 0 rows!');
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Payment not found or already processed'
        });
      }

      const payment = paymentResult.rows[0];

      // 2. Check expiration
      console.log('🔍 [DEBUG 4] Checking expiration...');
      console.log('🔍 Expires at:', payment.simulation_expires_at);
      console.log('🔍 Current time:', new Date());
      const isExpired = new Date(payment.simulation_expires_at) < new Date();
      console.log('🔍 Is expired?', isExpired);
      
      if (isExpired) {
        console.log('❌ [ERROR] Payment expired');
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Simulation code has expired'
        });
      }

      // 3. Check attempts
      console.log('🔍 [DEBUG 5] Checking attempts...');
      console.log('🔍 Current attempts:', payment.verification_attempts);
      
      if (payment.verification_attempts >= 3) {
        console.log('❌ [ERROR] Too many attempts');
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Too many failed attempts'
        });
      }

      // 4. Verify code
      console.log('🔍 [DEBUG 6] Checking code...');
      console.log('🔍 DB code:', payment.simulation_code);
      console.log('🔍 Entered code:', entered_code);
      console.log('🔍 Code match?', payment.simulation_code === entered_code);
      
      if (payment.simulation_code !== entered_code) {
        console.log('❌ [ERROR] Code mismatch');
        await client.query(
          'UPDATE payments SET verification_attempts = verification_attempts + 1 WHERE id = $1',
          [payment_id]
        );
        await client.query('COMMIT');

        const remaining = 3 - (payment.verification_attempts + 1);
        return res.status(400).json({
          success: false,
          error: `Invalid code. ${remaining} attempt(s) remaining.`,
          attempts_remaining: remaining
        });
      }

      // 5. Code is correct - Mark as PAID (not processing)
      console.log('✅ [DEBUG 7] All checks passed! Proceeding to update...');
      const transactionId = `TXN${Date.now()}`;

      // Update payment to 'paid' (customer has completed payment)
      console.log('🔍 Updating payment to paid...');
      await client.query(
        'UPDATE payments SET status = $1, transaction_id = $2, completed_at = NOW() WHERE id = $3',
        ['paid', transactionId, payment_id]
      );

      // Update order payment_status to 'paid'
      console.log('🔍 Updating order payment_status to paid...');
      await client.query(
        'UPDATE orders SET payment_status = $1 WHERE id = $2',
        ['paid', payment.order_id]
      );

      // Get current order status
      const orderResult = await client.query(
        'SELECT status FROM orders WHERE id = $1',
        [payment.order_id]
      );
      
      let orderStatus = orderResult.rows[0]?.status;
      
      // If order is still 'pending' or 'pending_payment', change it to 'confirmed'
      if (orderStatus === 'pending' || orderStatus === 'pending_payment') {
        console.log('🔍 Updating order status to confirmed...');
        await client.query(
          'UPDATE orders SET status = $1 WHERE id = $2',
          ['confirmed', payment.order_id]
        );
        orderStatus = 'confirmed';
      }

      // Add to order status history
      console.log('🔍 Adding to order status history...');
      await client.query(
        'INSERT INTO order_status_history (order_id, status, changed_by, notes) VALUES ($1, $2, $3, $4)',
        [
          payment.order_id, 
          orderStatus,
          user_id, 
          `Payment completed successfully. Transaction: ${transactionId}. Amount: ${payment.amount}`
        ]
      );

      await client.query('COMMIT');
      console.log('✅ [DEBUG 8] Transaction committed successfully');

      console.log('✅ Payment verified and marked as PAID');

      res.json({
        success: true,
        message: 'Payment completed successfully!',
        payment: {
          id: payment.id,
          status: 'paid',
          payment_status: 'paid',
          order_status: orderStatus,
          transaction_id: transactionId,
          amount: payment.amount
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ [ERROR] Verify payment code error:', error.message);
      console.error('❌ Error stack:', error.stack);
      
      res.status(500).json({
        success: false,
        error: 'Payment verification failed: ' + error.message
      });
    } finally {
      client.release();
    }
  };

  // ===========================================
  // PAYMENT STATUS & HISTORY
  // ===========================================

  // CHECK PAYMENT STATUS
  checkPaymentStatus = async (req, res) => {
    const { order_id } = req.params;

    try {
      console.log('🔍 Checking payment status for order:', order_id);

      const result = await pool.query(
        `SELECT 
          o.id as order_id,
          o.payment_status,
          o.status as order_status,
          p.status as payment_record_status,
          p.transaction_id,
          p.mpesa_receipt_number,
          p.card_last_four,
          p.card_authorization_code,
          p.completed_at,
          p.simulation_code,
          p.simulation_expires_at
         FROM orders o
         LEFT JOIN payments p ON o.payment_id = p.id
         WHERE o.id = $1 AND o.user_id = $2`,
        [order_id, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      const paymentInfo = result.rows[0];

      let simulation_status = null;
      if (paymentInfo.payment_record_status === 'simulation_pending') {
        if (new Date(paymentInfo.simulation_expires_at) < new Date()) {
          simulation_status = 'expired';
        } else {
          simulation_status = 'pending_code';
        }
      }

      res.json({
        success: true,
        order_id: paymentInfo.order_id,
        payment_status: paymentInfo.payment_status,
        order_status: paymentInfo.order_status,
        payment_record_status: paymentInfo.payment_record_status,
        simulation_status: simulation_status,
        payment_details: {
          transaction_id: paymentInfo.transaction_id,
          mpesa_receipt: paymentInfo.mpesa_receipt_number,
          card_last_four: paymentInfo.card_last_four,
          card_auth: paymentInfo.card_authorization_code,
          completed_at: paymentInfo.completed_at
        }
      });

    } catch (error) {
      console.error('❌ Check payment status error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to check payment status'
      });
    }
  };

  // GET PAYMENT HISTORY
  getPaymentHistory = async (req, res) => {
    const { limit = 20, offset = 0 } = req.query;

    try {
      console.log('📊 Getting payment history for user:', req.user.id);

      const paymentsResult = await pool.query(
        `SELECT 
          p.id,
          p.order_id,
          p.payment_method,
          p.amount,
          p.status,
          p.transaction_id,
          p.mpesa_receipt_number,
          p.card_last_four,
          p.card_authorization_code,
          p.completed_at,
          o.delivery_location,
          o.status as order_status
         FROM payments p
         JOIN orders o ON p.order_id = o.id
         WHERE p.user_id = $1
         ORDER BY p.created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, parseInt(limit), parseInt(offset)]
      );

      const totalResult = await pool.query(
        'SELECT COUNT(*) as total FROM payments WHERE user_id = $1',
        [req.user.id]
      );

      res.json({
        success: true,
        payments: paymentsResult.rows,
        pagination: {
          total: parseInt(totalResult.rows[0].total),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });

    } catch (error) {
      console.error('❌ Get payment history error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch payment history'
      });
    }
  };

  // ===========================================
  // SIMULATION HELPERS
  // ===========================================

  // SIMULATE MPESA STK PUSH
  simulateMpesaStkPush = async (req, res) => {
    const { phone, amount } = req.body;

    try {
      console.log('📱 Simulating M-Pesa STK Push:', { phone, amount });

      let formattedPhone = phone.replace(/\D/g, '');
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
      }

      const simulationCode = Math.floor(1000 + Math.random() * 9000).toString();

      const simulationResponse = {
        success: true,
        message: 'M-Pesa STK Push simulated successfully',
        simulation: {
          simulation_code: simulationCode,
          MerchantRequestID: `MR${Date.now()}`,
          CheckoutRequestID: `ws_CO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ResponseCode: '0',
          ResponseDescription: 'Success. Request accepted for processing',
          CustomerMessage: `Please enter simulation code ${simulationCode} to complete payment of KES ${amount}`,
          simulated_phone: formattedPhone,
          simulated_amount: amount,
          timestamp: new Date().toISOString(),
          note: 'This is a simulation. Enter the code above in the verification screen.'
        }
      };

      res.json(simulationResponse);

    } catch (error) {
      console.error('❌ Simulate M-Pesa STK Push error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Simulation failed'
      });
    }
  };

  // ===========================================
  // ADMIN FUNCTIONS
  // ===========================================

  // Get pending payments for admin
  getPendingPayments = async (req, res) => {
    try {
      console.log('👑 Fetching pending payments for admin');

      const result = await pool.query(
        `SELECT 
          p.id,
          p.order_id,
          p.payment_method,
          p.amount,
          p.transaction_id,
          p.mpesa_receipt_number,
          p.card_authorization_code,
          p.mpesa_phone_number,
          p.created_at,
          p.completed_at,
          u.name as customer_name,
          u.phone as customer_phone,
          o.delivery_location,
          o.status as order_status
         FROM payments p
         JOIN orders o ON p.order_id = o.id
         JOIN users u ON o.user_id = u.id
         WHERE p.status = 'pending_payment'
         ORDER BY p.created_at DESC`
      );

      console.log('✅ Found', result.rows.length, 'pending payments');

      res.json({
        success: true,
        payments: result.rows,
        count: result.rows.length
      });

    } catch (error) {
      console.error('❌ Get pending payments error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch pending payments'
      });
    }
  };

  // Admin confirm payment (mark as paid)
  confirmPayment = async (req, res) => {
    const { payment_id } = req.params;
    const admin_id = req.user.id;

    try {
      console.log('👑 Admin confirming payment:', payment_id);

      const paymentResult = await pool.query(
        `SELECT 
          p.id,
          p.order_id,
          p.status,
          p.amount,
          p.payment_method,
          p.mpesa_receipt_number,
          p.card_transaction_id,
          o.user_id
         FROM payments p
         JOIN orders o ON p.order_id = o.id
         WHERE p.id = $1 AND p.status = 'pending_payment'`,
        [payment_id]
      );

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Payment not found or already processed'
        });
      }

      const payment = paymentResult.rows[0];

      await pool.query('BEGIN');

      // Update payment to completed
      await pool.query(
        `UPDATE payments 
         SET status = 'completed',
             updated_at = NOW()
         WHERE id = $1`,
        [payment_id]
      );

      // Update order to paid
      await pool.query(
        `UPDATE orders 
         SET payment_status = 'paid',
             status = 'confirmed',
             updated_at = NOW()
         WHERE id = $1`,
        [payment.order_id]
      );

      // Create status history
      await pool.query(
        `INSERT INTO order_status_history 
          (order_id, status, changed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [
          payment.order_id,
          'confirmed',
          admin_id,
          `Payment confirmed by admin. ${payment.payment_method === 'mpesa' ? `MPESA: ${payment.mpesa_receipt_number}` : `Card: ${payment.card_transaction_id}`}`
        ]
      );

      await pool.query('COMMIT');

      console.log('✅ Payment confirmed by admin');

      res.json({
        success: true,
        message: 'Payment confirmed successfully',
        payment: {
          id: payment.id,
          status: 'completed',
          order_id: payment.order_id,
          user_id: payment.user_id
        }
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('❌ Confirm payment error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Payment confirmation failed'
      });
    }
  };

  // Admin reject payment
  rejectPayment = async (req, res) => {
    const { payment_id } = req.params;
    const { reason } = req.body;
    const admin_id = req.user.id;

    try {
      console.log('👑 Admin rejecting payment:', payment_id);

      const paymentResult = await pool.query(
        `SELECT 
          p.id,
          p.order_id,
          p.status,
          o.user_id
         FROM payments p
         JOIN orders o ON p.order_id = o.id
         WHERE p.id = $1 AND p.status = 'pending_payment'`,
        [payment_id]
      );

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Payment not found or already processed'
        });
      }

      const payment = paymentResult.rows[0];

      await pool.query('BEGIN');

      // Update payment to failed
      await pool.query(
        `UPDATE payments 
         SET status = 'failed',
             updated_at = NOW()
         WHERE id = $1`,
        [payment_id]
      );

      // Update order
      await pool.query(
        `UPDATE orders 
         SET payment_status = 'failed',
             updated_at = NOW()
         WHERE id = $1`,
        [payment.order_id]
      );

      // Create status history
      await pool.query(
        `INSERT INTO order_status_history 
          (order_id, status, changed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [
          payment.order_id,
          'payment_failed',
          admin_id,
          `Payment rejected by admin. Reason: ${reason || 'Not specified'}`
        ]
      );

      await pool.query('COMMIT');

      console.log('✅ Payment rejected by admin');

      res.json({
        success: true,
        message: 'Payment rejected successfully',
        payment: {
          id: payment.id,
          status: 'failed',
          order_id: payment.order_id
        }
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('❌ Reject payment error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Payment rejection failed'
      });
    }
  };

  // REFUND PAYMENT
  refundPayment = async (req, res) => {
    const { payment_id } = req.params;
    const { reason } = req.body;

    try {
      console.log('↩️ Processing refund for payment:', payment_id);

      const paymentResult = await pool.query(
        `SELECT 
          p.id,
          p.order_id,
          p.amount,
          p.status,
          p.completed_at,
          o.user_id,
          o.status as order_status
         FROM payments p
         JOIN orders o ON p.order_id = o.id
         WHERE p.id = $1 AND p.user_id = $2 AND p.status = 'completed'`,
        [payment_id, req.user.id]
      );

      if (paymentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Payment not found or cannot be refunded'
        });
      }

      const payment = paymentResult.rows[0];

      if (['delivered', 'cancelled'].includes(payment.order_status)) {
        return res.status(400).json({
          success: false,
          error: `Cannot refund order with status: ${payment.order_status}`
        });
      }

      await pool.query('BEGIN');

      await pool.query(
        `UPDATE payments 
         SET status = 'refunded',
             refunded_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [payment_id]
      );

      await pool.query(
        `UPDATE orders 
         SET status = 'cancelled',
             payment_status = 'refunded',
             updated_at = NOW()
         WHERE id = $1`,
        [payment.order_id]
      );

      await pool.query(
        `INSERT INTO order_status_history 
          (order_id, status, changed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [
          payment.order_id,
          'refunded',
          req.user.id,
          `Payment refunded. Reason: ${reason || 'Not specified'}`
        ]
      );

      await pool.query('COMMIT');

      console.log('✅ Payment refunded successfully');

      res.json({
        success: true,
        message: 'Refund processed successfully',
        refund: {
          payment_id: payment.id,
          order_id: payment.order_id,
          amount: payment.amount,
          refunded_at: new Date(),
          reason: reason
        }
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('❌ Refund payment error:', error.message);
      res.status(500).json({
        success: false,
        error: 'Refund failed'
      });
    }
  };

  // ===========================================
  // HELPER FUNCTIONS
  // ===========================================

  getUserMpesaPhone = async (userId) => {
    try {
      const result = await pool.query(
        `SELECT details->>'phone' as phone 
         FROM payment_methods 
         WHERE user_id = $1 AND method_type = 'mpesa' AND is_active = true
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length > 0 && result.rows[0].phone) {
        return result.rows[0].phone;
      }

      const userResult = await pool.query(
        'SELECT phone FROM users WHERE id = $1',
        [userId]
      );

      return userResult.rows[0]?.phone || '254700000000';

    } catch (error) {
      console.error('Get user M-Pesa phone error:', error);
      return '254700000000';
    }
  };

  getCardType = (cardNumber) => {
    const cleaned = cardNumber.replace(/\D/g, '');
    
    if (/^4/.test(cleaned)) return 'Visa';
    if (/^5[1-5]/.test(cleaned)) return 'Mastercard';
    if (/^3[47]/.test(cleaned)) return 'American Express';
    if (/^6(?:011|5)/.test(cleaned)) return 'Discover';
    if (/^3(?:0[0-5]|[68])/.test(cleaned)) return 'Diners Club';
    if (/^(?:2131|1800|35)/.test(cleaned)) return 'JCB';
    
    return 'Unknown';
  };
}

module.exports = new PaymentController();