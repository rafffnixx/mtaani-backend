const pool = require('../../config/db');

exports.getCustomerHome = async (req, res) => {
  try {
    console.log('🏠 Fetching customer home data...');

    // Get only the specific categories we want: New, Refill, Accessories, Empty
    const categoriesQuery = `
      SELECT 
        c.*,
        COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      WHERE c.slug IN ('gas-refill', 'accessories', 'empty-cylinders')
         OR (c.slug = 'cylinders' AND c.name = 'New Cylinders')
      GROUP BY c.id, c.name, c.slug
      ORDER BY 
        CASE 
          WHEN c.slug = 'gas-refill' THEN 1
          WHEN c.slug = 'cylinders' THEN 2
          WHEN c.slug = 'empty-cylinders' THEN 3
          WHEN c.slug = 'accessories' THEN 4
          ELSE 5
        END
    `;
    
    console.log('📊 Executing categories query...');
    const categoriesResult = await pool.query(categoriesQuery);
    
    // Transform the categories to show proper names
    const transformedCategories = categoriesResult.rows.map(cat => {
      let displayName = cat.name;
      let displaySlug = cat.slug;
      
      // Rename "Cylinders" to "New Cylinders" for clarity
      if (cat.slug === 'cylinders') {
        displayName = 'New Cylinders';
        displaySlug = 'new-cylinders';
      }
      // Rename "Gas Refill" to just "Refill"
      else if (cat.slug === 'gas-refill') {
        displayName = 'Refill';
        displaySlug = 'refill';
      }
      // Rename "Empty Cylinders" to just "Empty"
      else if (cat.slug === 'empty-cylinders') {
        displayName = 'Empty';
        displaySlug = 'empty';
      }
      
      return {
        ...cat,
        display_name: displayName,
        display_slug: displaySlug,
        product_count: parseInt(cat.product_count) || 0
      };
    });

    console.log('✅ Categories fetched:', transformedCategories.map(c => ({ 
      name: c.display_name, 
      count: c.product_count 
    })));

    // Get featured products
    const featuredQuery = `
      SELECT p.*, c.name as category_name, c.slug as category_slug 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.category_id IS NOT NULL 
      ORDER BY p.updated_at DESC 
      LIMIT 10
    `;
    
    const featuredResult = await pool.query(featuredQuery);

    // Get banners, promotions, company info
    const bannersResult = await pool.query('SELECT * FROM banners');
    const promotionsResult = await pool.query('SELECT * FROM promotions WHERE valid_until >= CURRENT_DATE');
    const companyResult = await pool.query('SELECT * FROM company_info LIMIT 1');

    const responseData = {
      categories: transformedCategories,
      featuredProducts: featuredResult.rows,
      banners: bannersResult.rows,
      promotions: promotionsResult.rows,
      company: companyResult.rows[0] || {},
    };

    res.json(responseData);

  } catch (err) {
    console.error('❌ Home fetch error:', err.message);
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

  // Map frontend slugs to database slugs
  if (category) {
    let dbSlug = category;
    
    // Map frontend category names to database slugs
    if (category === 'new-cylinders') {
      dbSlug = 'cylinders'; // Your cylinders category in DB
    } else if (category === 'refill') {
      dbSlug = 'gas-refill'; // Your gas-refill category in DB
    } else if (category === 'empty') {
      dbSlug = 'empty-cylinders'; // Your empty-cylinders category in DB
    }
    // accessories stays the same
    
    query += ` AND c.slug = $${params.length + 1}`;
    params.push(dbSlug);
  }

  if (search) {
    query += ` AND (p.name ILIKE $${params.length + 1} OR p.description ILIKE $${params.length + 1})`;
    params.push(`%${search}%`);
  }

  query += ` ORDER BY p.name ASC`;

  try {
    const result = await pool.query(query, params);
    console.log(`✅ Products fetched: ${result.rows.length} products for category: ${category}`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Product fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch products: ' + err.message });
  }
};

// Keep your emergency functions the same...
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