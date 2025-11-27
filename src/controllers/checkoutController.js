const pool = require('../../config/db');

class CheckoutController {
  
  // GET checkout details for an order
  async getCheckoutDetails(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;

      console.log(`🛒 Loading checkout for order: ${orderId}, user: ${userId}`);

      // Get order details with items
      const orderQuery = `
        SELECT o.*, d.business_name, d.phone as dealer_phone, 
               u.name as dealer_name, d.location as dealer_location
        FROM orders o
        LEFT JOIN dealers d ON o.assigned_dealer_id = d.id
        LEFT JOIN users u ON d.user_id = u.id
        WHERE o.id = $1 AND o.user_id = $2
      `;
      
      const orderResult = await pool.query(orderQuery, [orderId, userId]);
      const order = orderResult.rows[0];

      if (!order) {
        return res.status(404).json({ 
          success: false, 
          error: 'Order not found or access denied' 
        });
      }

      // Get order items
      const itemsQuery = `
        SELECT oi.*, p.name as product_name, p.price
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
      `;
      
      const itemsResult = await pool.query(itemsQuery, [orderId]);
      const orderItems = itemsResult.rows;

      // Get latest payment status
      const paymentQuery = `
        SELECT * FROM payments 
        WHERE order_id = $1 
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      
      const paymentResult = await pool.query(paymentQuery, [orderId]);
      const latestPayment = paymentResult.rows[0];

      // Format response
      const checkoutData = {
        order: {
          id: order.id,
          total_amount: order.total_amount,
          status: order.status,
          payment_method: order.payment_method,
          delivery_location: order.delivery_location,
          special_instructions: order.special_instructions,
          created_at: order.created_at,
          assigned_dealer: order.assigned_dealer_id ? {
            id: order.assigned_dealer_id,
            name: order.dealer_name,
            business_name: order.business_name,
            phone: order.dealer_phone,
            location: order.dealer_location
          } : null
        },
        items: orderItems,
        payment: latestPayment ? {
          method: latestPayment.payment_method,
          status: latestPayment.status,
          transaction_id: latestPayment.transaction_id,
          mpesa_code: latestPayment.mpesa_code,
          amount: latestPayment.amount,
          paid_at: latestPayment.paid_at
        } : {
          status: 'pending',
          allowed_methods: ['cash_on_delivery', 'mpesa', 'card']
        }
      };

      console.log(`✅ Checkout data loaded for order: ${orderId}`);
      res.json({ success: true, ...checkoutData });

    } catch (error) {
      console.error('❌ Error loading checkout:', error);
      res.status(500).json({ success: false, error: 'Failed to load checkout' });
    }
  }

  // POST process payment for an order
  async processPayment(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;
      const { payment_method, mpesa_phone, card_details } = req.body;

      console.log(`💳 Processing payment for order: ${orderId}, method: ${payment_method}`);

      // Verify order exists and belongs to user
      const orderQuery = `
        SELECT * FROM orders WHERE id = $1 AND user_id = $2
      `;
      const orderResult = await pool.query(orderQuery, [orderId, userId]);
      const order = orderResult.rows[0];

      if (!order) {
        return res.status(404).json({ 
          success: false, 
          error: 'Order not found' 
        });
      }

      // Check if order is already paid
      if (order.status === 'paid' || order.status === 'confirmed') {
        return res.status(400).json({ 
          success: false, 
          error: 'Order is already paid' 
        });
      }

      let paymentResult;
      let paymentStatus = 'pending';
      let transactionId = null;
      let mpesaCode = null;

      // Process based on payment method
      switch (payment_method) {
        case 'cash_on_delivery':
          paymentStatus = 'pending';
          transactionId = `COD_${orderId}_${Date.now()}`;
          paymentResult = { success: true, message: 'Cash on delivery confirmed' };
          break;

        case 'mpesa':
          if (!mpesa_phone) {
            return res.status(400).json({ 
              success: false, 
              error: 'M-Pesa phone number required' 
            });
          }
          
          // Process M-Pesa payment
          paymentResult = await this.processMpesaPayment(order, mpesa_phone);
          if (paymentResult.success) {
            paymentStatus = 'paid';
            transactionId = paymentResult.transactionId;
            mpesaCode = paymentResult.mpesaCode;
          }
          break;

        case 'card':
          // Process card payment
          paymentResult = await this.processCardPayment(order, card_details);
          if (paymentResult.success) {
            paymentStatus = 'paid';
            transactionId = paymentResult.transactionId;
          }
          break;

        default:
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid payment method' 
          });
      }

      if (!paymentResult.success) {
        return res.status(400).json({ 
          success: false, 
          error: paymentResult.error 
        });
      }

      // Update order with payment details
      await pool.query(`
        UPDATE orders 
        SET payment_method = $1, 
            status = $2,
            updated_at = $3
        WHERE id = $4
      `, [payment_method, paymentStatus === 'paid' ? 'confirmed' : 'pending_payment', new Date(), orderId]);

      // Create payment record
      const paymentInsertQuery = `
        INSERT INTO payments (
          order_id, user_id, payment_method, amount, 
          transaction_id, mpesa_code, status, paid_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      
      await pool.query(paymentInsertQuery, [
        orderId, 
        userId, 
        payment_method, 
        order.total_amount,
        transactionId,
        mpesaCode,
        paymentStatus,
        paymentStatus === 'paid' ? new Date() : null
      ]);

      console.log(`✅ Payment processed for order: ${orderId}, status: ${paymentStatus}`);

      res.json({
        success: true,
        message: paymentResult.message,
        payment: {
          method: payment_method,
          status: paymentStatus,
          transaction_id: transactionId,
          mpesa_code: mpesaCode,
          amount: order.total_amount
        },
        order: {
          id: orderId,
          status: paymentStatus === 'paid' ? 'confirmed' : 'pending_payment'
        }
      });

    } catch (error) {
      console.error('❌ Payment processing error:', error);
      res.status(500).json({ success: false, error: 'Payment processing failed' });
    }
  }

  // GET payment status for an order
  async getPaymentStatus(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;

      const paymentQuery = `
        SELECT * FROM payments 
        WHERE order_id = $1 AND user_id = $2
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      
      const paymentResult = await pool.query(paymentQuery, [orderId, userId]);
      const payment = paymentResult.rows[0];

      if (!payment) {
        return res.json({ 
          success: true, 
          payment: { status: 'pending' } 
        });
      }

      res.json({
        success: true,
        payment: {
          method: payment.payment_method,
          status: payment.status,
          transaction_id: payment.transaction_id,
          mpesa_code: payment.mpesa_code,
          amount: payment.amount,
          paid_at: payment.paid_at,
          created_at: payment.created_at
        }
      });

    } catch (error) {
      console.error('❌ Error checking payment status:', error);
      res.status(500).json({ success: false, error: 'Failed to check payment status' });
    }
  }

  // M-Pesa payment processing
  async processMpesaPayment(order, phoneNumber) {
    try {
      console.log(`📱 Processing M-Pesa payment for order: ${order.id}, phone: ${phoneNumber}`);
      
      // Clean phone number
      const cleanedPhone = phoneNumber.replace(/\D/g, '');
      if (cleanedPhone.length !== 10 || !cleanedPhone.startsWith('07')) {
        return { success: false, error: 'Invalid Kenyan phone number format' };
      }

      const formattedPhone = `254${cleanedPhone.substring(1)}`;
      
      // Simulate M-Pesa STK Push
      console.log(`🔄 Simulating M-Pesa STK Push to: ${formattedPhone}, Amount: ${order.total_amount}`);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Simulate successful payment
      const isSuccess = Math.random() > 0.1;
      
      if (isSuccess) {
        const transactionId = `MPESA_${Date.now()}`;
        const mpesaCode = `MPS${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
        
        console.log(`✅ M-Pesa payment successful, Transaction: ${transactionId}, Code: ${mpesaCode}`);
        
        return {
          success: true,
          transactionId: transactionId,
          mpesaCode: mpesaCode,
          message: 'M-Pesa payment processed successfully'
        };
      } else {
        console.log('❌ M-Pesa payment failed - simulation');
        return {
          success: false,
          error: 'M-Pesa payment failed. Please try again.'
        };
      }

    } catch (error) {
      console.error('❌ M-Pesa processing error:', error);
      return {
        success: false,
        error: 'M-Pesa service temporarily unavailable'
      };
    }
  }

  // Card payment processing
  async processCardPayment(order, cardDetails) {
    try {
      console.log(`💳 Processing card payment for order: ${order.id}`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const isSuccess = Math.random() > 0.15;
      
      if (isSuccess) {
        const transactionId = `CARD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`✅ Card payment successful, Transaction ID: ${transactionId}`);
        
        return {
          success: true,
          transactionId: transactionId,
          message: 'Card payment processed successfully'
        };
      } else {
        console.log('❌ Card payment failed - simulation');
        return {
          success: false,
          error: 'Card payment failed. Please check your card details and try again.'
        };
      }

    } catch (error) {
      console.error('❌ Card processing error:', error);
      return {
        success: false,
        error: 'Card payment service temporarily unavailable'
      };
    }
  }
}

module.exports = new CheckoutController();