const pool = require('../../config/db');
const bcrypt = require('bcrypt');
const JWTUtil = require('../../utils/jwt');

const adminController = {
  // POST /api/admin/signup
  signup: async (req, res) => {
    try {
      const { name, email, password, role = 'admin' } = req.body;

      console.log('👤 Admin signup request:', { name, email, role });

      // Validate required fields
      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Name, email, and password are required'
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid email address'
        });
      }

      // Validate password strength
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 6 characters long'
        });
      }

      // Validate role
      const validRoles = ['super_admin', 'admin', 'moderator'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid role. Must be one of: ' + validRoles.join(', ')
        });
      }

      // Check if admin already exists
      const existingAdmin = await pool.query(
        'SELECT id FROM admin_users WHERE email = $1',
        [email]
      );

      if (existingAdmin.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Admin with this email already exists'
        });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create admin user
      const result = await pool.query(
        `INSERT INTO admin_users (name, email, password_hash, role, is_verified, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id, name, email, role, is_active, is_verified, created_at`,
        [name, email, hashedPassword, role, true, true]
      );

      const admin = result.rows[0];

      // Generate JWT token
      const token = JWTUtil.generateToken(admin);

      console.log('✅ Admin created successfully:', { id: admin.id, email: admin.email });

      res.status(201).json({
        success: true,
        message: 'Admin account created successfully',
        token,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          is_verified: admin.is_verified,
          is_active: admin.is_active,
          created_at: admin.created_at
        }
      });

    } catch (error) {
      console.error('Admin signup error:', error);
      
      let errorMessage = 'Failed to create admin account';
      
      if (error.code === '23505') {
        errorMessage = 'Email already exists';
      } else if (error.code === '23514') {
        errorMessage = 'Invalid role provided';
      }

      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  },

  // POST /api/admin/login
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      console.log('🔐 Admin login attempt:', { email });

      // Find admin in admin_users table
      const result = await pool.query(
        'SELECT * FROM admin_users WHERE email = $1 AND is_active = TRUE',
        [email]
      );

      const admin = result.rows[0];

      if (!admin) {
        console.log('❌ Admin not found:', email);
        return res.status(401).json({
          success: false,
          error: 'Invalid admin credentials'
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
      
      if (!isPasswordValid) {
        console.log('❌ Invalid password for admin:', email);
        return res.status(401).json({
          success: false,
          error: 'Invalid admin credentials'
        });
      }

      // Update last login
      await pool.query(
        'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
        [admin.id]
      );

      // Generate JWT token
      const token = JWTUtil.generateToken(admin);

      console.log('✅ Admin login successful:', admin.email);

      res.json({
        success: true,
        message: 'Login successful',
        token,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          is_verified: admin.is_verified,
          is_active: admin.is_active,
          last_login: admin.last_login
        }
      });
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({
        success: false,
        error: 'Server error during login'
      });
    }
  },

  // GET /api/admin/profile
  getProfile: async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, name, email, role, is_active, is_verified, last_login, created_at FROM admin_users WHERE id = $1',
        [req.admin.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Admin profile not found'
        });
      }

      res.json({
        success: true,
        admin: result.rows[0]
      });

    } catch (error) {
      console.error('Get admin profile error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch profile'
      });
    }
  },

  // PUT /api/admin/profile
  updateProfile: async (req, res) => {
    try {
      const { name, email } = req.body;
      const adminId = req.admin.id;

      const updateFields = [];
      const queryParams = [];
      let paramCount = 0;

      if (name) {
        paramCount++;
        updateFields.push(`name = $${paramCount}`);
        queryParams.push(name);
      }

      if (email) {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({
            success: false,
            error: 'Please provide a valid email address'
          });
        }
        paramCount++;
        updateFields.push(`email = $${paramCount}`);
        queryParams.push(email);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No fields to update'
        });
      }

      paramCount++;
      queryParams.push(adminId);

      const query = `
        UPDATE admin_users 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING id, name, email, role, is_active, is_verified, last_login, created_at
      `;

      const result = await pool.query(query, queryParams);

      console.log('✅ Admin profile updated:', adminId);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        admin: result.rows[0]
      });

    } catch (error) {
      console.error('Update admin profile error:', error);
      
      let errorMessage = 'Failed to update profile';
      if (error.code === '23505') {
        errorMessage = 'Email already exists';
      }

      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  },

  // GET /api/admin/admins
  getAdmins: async (req, res) => {
    try {
      console.log('👥 Fetching admin users...');

      // Check if requester is super_admin
      if (req.admin.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          error: 'Only super administrators can access this endpoint'
        });
      }

      const result = await pool.query(
        `SELECT id, name, email, role, is_active, is_verified, last_login, created_at 
         FROM admin_users 
         ORDER BY created_at DESC`
      );

      console.log(`✅ Fetched ${result.rows.length} admin users`);

      res.json({
        success: true,
        admins: result.rows
      });

    } catch (error) {
      console.error('Error fetching admins:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch admin users'
      });
    }
  },

  // PUT /api/admin/admins/:id
  updateAdmin: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, role, is_active } = req.body;

      console.log('✏️ Updating admin:', { id, name, email, role, is_active });

      // Check if requester is super_admin
      if (req.admin.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          error: 'Only super administrators can update admin accounts'
        });
      }

      // Build update query
      const updateFields = [];
      const queryParams = [];
      let paramCount = 0;

      if (name !== undefined) {
        paramCount++;
        updateFields.push(`name = $${paramCount}`);
        queryParams.push(name);
      }

      if (email !== undefined) {
        paramCount++;
        updateFields.push(`email = $${paramCount}`);
        queryParams.push(email);
      }

      if (role !== undefined) {
        const validRoles = ['super_admin', 'admin', 'moderator'];
        if (!validRoles.includes(role)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid role. Must be one of: ' + validRoles.join(', ')
          });
        }
        paramCount++;
        updateFields.push(`role = $${paramCount}`);
        queryParams.push(role);
      }

      if (is_active !== undefined) {
        paramCount++;
        updateFields.push(`is_active = $${paramCount}`);
        queryParams.push(is_active);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No fields to update'
        });
      }

      paramCount++;
      queryParams.push(id);

      const query = `
        UPDATE admin_users 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING id, name, email, role, is_active, is_verified, last_login, created_at
      `;

      const result = await pool.query(query, queryParams);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Admin user not found'
        });
      }

      console.log('✅ Admin updated successfully:', id);

      res.json({
        success: true,
        message: 'Admin updated successfully',
        admin: result.rows[0]
      });

    } catch (error) {
      console.error('Error updating admin:', error);
      
      let errorMessage = 'Failed to update admin';
      if (error.code === '23505') {
        errorMessage = 'Email already exists';
      }

      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  },

  // DELETE /api/admin/admins/:id
  deleteAdmin: async (req, res) => {
    try {
      const { id } = req.params;

      console.log('🗑️ Deleting admin:', id);

      // Check if requester is super_admin
      if (req.admin.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          error: 'Only super administrators can delete admin accounts'
        });
      }

      // Prevent self-deletion
      if (parseInt(id) === req.admin.id) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete your own account'
        });
      }

      const result = await pool.query(
        'DELETE FROM admin_users WHERE id = $1 RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Admin user not found'
        });
      }

      console.log('✅ Admin deleted successfully:', id);

      res.json({
        success: true,
        message: 'Admin deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting admin:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete admin user'
      });
    }
  },

  // POST /api/admin/admins/:id/reset-password
  resetAdminPassword: async (req, res) => {
    try {
      const { id } = req.params;
      const { new_password } = req.body;

      console.log('🔑 Resetting admin password:', id);

      // Check if requester is super_admin
      if (req.admin.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          error: 'Only super administrators can reset passwords'
        });
      }

      if (!new_password || new_password.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'New password must be at least 6 characters long'
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(new_password, 10);

      const result = await pool.query(
        `UPDATE admin_users 
         SET password_hash = $1, updated_at = NOW() 
         WHERE id = $2 
         RETURNING id, email`,
        [hashedPassword, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Admin user not found'
        });
      }

      console.log('✅ Admin password reset successfully:', id);

      res.json({
        success: true,
        message: 'Password reset successfully'
      });

    } catch (error) {
      console.error('Error resetting admin password:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset password'
      });
    }
  },

  // GET /api/admin/stats
  getStats: async (req, res) => {
    try {
      console.log('📊 Fetching admin stats...');

      // Get total orders count
      const totalOrdersResult = await pool.query('SELECT COUNT(*) as count FROM orders');
      
      // Get pending orders count
      const pendingOrdersResult = await pool.query(
        `SELECT COUNT(*) as count FROM orders 
         WHERE status IN ('pending', 'pending_payment')`
      );
      
      // Get active agents count
      const activeAgentsResult = await pool.query(
        `SELECT COUNT(DISTINCT u.id) as count 
         FROM users u 
         WHERE u.role = 'dealer' 
         AND EXISTS (
           SELECT 1 FROM orders o 
           WHERE (o.agent_id = u.id OR o.assigned_agent_id = u.id) 
           AND o.status IN ('assigned', 'confirmed', 'preparing', 'on_the_way')
         )`
      );
      
      // Get total revenue
      const revenueResult = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total 
         FROM orders 
         WHERE status = 'delivered'`
      );

      // Get today's orders
      const todayOrdersResult = await pool.query(
        `SELECT COUNT(*) as count FROM orders 
         WHERE DATE(created_at) = CURRENT_DATE`
      );

      // Get total customers
      const customersResult = await pool.query(
        `SELECT COUNT(*) as count FROM users WHERE role = 'client'`
      );

      const stats = {
        totalOrders: parseInt(totalOrdersResult.rows[0].count),
        pendingOrders: parseInt(pendingOrdersResult.rows[0].count),
        activeAgents: parseInt(activeAgentsResult.rows[0].count),
        totalRevenue: parseFloat(revenueResult.rows[0].total) || 0,
        todayOrders: parseInt(todayOrdersResult.rows[0].count),
        totalCustomers: parseInt(customersResult.rows[0].count)
      };

      console.log('✅ Admin stats fetched:', stats);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics'
      });
    }
  },

  // GET /api/admin/orders
  getOrders: async (req, res) => {
    try {
      const { status, page = 1, limit = 50, search } = req.query;
      
      console.log('📦 Fetching admin orders:', { status, page, limit, search });

      let whereClause = 'WHERE 1=1';
      let queryParams = [];
      let paramCount = 0;

      if (status && status !== 'all') {
        paramCount++;
        whereClause += ` AND o.status = $${paramCount}`;
        queryParams.push(status);
      }

      if (search) {
        paramCount++;
        whereClause += ` AND (
          u.name ILIKE $${paramCount} OR 
          u.phone ILIKE $${paramCount} OR 
          o.id::text ILIKE $${paramCount} OR
          o.customer_location ILIKE $${paramCount}
        )`;
        queryParams.push(`%${search}%`);
      }

      const offset = (page - 1) * limit;
      paramCount++;
      queryParams.push(limit);
      paramCount++;
      queryParams.push(offset);

      const query = `
        SELECT 
          o.*,
          u.name as customer_name,
          u.phone as customer_phone,
          u.location as customer_user_location,
          a.name as agent_name,
          a.phone as agent_phone,
          jsonb_agg(
            jsonb_build_object(
              'product_name', oi.product_name,
              'quantity', oi.quantity,
              'unit_price', oi.unit_price
            )
          ) as items
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN users a ON o.assigned_agent_id = a.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        ${whereClause}
        GROUP BY o.id, u.id, a.id
        ORDER BY o.created_at DESC
        LIMIT $${paramCount - 1} OFFSET $${paramCount}
      `;

      const result = await pool.query(query, queryParams);
      
      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(DISTINCT o.id) as total
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ${whereClause}
      `;
      const countResult = await pool.query(countQuery, queryParams.slice(0, -2));

      const orders = result.rows.map(order => ({
        ...order,
        items: order.items || []
      }));

      console.log(`✅ Fetched ${orders.length} orders`);

      res.json({
        success: true,
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].total),
          pages: Math.ceil(countResult.rows[0].total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching admin orders:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch orders'
      });
    }
  },

  // GET /api/admin/orders/:id
  getOrder: async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log('📋 Fetching admin order details:', id);

      const query = `
        SELECT 
          o.*,
          u.name as customer_name,
          u.phone as customer_phone,
          u.location as customer_user_location,
          a.name as agent_name,
          a.phone as agent_phone,
          a.location as agent_location,
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
        LEFT JOIN users a ON o.assigned_agent_id = a.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.id = $1
        GROUP BY o.id, u.id, a.id
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      const order = result.rows[0];
      
      console.log('✅ Order details fetched:', order.id);

      res.json({
        success: true,
        order: {
          ...order,
          items: order.items || [],
          status_history: order.status_history || []
        }
      });
    } catch (error) {
      console.error('Error fetching order details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch order details'
      });
    }
  },

  // PUT /api/admin/orders/:id
  updateOrder: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, assigned_agent_id, notes } = req.body;

      console.log('✏️ Updating order:', { id, status, assigned_agent_id });

      const updateFields = [];
      const queryParams = [];
      let paramCount = 0;

      if (status) {
        paramCount++;
        updateFields.push(`status = $${paramCount}`);
        queryParams.push(status);
      }

      if (assigned_agent_id !== undefined) {
        paramCount++;
        updateFields.push(`assigned_agent_id = $${paramCount}`);
        updateFields.push(`agent_id = $${paramCount}`);
        queryParams.push(assigned_agent_id);
        
        if (assigned_agent_id) {
          paramCount++;
          updateFields.push(`status = $${paramCount}`);
          queryParams.push('assigned');
        }
      }

      if (notes) {
        paramCount++;
        updateFields.push(`special_instructions = $${paramCount}`);
        queryParams.push(notes);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No fields to update'
        });
      }

      paramCount++;
      queryParams.push(id);

      const query = `
        UPDATE orders 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await pool.query(query, queryParams);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Add to status history if status changed
      if (status) {
        await pool.query(
          `INSERT INTO order_status_history (order_id, status, changed_by, changed_at)
           VALUES ($1, $2, $3, NOW())`,
          [id, status, `admin:${req.admin.id}`]
        );
      }

      console.log('✅ Order updated successfully:', id);

      res.json({
        success: true,
        message: 'Order updated successfully',
        order: result.rows[0]
      });
    } catch (error) {
      console.error('Error updating order:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update order'
      });
    }
  },

  // POST /api/admin/orders/:id/assign
  assignOrder: async (req, res) => {
    try {
      const { id } = req.params;
      const { agent_id } = req.body;

      console.log('👤 Assigning order to agent:', { orderId: id, agentId: agent_id });

      // Verify agent exists and is a dealer
      const agentCheck = await pool.query(
        'SELECT id, name FROM users WHERE id = $1 AND role = $2',
        [agent_id, 'dealer']
      );

      if (agentCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found or invalid role'
        });
      }

      const agent = agentCheck.rows[0];

      // Update order with agent assignment
      const result = await pool.query(
        `UPDATE orders 
         SET agent_id = $1, assigned_agent_id = $1, status = 'assigned', 
             assigned_at = NOW(), updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [agent_id, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Add to status history
      await pool.query(
        `INSERT INTO order_status_history (order_id, status, changed_by, changed_at)
         VALUES ($1, $2, $3, NOW())`,
        [id, 'assigned', `admin:${req.admin.id}`]
      );

      console.log('✅ Order assigned successfully:', {
        orderId: id,
        agentId: agent_id,
        agentName: agent.name
      });

      res.json({
        success: true,
        message: `Order assigned to ${agent.name} successfully`,
        order: result.rows[0]
      });
    } catch (error) {
      console.error('Error assigning order:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to assign order'
      });
    }
  },

  // GET /api/admin/agents
 // GET /api/admin/agents
// GET /api/admin/agents
getAgents: async (req, res) => {
  try {
    console.log('👥 Fetching admin agents...');

    const query = `
      SELECT 
        u.id,
        u.name,
        u.phone,
        u.location,
        u.role,
        u.created_at,
        COUNT(o.id) as total_orders,
        COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN o.status IN ('assigned', 'confirmed', 'preparing', 'on_the_way') THEN 1 END) as active_orders,
        COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total_amount ELSE 0 END), 0) as total_revenue
      FROM users u
      LEFT JOIN orders o ON (u.id = o.agent_id OR u.id = o.assigned_agent_id)
      WHERE u.role = 'dealer'
      GROUP BY u.id, u.name, u.phone, u.location, u.role, u.created_at
      ORDER BY total_orders DESC
    `;

    const result = await pool.query(query);

    const agents = result.rows.map(agent => ({
      ...agent,
      total_orders: parseInt(agent.total_orders),
      completed_orders: parseInt(agent.completed_orders),
      active_orders: parseInt(agent.active_orders),
      total_revenue: parseFloat(agent.total_revenue),
      rating: 4.5 + (Math.random() * 0.5),
      status: agent.active_orders > 0 ? 'active' : 'available'
    }));

    console.log(`✅ Fetched ${agents.length} agents`);

    res.json({
      success: true,
      agents
    });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agents: ' + error.message
    });
  }
},
  // GET /api/admin/agents/:id
  getAgent: async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log('👤 Fetching admin agent details:', id);

      const agentQuery = `
        SELECT 
          u.*,
          COUNT(o.id) as total_orders,
          COUNT(CASE WHEN o.status = 'delivered' THEN 1 END) as completed_orders,
          COUNT(CASE WHEN o.status IN ('assigned', 'confirmed', 'preparing', 'on_the_way') THEN 1 END) as active_orders,
          COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total_amount ELSE 0 END), 0) as total_revenue
        FROM users u
        LEFT JOIN orders o ON (u.id = o.agent_id OR u.id = o.assigned_agent_id)
        WHERE u.id = $1 AND u.role = 'dealer'
        GROUP BY u.id
      `;

      const ordersQuery = `
        SELECT 
          o.*,
          u.name as customer_name,
          u.phone as customer_phone
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE (o.agent_id = $1 OR o.assigned_agent_id = $1)
        ORDER BY o.created_at DESC
        LIMIT 20
      `;

      const [agentResult, ordersResult] = await Promise.all([
        pool.query(agentQuery, [id]),
        pool.query(ordersQuery, [id])
      ]);

      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
      }

      const agent = agentResult.rows[0];
      const orders = ordersResult.rows;

      const agentData = {
        ...agent,
        total_orders: parseInt(agent.total_orders),
        completed_orders: parseInt(agent.completed_orders),
        active_orders: parseInt(agent.active_orders),
        total_revenue: parseFloat(agent.total_revenue),
        rating: 4.5 + (Math.random() * 0.5),
        performance: {
          completion_rate: agent.total_orders > 0 ? (agent.completed_orders / agent.total_orders * 100).toFixed(1) : 0,
          avg_delivery_time: '45 min',
          response_time: '5 min'
        },
        recent_orders: orders
      };

      console.log('✅ Agent details fetched:', agent.id);

      res.json({
        success: true,
        agent: agentData
      });
    } catch (error) {
      console.error('Error fetching agent details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch agent details'
      });
    }
  },

  // GET /api/admin/customers
// GET /api/admin/customers
// GET /api/admin/customers
getCustomers: async (req, res) => {
  try {
    console.log('👥 Fetching admin customers...');

    const query = `
      SELECT 
        u.id,
        u.name,
        u.phone,
        u.location,
        u.role,
        u.created_at,
        COUNT(o.id) as total_orders,
        COALESCE(SUM(o.total_amount), 0) as total_spent,
        MAX(o.created_at) as last_order_date
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.role = 'client'
      GROUP BY u.id, u.name, u.phone, u.location, u.role, u.created_at
      ORDER BY total_orders DESC
    `;

    const result = await pool.query(query);

    const customers = result.rows.map(customer => ({
      ...customer,
      total_orders: parseInt(customer.total_orders),
      total_spent: parseFloat(customer.total_spent),
      customer_since: customer.created_at
    }));

    console.log(`✅ Fetched ${customers.length} customers`);

    res.json({
      success: true,
      customers
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customers: ' + error.message
    });
  }
},

  // GET /api/admin/analytics
  getAnalytics: async (req, res) => {
    try {
      const { period = 'week' } = req.query;
      
      console.log('📈 Fetching admin analytics:', { period });

      // Orders by status
      const ordersByStatus = await pool.query(`
        SELECT status, COUNT(*) as count 
        FROM orders 
        GROUP BY status 
        ORDER BY count DESC
      `);

      // Revenue by period
      let revenueQuery = '';
      switch (period) {
        case 'week':
          revenueQuery = `DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days'`;
          break;
        case 'month':
          revenueQuery = `DATE(created_at) >= CURRENT_DATE - INTERVAL '30 days'`;
          break;
        case 'year':
          revenueQuery = `DATE(created_at) >= CURRENT_DATE - INTERVAL '365 days'`;
          break;
        default:
          revenueQuery = `DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days'`;
      }

      const revenueData = await pool.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as order_count,
          COALESCE(SUM(total_amount), 0) as revenue
        FROM orders 
        WHERE ${revenueQuery} AND status = 'delivered'
        GROUP BY DATE(created_at)
        ORDER BY date
      `);

      // Top agents
      const topAgents = await pool.query(`
        SELECT 
          u.name,
          u.phone,
          COUNT(o.id) as completed_orders,
          COALESCE(SUM(o.total_amount), 0) as total_revenue
        FROM users u
        JOIN orders o ON (u.id = o.agent_id OR u.id = o.assigned_agent_id)
        WHERE o.status = 'delivered'
        GROUP BY u.id, u.name, u.phone
        ORDER BY completed_orders DESC
        LIMIT 10
      `);

      const analytics = {
        orders_by_status: ordersByStatus.rows,
        revenue_trend: revenueData.rows,
        top_agents: topAgents.rows,
        period: period
      };

      console.log('✅ Analytics data fetched');

      res.json({
        success: true,
        analytics
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch analytics data'
      });
    }
  }
  
};


module.exports = adminController;
/* // When admin verifies payment
adminVerifyPayment = async (req, res) => {
  const { payment_id } = req.body;
  const admin_id = req.user.id;

  try {
    await pool.query('BEGIN');

    const paymentResult = await pool.query(
      `SELECT * FROM payments 
       WHERE id = $1 AND status = 'pending'`,
      [payment_id]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found or already processed'
      });
    }

    const payment = paymentResult.rows[0];

    // Mark payment as paid
    await pool.query(
      `UPDATE payments 
       SET status = 'paid',
           admin_verified_by = $1,
           admin_verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [admin_id, payment_id]
    );

    // Update order payment_status to paid
    await pool.query(
      `UPDATE orders 
       SET payment_status = 'paid',
           updated_at = NOW()
       WHERE id = $1`,
      [payment.order_id]
    );

    await pool.query('COMMIT');

    res.json({
      success: true,
      message: 'Payment verified as paid by admin'
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Admin verify payment error:', error);
    res.status(500).json({ success: false, error: 'Admin verification failed' });
  }
};
*/