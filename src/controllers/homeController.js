const pool = require('../../config/db');

exports.getCustomerHome = async (req, res) => {
  try {
    console.log('🏠 Fetching customer home data...');

    // Get categories with product counts
    const categoriesQuery = `
      SELECT 
        c.*,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      GROUP BY c.id, c.name
      ORDER BY c.name ASC
    `;
    
    console.log('📊 Executing categories query...');
    const categoriesResult = await pool.query(categoriesQuery);
    console.log('✅ Categories fetched:', categoriesResult.rows.length);

    // Get featured products
    const featuredQuery = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.category_id IS NOT NULL 
      ORDER BY p.updated_at DESC 
      LIMIT 10
    `;
    
    console.log('📊 Executing featured products query...');
    const featuredResult = await pool.query(featuredQuery);
    console.log('✅ Featured products fetched:', featuredResult.rows.length);

    // Get banners
    const bannersQuery = 'SELECT * FROM banners';
    console.log('📊 Executing banners query...');
    const bannersResult = await pool.query(bannersQuery);
    console.log('✅ Banners fetched:', bannersResult.rows.length);

    // Get promotions
    const promotionsQuery = `
      SELECT * FROM promotions 
      WHERE valid_until >= CURRENT_DATE
    `;
    console.log('📊 Executing promotions query...');
    const promotionsResult = await pool.query(promotionsQuery);
    console.log('✅ Promotions fetched:', promotionsResult.rows.length);

    // Get company info
    const companyQuery = 'SELECT * FROM company_info LIMIT 1';
    console.log('📊 Executing company info query...');
    const companyResult = await pool.query(companyQuery);
    console.log('✅ Company info fetched:', companyResult.rows.length);

    // Prepare response data
    const responseData = {
      categories: categoriesResult.rows.map(cat => ({
        ...cat,
        product_count: parseInt(cat.product_count) || 0
      })),
      featuredProducts: featuredResult.rows,
      banners: bannersResult.rows,
      promotions: promotionsResult.rows,
      company: companyResult.rows[0] || {},
    };

    console.log('📦 Final response data:', {
      categories: responseData.categories.map(c => ({ 
        name: c.name, 
        count: c.product_count,
        id: c.id 
      })),
      featuredProducts: responseData.featuredProducts.length,
      banners: responseData.banners.length,
      promotions: responseData.promotions.length
    });

    res.json(responseData);

  } catch (err) {
    console.error('❌ Home fetch error:', err.message);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ error: 'Failed to load homepage content: ' + err.message });
  }
};

exports.getCustomerProducts = async (req, res) => {
  const { category, search } = req.query;
  
  console.log('🛍️ Fetching products with params:', { category, search });
  
  let query = `
    SELECT p.*, c.name AS category_name, c.slug as category_slug
    FROM products p 
    JOIN categories c ON p.category_id = c.id 
    WHERE 1=1
  `;
  const params = [];

  if (category) {
    query += ` AND c.slug = $${params.length + 1}`;
    params.push(category);
  }

  if (search) {
    query += ` AND p.name ILIKE $${params.length + 1}`;
    params.push(`%${search}%`);
  }

  query += ` ORDER BY p.name ASC`;

  try {
    const result = await pool.query(query, params);
    console.log(`✅ Products fetched: ${result.rows.length} products`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Product fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch products: ' + err.message });
  }
};

exports.postEmergencyRequest = async (req, res) => {
  const { user_id, type, description } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO emergency_requests (user_id, type, description) VALUES ($1, $2, $3) RETURNING *',
      [user_id, type, description]
    );
    res.json({ 
      success: true,
      message: 'Emergency request submitted successfully',
      request: result.rows[0]
    });
  } catch (err) {
    console.error('Emergency error:', err.message);
    res.status(500).json({ error: 'Failed to submit emergency request' });
  }
};

exports.getEmergencyRequests = async (req, res) => {
  const { user_id } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM emergency_requests WHERE user_id = $1 ORDER BY created_at DESC',
      [user_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Emergency fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch emergency requests' });
  }
};