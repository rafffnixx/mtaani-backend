const pool = require('../../config/db');

const createOrderFromCart = async (req, res) => {
  const userId = req.user.id;
  const { delivery_location, payment_method = 'cash', special_instructions } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('🛒 Creating order for user:', userId);

    // 1. Get cart items and customer info
    const [cartRes, customerRes] = await Promise.all([
      client.query(
        `SELECT c.id as cart_id, c.product_id, c.quantity, p.name, p.price, p.stock
         FROM cart c JOIN products p ON c.product_id = p.id WHERE c.user_id = $1`,
        [userId]
      ),
      client.query(
        'SELECT name, phone, location FROM users WHERE id = $1',
        [userId]
      )
    ]);

    if (cartRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, error: 'Cart is empty' 
      });
    }

    const customer = customerRes.rows[0];

    // 2. Check stock and calculate total
    for (const item of cartRes.rows) {
      if (item.stock < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false,
          error: `Insufficient stock for ${item.name}. Available: ${item.stock}, Requested: ${item.quantity}` 
        });
      }
    }

    const totalAmount = cartRes.rows.reduce((total, item) => {
      return total + (parseFloat(item.price) * item.quantity);
    }, 0);

    // 3. FIXED: Use DELIVERY location for dealer matching (NOT customer's registered location)
    let customerWard = delivery_location;
    let customerArea = '';

    // Extract just the ward name if it's a full address
    if (delivery_location.includes(',')) {
      customerWard = delivery_location.split(',')[0].trim();
    }

    console.log('📍 Using DELIVERY location for dealer matching:', {
      delivery_location,
      customerWard, 
      customerArea
    });

    // 4. Create order - FIXED: Use delivery location for customer_location too
    const orderRes = await client.query(
      `INSERT INTO orders (
        user_id, 
        delivery_location, 
        customer_location, 
        status, 
        total_amount, 
        payment_method, 
        available_to_agents,
        assignment_status
      ) VALUES ($1, $2, $3, 'pending', $4, $5, true, 'available') 
      RETURNING id, created_at`,
      [
        userId, 
        delivery_location, 
        delivery_location,  // Use delivery location here too
        totalAmount, 
        payment_method
      ]
    );

    const orderId = orderRes.rows[0].id;
    console.log('✅ Created order ID:', orderId);

    // 5. Move items to order_items and update stock
    for (const item of cartRes.rows) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, product_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, item.product_id, item.quantity, item.price, item.name]
      );

      await client.query(
        `UPDATE products SET stock = stock - $1 WHERE id = $2`,
        [item.quantity, item.product_id]
      );

      await client.query('DELETE FROM cart WHERE id = $1', [item.cart_id]);
    }

    // 6. 🎯 FIND DEALERS IN SAME WARD - FIXED QUERY
    console.log('🔍 Looking for DEALERS in ward:', customerWard);
    
    const dealersInWard = await client.query(
      `SELECT id, name, phone, location 
       FROM users 
       WHERE role = 'dealer'
       AND location IS NOT NULL
       AND (location::text ILIKE $1)`,  // Simple text matching only
      [`%${customerWard}%`]
    );

    console.log(`📍 Found ${dealersInWard.rows.length} DEALERS in ward "${customerWard}":`, 
      dealersInWard.rows.map(d => ({ id: d.id, name: d.name })));

    // 7. Create dealer candidates for the order - FIXED: Removed location_match_score
    for (const dealer of dealersInWard.rows) {
      await client.query(
        `INSERT INTO order_dealer_candidates (order_id, dealer_id, status)
         VALUES ($1, $2, 'available')
         ON CONFLICT (order_id, dealer_id) DO NOTHING`,
        [orderId, dealer.id]
      );
    }

    // 8. Set assignment expiry
    await client.query(
      `UPDATE orders 
       SET assignment_expiry = NOW() + INTERVAL '24 hours'
       WHERE id = $1`,
      [orderId]
    );

    await client.query('COMMIT');

    res.status(201).json({ 
      success: true,
      message: 'Order placed successfully', 
      order_id: orderId,
      total_amount: totalAmount,
      dealers_available: dealersInWard.rows.length,
      customer_ward: customerWard,
      available_dealers: dealersInWard.rows.map(d => ({ id: d.id, name: d.name }))
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Order creation error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create order: ' + err.message 
    });
  } finally {
    client.release();
  }
};

const getCustomerOrders = async (req, res) => {
  const userId = req.user.id;
  const { status } = req.query;

  try {
    console.log('Getting orders for user:', userId, 'Status:', status);

    let query = `
      SELECT 
        o.id,
        o.total_amount,
        o.status,
        o.delivery_location,
        o.payment_method,
        o.created_at,
        o.updated_at,
        o.estimated_delivery,
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price
          )
        ) as items,
        a.name as agent_name,
        a.phone as agent_phone,
        a.vehicle_number as agent_vehicle
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN agents a ON o.assigned_agent_id = a.id
      WHERE o.user_id = $1
    `;

    const params = [userId];

    if (status) {
      query += ` AND o.status = $2`;
      params.push(status);
    }

    query += ` GROUP BY o.id, a.name, a.phone, a.vehicle_number
               ORDER BY o.created_at DESC`;

    const result = await pool.query(query, params);
    
    console.log('Found orders:', result.rows.length);
    
    res.json({ 
      success: true,
      orders: result.rows 
    });
  } catch (error) {
    console.error('Get customer orders error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch orders: ' + error.message 
    });
  }
};

const getOrderDetails = async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user.id;

  try {
    console.log('Getting order details:', { orderId, userId });

    const result = await pool.query(
      `SELECT 
        o.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total_price', (oi.quantity * oi.unit_price)
          )
        ) as items,
        a.name as agent_name,
        a.phone as agent_phone,
        a.vehicle_number as agent_vehicle,
        a.rating as agent_rating,
        u.name as customer_name,
        u.phone as customer_phone
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN agents a ON o.assigned_agent_id = a.id
      LEFT JOIN users u ON o.user_id = u.id
      WHERE o.id = $1 AND o.user_id = $2
      GROUP BY o.id, a.name, a.phone, a.vehicle_number, a.rating, u.name, u.phone`,
      [orderId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Order not found' 
      });
    }

    res.json({ 
      success: true,
      order: result.rows[0] 
    });
  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch order details: ' + error.message 
    });
  }
};

const getOrderStatusCounts = async (req, res) => {
  const userId = req.user.id;

  try {
    console.log('Getting order status counts for user:', userId);

    const result = await pool.query(
      `SELECT 
        status,
        COUNT(*) as count
      FROM orders 
      WHERE user_id = $1
      GROUP BY status
      ORDER BY 
        CASE status
          WHEN 'pending' THEN 1
          WHEN 'confirmed' THEN 2
          WHEN 'preparing' THEN 3
          WHEN 'on_the_way' THEN 4
          WHEN 'delivered' THEN 5
          WHEN 'cancelled' THEN 6
          ELSE 7
        END`,
      [userId]
    );

    res.json({ 
      success: true,
      status_counts: result.rows 
    });
  } catch (error) {
    console.error('Get order status counts error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch order status counts: ' + error.message 
    });
  }
};

const cancelOrder = async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user.id;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Canceling order:', { orderId, userId });

    // Check if order exists and belongs to user
    const orderCheck = await client.query(
      'SELECT status FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, userId]
    );

    if (orderCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false,
        error: 'Order not found' 
      });
    }

    const currentStatus = orderCheck.rows[0].status;

    // Only allow cancellation for pending and confirmed orders
    if (!['pending', 'confirmed'].includes(currentStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false,
        error: `Cannot cancel order with status: ${currentStatus}` 
      });
    }

    // Update order status to cancelled
    await client.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
      ['cancelled', orderId]
    );

    // Restore product stock
    const orderItems = await client.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );

    for (const item of orderItems.rows) {
      await client.query(
        'UPDATE products SET stock = stock + $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    await client.query('COMMIT');

    res.json({ 
      success: true,
      message: 'Order cancelled successfully' 
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cancel order error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to cancel order: ' + error.message 
    });
  } finally {
    client.release();
  }
};

// Get customer order statistics
const getOrderStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
        COUNT(CASE WHEN status = 'on_the_way' THEN 1 END) as on_the_way_orders
      FROM orders 
      WHERE user_id = $1`,
      [userId]
    );

    res.json({
      success: true,
      totalOrders: parseInt(result.rows[0].total_orders),
      pendingOrders: parseInt(result.rows[0].pending_orders),
      deliveredOrders: parseInt(result.rows[0].delivered_orders),
      confirmedOrders: parseInt(result.rows[0].confirmed_orders),
      onTheWayOrders: parseInt(result.rows[0].on_the_way_orders)
    });

  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order statistics'
    });
  }
};

module.exports = { 
  createOrderFromCart,
  getCustomerOrders,
  getOrderDetails,
  getOrderStatusCounts,
  cancelOrder,
  getOrderStats
};