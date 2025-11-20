const pool = require('../../config/db');

// Assign order to dealer
const assignOrderToCandidates = async (req, res) => {
  const { orderId } = req.params;
  const { dealer_ids } = req.body;

  try {
    const inserts = dealer_ids.map(id =>
      pool.query(
        'INSERT INTO order_dealer_candidates (order_id, dealer_id) VALUES ($1, $2)',
        [orderId, id]
      )
    );
    await Promise.all(inserts);
    res.json({ message: 'Order sent to candidates' });
  } catch (err) {
    console.error('Assign candidates error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// Verify agent
const verifyAgent = async (req, res) => {
  const agentId = req.params.id;
  try {
    const result = await pool.query(
      'UPDATE agents SET is_verified = true WHERE id = $1 RETURNING id, name, phone, is_verified',
      [agentId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json({ verified: result.rows[0] });
  } catch (err) {
    console.error('Verification error:', err.message);
    res.status(500).json({ error: err.message });
  }
};


const getDashboardStats = async (req, res) => {
  try {
    const [orders, pending, assigned, delivered, agents, verifiedAgents, dealers] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM orders'),
      pool.query("SELECT COUNT(*) FROM orders WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*) FROM orders WHERE status = 'assigned'"),
      pool.query("SELECT COUNT(*) FROM orders WHERE status = 'delivered'"),
      pool.query('SELECT COUNT(*) FROM agents'),
      pool.query('SELECT COUNT(*) FROM agents WHERE is_verified = true'),
      pool.query('SELECT COUNT(*) FROM dealers')
    ]);

    res.json({
      orders: {
        total: parseInt(orders.rows[0].count),
        pending: parseInt(pending.rows[0].count),
        assigned: parseInt(assigned.rows[0].count),
        delivered: parseInt(delivered.rows[0].count)
      },
      agents: {
        total: parseInt(agents.rows[0].count),
        verified: parseInt(verifiedAgents.rows[0].count)
      },
      dealers: {
        total: parseInt(dealers.rows[0].count)
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
};


module.exports = {
  assignOrderToCandidates,
  verifyAgent,
  getDashboardStats 
};

