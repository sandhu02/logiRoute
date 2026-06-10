const { Order, Driver, Customer } = require('../../models');
const orderProducer = require('../../producers/TelemetryProducer');
const redisManager = require('../../config/redis');
const socketManager = require('../../config/socket');
const logger = require('../../config/logger');

class OrderService {
  async createOrder(orderData) {
    const { tenant_id, customer_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng } = orderData;
    
    // Create order in database
    const order = await Order.create({
      tenant_id,
      customer_id,
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
      status: 'pending',
    });
    
    // Publish to Kafka
    await orderProducer.publishOrderEvent({
      order_id: order.id,
      tenant_id,
      event_type: 'created',
      timestamp: new Date().toISOString(),
      data: order,
    });
    
    // Notify via Socket.IO
    socketManager.emitOrderUpdated(order, tenant_id);
    
    logger.info(`Order created: ${order.id}`);
    return order;
  }

  async updateOrderStatus(orderId, status, actorId, actorType) {
    const order = await Order.findByPk(orderId);
    if (!order) {
      throw new Error('Order not found');
    }
    
    const oldStatus = order.status;
    await order.update({ status, updated_at: new Date() });
    
    // Publish to Kafka
    await orderProducer.publishOrderEvent({
      order_id: order.id,
      tenant_id: order.tenant_id,
      event_type: status,
      timestamp: new Date().toISOString(),
      previous_status: oldStatus,
      new_status: status,
      actor_id: actorId,
    });
    
    // Update Redis cache
    const redis = redisManager.getClient();
    await redis.setex(`order:${order.id}`, 300, JSON.stringify(order));
    
    // Emit Socket.IO event
    socketManager.emitOrderUpdated(order, order.tenant_id);
    
    // If order is assigned, update driver status
    if (status === 'assigned' && order.assigned_driver_id) {
      await this.updateDriverAssignment(order.assigned_driver_id, order.id);
    }
    
    return order;
  }

  async updateDriverAssignment(driverId, orderId) {
    const redis = redisManager.getClient();
    const driverKey = `tenant:${orderId}:driver:${driverId}`;
    
    await redis.hset(driverKey, 'assigned_order_id', orderId);
    await redis.hset(driverKey, 'status', 'busy');
    
    // Remove from available set
    const tenantId = await redis.hget(driverKey, 'tenant_id');
    await redis.zrem(`tenant:${tenantId}:available`, driverId);
  }

  async getOrder(orderId) {
    // Try Redis cache first
    const redis = redisManager.getClient();
    const cached = await redis.get(`order:${orderId}`);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Fallback to database
    const order = await Order.findByPk(orderId, {
      include: [
        { model: Customer, as: 'customer' },
        { model: Driver, as: 'assignedDriver' },
      ],
    });
    
    if (order) {
      await redis.setex(`order:${orderId}`, 300, JSON.stringify(order));
    }
    
    return order;
  }

  async listOrders(tenantId, filters = {}) {
    const { status, limit = 50, offset = 0 } = filters;
    
    const where = { tenant_id: tenantId };
    if (status) where.status = status;
    
    const orders = await Order.findAndCountAll({
      where,
      include: [
        { model: Customer, as: 'customer' },
        { model: Driver, as: 'assignedDriver' },
      ],
      limit,
      offset,
      order: [['created_at', 'DESC']],
    });
    
    return orders;
  }
}

module.exports = new OrderService();