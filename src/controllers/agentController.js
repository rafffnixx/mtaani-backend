// backend/src/controllers/agentController.js
const pool = require('../../config/dbb');

// GET /api/agent/profile - Get agent profile (for agents with role='dealer')
const getAgentProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log('📥 Fetching agent profile for user:', userId);
    
    // Get user profile with agent-specific stats
    const result = await pool.query(
      `SELECT 
        u.id, u.name, u.phone, u.role, u.location, u.created_at,
        COUNT(DISTINCT o.id) as total_deliveries,
        COUNT(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END) as completed_deliveries,
        COUNT(DISTINCT CASE WHEN o.status IN ('confirmed', 'preparing', 'on_the_way') THEN o.id END) as active_deliveries,
        COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total_amount * 0.1 ELSE 0 END), 0) as total_earnings,
        COUNT(DISTINCT CASE WHEN o.status = 'delivered' AND DATE(o.updated_at) = CURRENT_DATE THEN o.id END) as completed_today,
        COALESCE(SUM(CASE WHEN o.status = 'delivered' AND DATE(o.updated_at) = CURRENT_DATE THEN o.total_amount * 0.1 ELSE 0 END), 0) as earnings_today
      FROM users u
      LEFT JOIN orders o ON u.id = o.agent_id
      WHERE u.id = $1 AND u.role = 'dealer'  // 🚨 CHANGED: 'agent' to 'dealer'
      GROUP BY u.id, u.name, u.phone, u.role, u.location, u.created_at`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent profile not found'
      });
    }

    const agent = result.rows[0];
    
    // Parse location for response
    let agentLocation = {};
    try {
      agentLocation = typeof agent.location === 'string' 
        ? JSON.parse(agent.location) 
        : agent.location;
    } catch (e) {
      console.log('📍 Location parse in agent profile failed:', e.message);
    }

    console.log('✅ Agent profile fetched successfully:', {
      id: agent.id,
      name: agent.name,
      total_deliveries: agent.total_deliveries,
      completed_deliveries: agent.completed_deliveries,
      active_deliveries: agent.active_deliveries,
      completed_today: agent.completed_today
    });
    
    res.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        phone: agent.phone,
        role: agent.role,
        location: agentLocation,
        created_at: agent.created_at,
        stats: {
          total_deliveries: parseInt(agent.total_deliveries) || 0,
          completed_deliveries: parseInt(agent.completed_deliveries) || 0,
          active_deliveries: parseInt(agent.active_deliveries) || 0,
          total_earnings: parseFloat(agent.total_earnings) || 0,
          completed_today: parseInt(agent.completed_today) || 0,
          earnings_today: parseFloat(agent.earnings_today) || 0,
          rating: 4.8
        }
      }
    });

  } catch (error) {
    console.error('❌ Get agent profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agent profile: ' + error.message
    });
  }
};

// GET /api/agent/dashboard - Get agent dashboard data
const getAgentDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log('📊 Fetching agent dashboard for user:', userId);
    
    // Get all data in parallel for better performance
    const [profileResult, availableOrdersResult, myOrdersResult] = await Promise.all([
      // Agent profile with today's stats
      pool.query(
        `SELECT 
          u.id, u.name,
          COUNT(DISTINCT CASE WHEN o.status = 'delivered' AND DATE(o.updated_at) = CURRENT_DATE THEN o.id END) as completed_today,
          COUNT(DISTINCT CASE WHEN o.status IN ('confirmed', 'preparing', 'on_the_way') THEN o.id END) as active_orders,
          COALESCE(SUM(CASE WHEN o.status = 'delivered' AND DATE(o.updated_at) = CURRENT_DATE THEN o.total_amount * 0.1 ELSE 0 END), 0) as earnings_today
        FROM users u
        LEFT JOIN orders o ON u.id = o.agent_id
        WHERE u.id = $1 AND u.role = 'dealer'  // 🚨 CHANGED: 'agent' to 'dealer'
        GROUP BY u.id, u.name`,
        [userId]
      ),
      
      // Available orders (pending orders not assigned to any agent)
      pool.query(
        `SELECT 
          o.*,
          u.name as customer_name,
          u.phone as customer_phone,
          u.location as customer_location
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.status = 'pending' 
        AND o.agent_id IS NULL
        AND o.available_to_agents = true
        AND (o.assignment_expiry IS NULL OR o.assignment_expiry > NOW())
        ORDER BY o.created_at DESC`
      ),
      
      // Agent's assigned orders
      pool.query(
        `SELECT 
          o.*,
          u.name as customer_name,
          u.phone as customer_phone,
          u.location as customer_location
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.agent_id = $1 
        AND o.status IN ('confirmed', 'preparing', 'on_the_way', 'delivered')
        ORDER BY 
          CASE 
            WHEN o.status = 'on_the_way' THEN 1
            WHEN o.status = 'preparing' THEN 2
            WHEN o.status = 'confirmed' THEN 3
            ELSE 4
          END,
          o.created_at DESC`,
        [userId]
      )
    ]);

    const agent = profileResult.rows[0] || { name: 'Delivery Agent' };
    const availableOrders = availableOrdersResult.rows || [];
    const myOrders = myOrdersResult.rows || [];

    // Parse customer locations for available orders
    const parsedAvailableOrders = availableOrders.map(order => {
    let customerLocation = order.customer_location; // Use string directly
      
      return {
        ...order,
        customer_location: customerLocation
      };
    });

    // Parse customer locations for my orders
    const parsedMyOrders = myOrders.map(order => {
      let customerLocation = order.customer_location; // Use string directly
      return {
        ...order,
        customer_location: customerLocation
      };
    });

    const dashboardData = {
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        stats: {
          pendingOrders: parseInt(agent.active_orders) || 0,
          completedToday: parseInt(agent.completed_today) || 0,
          totalEarnings: parseFloat(agent.earnings_today) || 0,
          rating: 4.8
        }
      },
      available_orders: parsedAvailableOrders,
      my_orders: parsedMyOrders
    };

    console.log('✅ Agent dashboard fetched successfully:', {
      agentId: userId,
      availableOrders: parsedAvailableOrders.length,
      myOrders: parsedMyOrders.length,
      stats: dashboardData.agent.stats
    });
    
    res.json(dashboardData);

  } catch (error) {
    console.error('❌ Get agent dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard: ' + error.message
    });
  }
};

// GET /api/agent/stats - Get detailed agent statistics
const getAgentStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log('📈 Fetching agent stats for user:', userId);

    const statsResult = await pool.query(
      `SELECT 
        COUNT(DISTINCT CASE WHEN status = 'delivered' AND DATE(updated_at) = CURRENT_DATE THEN id END) as completed_today,
        COUNT(DISTINCT CASE WHEN status IN ('confirmed', 'preparing', 'on_the_way') THEN id END) as active_orders,
        COALESCE(SUM(CASE WHEN status = 'delivered' AND DATE(updated_at) = CURRENT_DATE THEN total_amount * 0.1 ELSE 0 END), 0) as earnings_today,
        COUNT(DISTINCT CASE WHEN status = 'delivered' AND updated_at >= CURRENT_DATE - INTERVAL '7 days' THEN id END) as completed_week,
        COALESCE(SUM(CASE WHEN status = 'delivered' AND updated_at >= CURRENT_DATE - INTERVAL '7 days' THEN total_amount * 0.1 ELSE 0 END), 0) as earnings_week,
        COUNT(DISTINCT CASE WHEN status = 'delivered' AND updated_at >= CURRENT_DATE - INTERVAL '30 days' THEN id END) as completed_month,
        COALESCE(SUM(CASE WHEN status = 'delivered' AND updated_at >= CURRENT_DATE - INTERVAL '30 days' THEN total_amount * 0.1 ELSE 0 END), 0) as earnings_month,
        COUNT(DISTINCT CASE WHEN status = 'delivered' THEN id END) as total_completed,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN total_amount * 0.1 ELSE 0 END), 0) as total_earnings
      FROM orders 
      WHERE agent_id = $1`,
      [userId]
    );

    const stats = statsResult.rows[0] || {};

    const response = {
      success: true,
      stats: {
        today: {
          completed: parseInt(stats.completed_today) || 0,
          active: parseInt(stats.active_orders) || 0,
          earnings: parseFloat(stats.earnings_today) || 0
        },
        week: {
          completed: parseInt(stats.completed_week) || 0,
          earnings: parseFloat(stats.earnings_week) || 0
        },
        month: {
          completed: parseInt(stats.completed_month) || 0,
          earnings: parseFloat(stats.earnings_month) || 0
        },
        all_time: {
          completed: parseInt(stats.total_completed) || 0,
          earnings: parseFloat(stats.total_earnings) || 0
        },
        rating: 4.8
      }
    };

    console.log('✅ Agent stats fetched successfully for user:', userId);
    
    res.json(response);

  } catch (error) {
    console.error('❌ Get agent stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agent stats: ' + error.message
    });
  }
};

// PATCH /api/agent/profile - Update agent profile
const updateAgentProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, location } = req.body;
    
    console.log('📝 Updating agent profile for user:', userId, { name, location });

    let updateFields = [];
    let queryParams = [];
    let paramCount = 1;

    if (name) {
      updateFields.push(`name = $${paramCount}`);
      queryParams.push(name);
      paramCount++;
    }

    if (location) {
      updateFields.push(`location = $${paramCount}`);
      queryParams.push(JSON.stringify(location));
      paramCount++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    queryParams.push(userId);
    
    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $${paramCount} AND role = 'dealer'  // 🚨 CHANGED: 'agent' to 'dealer'
      RETURNING id, name, phone, role, location, created_at
    `;

    const result = await pool.query(query, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    const agent = result.rows[0];
    
    let agentLocation = {};
    try {
      agentLocation = typeof agent.location === 'string' 
        ? JSON.parse(agent.location) 
        : agent.location;
    } catch (e) {
      console.log('📍 Location parse in update failed:', e.message);
    }

    console.log('✅ Agent profile updated successfully:', agent.id);
    
    res.json({
      success: true,
      agent: {
        ...agent,
        location: agentLocation
      }
    });

  } catch (error) {
    console.error('❌ Update agent profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile: ' + error.message
    });
  }
};

module.exports = {
  getAgentProfile,
  getAgentDashboard,
  getAgentStats,
  updateAgentProfile
};