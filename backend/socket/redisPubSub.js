const redisManager = require('../config/redis');
const logger = require('../config/logger');

class RedisPubSub {
  constructor(io) {
    this.io = io;
    this.publisher = redisManager.getClient();
    this.subscriber = redisManager.getSubscriber();
    this.channels = new Map();
  }

  async subscribe(channel, handler) {
    await this.subscriber.subscribe(channel);
    
    this.subscriber.on('message', (ch, message) => {
      if (ch === channel && this.channels.has(channel)) {
        try {
          const data = JSON.parse(message);
          handler(data);
        } catch (error) {
          logger.error(`Pub/Sub error on channel ${channel}:`, error);
        }
      }
    });
    
    this.channels.set(channel, handler);
    logger.info(`Subscribed to Redis channel: ${channel}`);
  }

  async publish(channel, data) {
    const message = JSON.stringify(data);
    await this.publisher.publish(channel, message);
  }

  /**
   * Driver location update channel
   */
  async publishDriverLocation(tenantId, driverId, location) {
    const channel = `driver:location:${tenantId}`;
    await this.publish(channel, {
      driver_id: driverId,
      tenant_id: tenantId,
      ...location,
      timestamp: Date.now(),
    });
  }

  subscribeDriverLocation(tenantId, callback) {
    const channel = `driver:location:${tenantId}`;
    this.subscribe(channel, (data) => {
      callback(data);
    });
  }

  /**
   * Order status update channel
   */
  async publishOrderStatus(orderId, status, tenantId) {
    const channel = `order:status:${tenantId}`;
    await this.publish(channel, {
      order_id: orderId,
      tenant_id: tenantId,
      status,
      timestamp: Date.now(),
    });
  }

  subscribeOrderStatus(tenantId, callback) {
    const channel = `order:status:${tenantId}`;
    this.subscribe(channel, (data) => {
      callback(data);
    });
  }

  /**
   * Dispatch notifications channel
   */
  async publishDispatchOffer(tenantId, driverId, offer) {
    const channel = `dispatch:${tenantId}:${driverId}`;
    await this.publish(channel, offer);
  }

  subscribeDispatchOffers(tenantId, driverId, callback) {
    const channel = `dispatch:${tenantId}:${driverId}`;
    this.subscribe(channel, callback);
  }
}

module.exports = RedisPubSub;