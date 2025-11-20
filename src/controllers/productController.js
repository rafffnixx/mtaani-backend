const pool = require('../../config/db');

const createProduct = async (req, res) => {
  const { name, price, category, description } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO products (name, price, category, description) VALUES ($1, $2, $3, $4) RETURNING id, name',
      [name, price, category, description || null]
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
      'SELECT id, name, price FROM products ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch products error:', err.message);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
};

module.exports = { getProducts, createProduct };
