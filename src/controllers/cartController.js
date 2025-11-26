const pool = require('../../config/dbb');

const addToCart = async (req, res) => {
  const { product_id, quantity = 1 } = req.body;
  const userId = req.user.id;

  try {
    console.log('Add to cart - User:', userId, 'Product:', product_id, 'Qty:', quantity);

    // Validate input
    if (!product_id) {
      return res.status(400).json({ 
        success: false,
        error: 'Product ID is required' 
      });
    }

    if (quantity < 1) {
      return res.status(400).json({ 
        success: false,
        error: 'Quantity must be at least 1' 
      });
    }

    // Check if product exists
    const productCheck = await pool.query(
      'SELECT id, name, price, stock FROM products WHERE id = $1',
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Product not found' 
      });
    }

    const product = productCheck.rows[0];
    console.log('Found product:', product);

    // Check if item already exists in cart
    const existingItem = await pool.query(
      'SELECT id, quantity FROM cart WHERE user_id = $1 AND product_id = $2',
      [userId, product_id]
    );

    let result;

    if (existingItem.rows.length > 0) {
      // Update existing item
      console.log('Updating existing cart item');
      result = await pool.query(
        `UPDATE cart SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $2 AND product_id = $3 
         RETURNING *`,
        [quantity, userId, product_id]
      );
    } else {
      // Insert new item
      console.log('Inserting new cart item');
      result = await pool.query(
        `INSERT INTO cart (user_id, product_id, quantity) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [userId, product_id, quantity]
      );
    }

    console.log('Cart operation successful:', result.rows[0]);
    
    res.json({
      success: true,
      message: existingItem.rows.length > 0 ? 'Cart item updated' : 'Product added to cart',
      cart_item: result.rows[0]
    });

  } catch (error) {
    console.error('Detailed add to cart error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add item to cart: ' + error.message,
      detail: error.detail
    });
  }
};

const getCart = async (req, res) => {
  const userId = req.user.id;
  
  try {
    console.log('Getting cart for user:', userId);
    
    const result = await pool.query(
      `SELECT 
         c.id,
         c.quantity,
         c.created_at,
         c.updated_at,
         p.id as product_id,
         p.name,
         p.price,
         p.image_url,
         p.stock
       FROM cart c
       JOIN products p ON c.product_id = p.id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );

    console.log('Cart items found:', result.rows.length);
    
    res.json({ 
      success: true,
      cart: result.rows 
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch cart: ' + error.message 
    });
  }
};

const updateCartItem = async (req, res) => {
  const { cartId } = req.params;
  const { quantity } = req.body;
  const userId = req.user.id;

  try {
    console.log('Update cart item:', { cartId, quantity, userId });

    if (quantity < 1) {
      // Remove item if quantity is 0
      await pool.query(
        'DELETE FROM cart WHERE id = $1 AND user_id = $2',
        [cartId, userId]
      );
      return res.json({ 
        success: true,
        message: 'Item removed from cart' 
      });
    }

    const result = await pool.query(
      'UPDATE cart SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
      [quantity, cartId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Cart item not found' 
      });
    }

    res.json({ 
      success: true,
      cart_item: result.rows[0] 
    });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update cart: ' + error.message 
    });
  }
};

const removeFromCart = async (req, res) => {
  const { cartId } = req.params;
  const userId = req.user.id;

  try {
    console.log('Remove from cart:', { cartId, userId });

    const result = await pool.query(
      'DELETE FROM cart WHERE id = $1 AND user_id = $2 RETURNING *',
      [cartId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Cart item not found' 
      });
    }

    res.json({ 
      success: true,
      message: 'Item removed from cart' 
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to remove item from cart: ' + error.message 
    });
  }
};

const clearCart = async (req, res) => {
  const userId = req.user.id;

  try {
    console.log('Clear cart for user:', userId);

    const result = await pool.query('DELETE FROM cart WHERE user_id = $1 RETURNING *', [userId]);
    
    res.json({ 
      success: true,
      message: 'Cart cleared successfully',
      deleted_count: result.rows.length
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to clear cart: ' + error.message 
    });
  }
};

module.exports = { 
  addToCart, 
  getCart, 
  updateCartItem, 
  removeFromCart, 
  clearCart 
};