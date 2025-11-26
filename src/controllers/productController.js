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
  const { category, search } = req.query;
  
  console.log('🛍️ Fetching products with params:', { category, search });
  
  try {
    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE 1=1
    `;
    const params = [];

    // Map frontend slugs to database slugs
    if (category) {
      let dbSlug = category;
      
      // Map frontend category names to database slugs
      if (category === 'new-cylinders') {
        dbSlug = 'cylinders'; // Your cylinders category in DB
      } else if (category === 'refill') {
        dbSlug = 'gas'; // Your gas category in DB
      } else if (category === 'empty') {
        dbSlug = 'empty-cylinders'; // Your empty-cylinders category in DB
      }
      // accessories and emergency stay the same
      
      console.log(`🔀 Mapping frontend category: ${category} → database slug: ${dbSlug}`);
      
      query += ` AND c.slug = $${params.length + 1}`;
      params.push(dbSlug);
    }

    if (search) {
      query += ` AND (p.name ILIKE $${params.length + 1} OR p.description ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY p.name ASC`;

    const result = await pool.query(query, params);
    console.log(`✅ Products fetched: ${result.rows.length} products for category: ${category}`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Product fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch products: ' + err.message });
  }
};

module.exports = { getProducts, createProduct };