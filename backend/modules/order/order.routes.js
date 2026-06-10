const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth');
const orderService = require('./order.service');
const rateLimiter = require('../../middleware/rateLimiter');

// POST /api/v1/orders - Create new order
router.post('/',
  authMiddleware.authenticateJWT,
  authMiddleware.resolveTenant,
  rateLimiter.endpointRateLimiter('create_order', 10, 60),
  async (req, res) => {
    try {
      const { customer_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng } = req.body;
      const tenant_id = req.tenant.id;
      
      // Validation
      if (!customer_id || !pickup_lat || !pickup_lng || !dropoff_lat || !dropoff_lng) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const order = await orderService.createOrder({
        tenant_id,
        customer_id,
        pickup_lat,
        pickup_lng,
        dropoff_lat,
        dropoff_lng,
      });
      
      res.status(201).json(order);
    } catch (error) {
      console.error('Create order error:', error);
      res.status(500).json({ error: 'Failed to create order' });
    }
  }
);

// GET /api/v1/orders - List orders with filters
router.get('/',
  authMiddleware.authenticateJWT,
  authMiddleware.resolveTenant,
  async (req, res) => {
    try {
      const { status, limit, offset } = req.query;
      const tenant_id = req.tenant.id;
      
      const orders = await orderService.listOrders(tenant_id, {
        status,
        limit: limit ? parseInt(limit) : 50,
        offset: offset ? parseInt(offset) : 0,
      });
      
      res.json(orders);
    } catch (error) {
      console.error('List orders error:', error);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }
);

// GET /api/v1/orders/:orderId - Get order details
router.get('/:orderId',
  authMiddleware.authenticateJWT,
  authMiddleware.resolveTenant,
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const order = await orderService.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      res.json(order);
    } catch (error) {
      console.error('Get order error:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  }
);

// PATCH /api/v1/orders/:orderId/status - Update order status
router.patch('/:orderId/status',
  authMiddleware.authenticateJWT,
  authMiddleware.resolveTenant,
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status } = req.body;
      const userId = req.user.user_id;
      const userRole = req.user.role;
      
      const validStatuses = ['assigned', 'picked_up', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      
      const order = await orderService.updateOrderStatus(orderId, status, userId, userRole);
      res.json(order);
    } catch (error) {
      console.error('Update order error:', error);
      res.status(500).json({ error: 'Failed to update order' });
    }
  }
);

module.exports = router;