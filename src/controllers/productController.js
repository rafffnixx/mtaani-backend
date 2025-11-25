const pool = require('../../config/db');

const createProduct = async (req, res) => {
  const { name, price, category_id, description, brand, size, type } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO products (name, price, category_id, description, brand, size, type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, price, category_id, description || null, brand || null, size || null, type || null]
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (err) {
    console.error('Create product error:', err.message);
    res.status(500).json({ error: 'Failed to create product' });
  }
};

const getProducts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug 
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id 
       ORDER BY p.id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch products error:', err.message);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
};

module.exports = { getProducts, createProduct };