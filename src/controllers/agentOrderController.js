// backend/src/controllers/agentOrderController.js
const pool = require('../../config/db');

// POST /api/agent-orders/:orderId/accept - Accept an available order
const acceptOrder = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { orderId } = req.params;
    
    console.log('🔄 Agent accepting order:', { agentId, orderId });

    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Check if order exists and is available
      const orderCheck = await client.query(
        `SELECT 
          o.*,
          u.location as customer_location
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.id = $1 
        AND o.status = 'pending' 
        AND o.agent_id IS NULL
        AND o.available_to_agents = true
        AND (o.assignment_expiry IS NULL OR o.assignment_expiry > NOW())`,
        [orderId]
      );

      if (orderCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Order not available or already taken'
        });
      }

      const order = orderCheck.rows[0];

      // 2. Optional: Check if agent is in the same area as customer
      const agentResult = await client.query(
        'SELECT location FROM users WHERE id = $1 AND role = $2',
        [agentId, 'dealer']
      );

      const agentLocation = agentResult.rows[0]?.location;
      let agentWard = '';
      let customerWard = '';

      // Extract ward from agent location (handle both JSON and plain text)
      if (agentLocation) {
        if (agentLocation.startsWith('{')) {
          try {
            const locationObj = JSON.parse(agentLocation);
            agentWard = locationObj.ward || agentLocation;
          } catch {
            agentWard = agentLocation;
          }
        } else {
          agentWard = agentLocation;
        }
      }

      // Extract ward from customer location
      if (order.customer_location) {
        if (order.customer_location.startsWith('{')) {
          try {
            const locationObj = JSON.parse(order.customer_location);
            customerWard = locationObj.ward || order.customer_location;
          } catch {
            customerWard = order.customer_location;
          }
        } else {
          customerWard = order.customer_location;
        }
      }

      // Log location matching for debugging
      console.log('📍 Location check:', {
        agentWard,
        customerWard,
        match: agentWard && customerWard && (
          agentWard.includes(customerWard) || customerWard.includes(agentWard)
        )
      });

      // 3. ✅ FIXED: Update order with agent assignment - sets BOTH agent_id AND assigned_agent_id
      const updateResult = await client.query(
        `UPDATE orders 
        SET agent_id = $1, assigned_agent_id = $1, status = 'confirmed', 
            assigned_at = NOW(), available_to_agents = false, assignment_status = 'assigned'
        WHERE id = $2 
        RETURNING id, status, agent_id, assigned_agent_id, assigned_at`,
        [agentId, orderId]
      );

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Failed to accept order'
        });
      }

      // 4. Remove from dealer candidates table
      await client.query(
        `DELETE FROM order_dealer_candidates WHERE order_id = $1 AND dealer_id = $2`,
        [orderId, agentId]
      );

      // 5. Create status history record
      await client.query(
        `INSERT INTO order_status_history (order_id, status, changed_by, changed_at)
         VALUES ($1, $2, $3, NOW())`,
        [orderId, 'confirmed', `dealer:${agentId}`]
      );

      await client.query('COMMIT');

      console.log('✅ Order accepted successfully:', {
        orderId,
        agentId,
        newStatus: 'confirmed'
      });

      res.json({
        success: true,
        message: 'Order accepted successfully',
        order: {
          id: orderId,
          status: 'confirmed',
          agent_id: agentId,
          assigned_at: new Date().toISOString()
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Accept order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to accept order: ' + error.message
    });
  }
};

// PATCH /api/agent-orders/:orderId/status - Update order status
const updateOrderStatus = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { orderId } = req.params;
    const { status } = req.body;

    console.log('🔄 Updating order status:', { agentId, orderId, status });

    // Validate status
    const validStatuses = ['confirmed', 'preparing', 'on_the_way', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // ✅ FIXED: Check if agent owns this order - check BOTH agent_id AND assigned_agent_id
    const orderCheck = await pool.query(
      'SELECT id, status FROM orders WHERE id = $1 AND (agent_id = $2 OR assigned_agent_id = $2)',
      [orderId, agentId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or you are not assigned to this order'
      });
    }

    const currentOrder = orderCheck.rows[0];

    // Validate status transition
    const statusFlow = {
      'pending': ['confirmed'],
      'confirmed': ['preparing', 'cancelled'],
      'preparing': ['on_the_way', 'cancelled'],
      'on_the_way': ['delivered', 'cancelled'],
      'delivered': [],
      'cancelled': []
    };

    const allowedNextStatuses = statusFlow[currentOrder.status] || [];
    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot change status from ${currentOrder.status} to ${status}`
      });
    }

    // ✅ FIXED: Update order status - use pool.query instead of client.query
    const updateResult = await pool.query(
      `UPDATE orders 
       SET status = $1, updated_at = NOW()
       ${status === 'delivered' ? ', delivered_at = NOW()' : ''}
       WHERE id = $2 AND (agent_id = $3 OR assigned_agent_id = $3)
       RETURNING id, status, updated_at`,
      [status, orderId, agentId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Failed to update order status'
      });
    }

    // Create status history record
    await pool.query(
      `INSERT INTO order_status_history (order_id, status, changed_by, changed_at)
       VALUES ($1, $2, $3, NOW())`,
      [orderId, status, `dealer:${agentId}`]
    );

    console.log('✅ Order status updated successfully:', {
      orderId,
      agentId,
      oldStatus: currentOrder.status,
      newStatus: status
    });

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order: updateResult.rows[0]
    });

  } catch (error) {
    console.error('❌ Update order status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update order status: ' + error.message
    });
  }
};

// GET /api/agent-orders/my-orders - Get agent's assigned orders
const getMyOrders = async (req, res) => {
  try {
    const agentId = req.user.id;
    
    console.log('📦 Fetching agent orders:', agentId);

    const query = `
      SELECT 
        o.*,
        u.name as customer_name,
        u.phone as customer_phone,
        u.location as customer_location,
        jsonb_agg(
          jsonb_build_object(
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total', oi.quantity * oi.unit_price
          )
        ) as items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.agent_id = $1
      GROUP BY o.id, u.id
      ORDER BY 
        CASE 
          WHEN o.status = 'on_the_way' THEN 1
          WHEN o.status = 'preparing' THEN 2
          WHEN o.status = 'confirmed' THEN 3
          WHEN o.status = 'delivered' THEN 4
          ELSE 5
        END,
        o.created_at DESC`;

    const result = await pool.query(query, [agentId]);
    
    const orders = result.rows.map(order => {
      let customerLocation = order.customer_location;
      let customerWard = '';
      
      // Extract ward from customer location (handle both JSON and plain text)
      if (customerLocation) {
        if (customerLocation.startsWith('{')) {
          try {
            const locationObj = JSON.parse(customerLocation);
            customerWard = locationObj.ward || customerLocation;
          } catch {
            customerWard = customerLocation;
          }
        } else {
          customerWard = customerLocation;
        }
      }
      
      return {
        ...order,
        customer_location: customerWard,
        items: order.items || []
      };
    });

    console.log('✅ Agent orders fetched successfully:', {
      agentId,
      totalOrders: orders.length,
      statusCount: orders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {})
    });

    res.json({
      success: true,
      orders: orders,
      count: orders.length
    });

  } catch (error) {
    console.error('❌ Get agent orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agent orders: ' + error.message
    });
  }
};

// GET /api/agent-orders/available - Get available orders (with fixed location filtering)
const getAvailableOrders = async (req, res) => {
  try {
    const agentId = req.user.id;
    
    console.log('📍 Fetching available orders for agent:', agentId);
    
    // Get agent's location
    const agentResult = await pool.query(
      `SELECT location as agent_location
       FROM users 
       WHERE id = $1 AND role = $2`,
      [agentId, 'dealer']
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    const agentLocation = agentResult.rows[0].agent_location;
    let agentWard = '';
    
    // Extract ward from agent location
    if (agentLocation) {
      if (agentLocation.startsWith('{')) {
        try {
          const locationObj = JSON.parse(agentLocation);
          agentWard = locationObj.ward || '';
        } catch {
          agentWard = agentLocation;
        }
      } else {
        agentWard = agentLocation.trim();
      }
    }
    
    console.log('📍 Agent ward:', agentWard);

    if (!agentWard) {
      return res.json({
        success: true,
        available_orders: [],
        count: 0,
        location_info: { agent_ward: 'Unknown', same_ward_orders: 0, other_orders: 0 }
      });
    }

    // Simple ward-based matching
    const query = `
      SELECT 
        o.*,
        u.name as customer_name,
        u.phone as customer_phone,
        u.location as customer_user_location,
        o.customer_location as customer_order_location,
        -- Simple matching
        CASE 
          WHEN LOWER(TRIM(o.delivery_location)) = LOWER(TRIM($1)) THEN 100
          WHEN LOWER(TRIM(o.customer_location)) = LOWER(TRIM($1)) THEN 100
          WHEN LOWER(TRIM(o.delivery_location)) LIKE LOWER(TRIM('%' || $1 || '%')) THEN 80
          WHEN LOWER(TRIM(o.customer_location)) LIKE LOWER(TRIM('%' || $1 || '%')) THEN 80
          ELSE 0
        END as location_match_score,
        jsonb_agg(
          jsonb_build_object(
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total', oi.quantity * oi.unit_price
          )
        ) as items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.status = 'pending' 
      AND o.agent_id IS NULL
      AND o.available_to_agents = true
      AND (o.assignment_expiry IS NULL OR o.assignment_expiry > NOW())
      AND (
        LOWER(TRIM(o.delivery_location)) = LOWER(TRIM($1))
        OR LOWER(TRIM(o.customer_location)) = LOWER(TRIM($1))
        OR LOWER(TRIM(o.delivery_location)) LIKE LOWER(TRIM('%' || $1 || '%'))
        OR LOWER(TRIM(o.customer_location)) LIKE LOWER(TRIM('%' || $1 || '%'))
      )
      GROUP BY o.id, u.id
      ORDER BY location_match_score DESC, o.created_at DESC`;

    const result = await pool.query(query, [agentWard]);
    
    const orders = result.rows.map(order => {
      const displayLocation = order.delivery_location || order.customer_order_location || 'Unknown';
      
      return {
        ...order,
        customer_location: displayLocation,
        items: order.items || [],
        location_match: {
          score: order.location_match_score,
          same_ward: order.location_match_score >= 80,
          agent_ward: agentWard,
          customer_ward: displayLocation
        }
      };
    });

    console.log('✅ Ward-based orders fetched:', {
      agentWard,
      totalOrders: orders.length
    });

    res.json({
      success: true,
      available_orders: orders,
      count: orders.length,
      location_info: {
        agent_ward: agentWard,
        same_ward_orders: orders.length,
        other_orders: 0
      }
    });

  } catch (error) {
    console.error('❌ Get available orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available orders: ' + error.message
    });
  }
};

// GET /api/agent-orders/:orderId - Get specific order details
const getOrderDetails = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { orderId } = req.params;
    
    console.log('📋 Fetching order details:', { agentId, orderId });

    const query = `
      SELECT 
        o.*,
        u.name as customer_name,
        u.phone as customer_phone,
        u.location as customer_location,
        jsonb_agg(
          jsonb_build_object(
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'total', oi.quantity * oi.unit_price
          )
        ) as items,
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'status', status,
              'changed_at', changed_at,
              'changed_by', changed_by
            ) ORDER BY changed_at DESC
          )
          FROM order_status_history
          WHERE order_id = o.id
        ) as status_history
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1 AND (o.agent_id = $2 OR o.agent_id IS NULL)
      GROUP BY o.id, u.id`;

    const result = await pool.query(query, [orderId, agentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or access denied'
      });
    }

    const order = result.rows[0];
    
    let customerLocation = order.customer_location;
    let customerWard = '';
    
    // Extract ward from customer location (handle both JSON and plain text)
    if (customerLocation) {
      if (customerLocation.startsWith('{')) {
        try {
          const locationObj = JSON.parse(customerLocation);
          customerWard = locationObj.ward || customerLocation;
        } catch {
          customerWard = customerLocation;
        }
      } else {
        customerWard = customerLocation;
      }
    }

    console.log('✅ Order details fetched:', orderId);

    res.json({
      success: true,
      order: {
        ...order,
        customer_location: customerWard,
        items: order.items || [],
        status_history: order.status_history || []
      }
    });

  } catch (error) {
    console.error('❌ Get order details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order details: ' + error.message
    });
  }
};

module.exports = {
  acceptOrder,
  updateOrderStatus,
  getMyOrders,
  getAvailableOrders,
  getOrderDetails
};