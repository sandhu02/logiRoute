const redisManager = require('../config/redis');
const logger = require('../config/logger');

class CacheManager {
  constructor() {
    this.redis = redisManager.getClient();
    this.defaultTTL = 300; // 5 minutes
  }

  /**
   * Generic cache get/set with TTL
   */
  async get(key) {
    const data = await this.redis.get(key);
    if (!data) return null;
    
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }

  async set(key, value, ttlSeconds = this.defaultTTL) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (ttlSeconds > 0) {
      await this.redis.setex(key, ttlSeconds, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async delete(key) {
    await this.redis.del(key);
  }

  async exists(key) {
    return await this.redis.exists(key);
  }

  /**
   * Cache with automatic refresh pattern
   */
  async getOrSet(key, fetcher, ttlSeconds = this.defaultTTL) {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }
    
    const fresh = await fetcher();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  /**
   * Batch cache operations
   */
  async mget(keys) {
    const values = await this.redis.mget(keys);
    return values.map(v => {
      if (!v) return null;
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    });
  }

  async mset(keyValuePairs, ttlSeconds = this.defaultTTL) {
    const pipeline = this.redis.pipeline();
    
    for (const [key, value] of Object.entries(keyValuePairs)) {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttlSeconds > 0) {
        pipeline.setex(key, ttlSeconds, serialized);
      } else {
        pipeline.set(key, serialized);
      }
    }
    
    await pipeline.exec();
  }

  /**
   * Order caching (specific use case)
   */
  async cacheOrder(orderId, orderData, ttlSeconds = 300) {
    const key = `order:${orderId}`;
    await this.set(key, orderData, ttlSeconds);
  }

  async getCachedOrder(orderId) {
    const key = `order:${orderId}`;
    return await this.get(key);
  }

  async invalidateOrder(orderId) {
    const key = `order:${orderId}`;
    await this.delete(key);
  }

  /**
   * Tenant configuration caching
   */
  async cacheTenantConfig(tenantId, config, ttlSeconds = 3600) {
    const key = `tenant:config:${tenantId}`;
    await this.set(key, config, ttlSeconds);
  }

  async getTenantConfig(tenantId) {
    const key = `tenant:config:${tenantId}`;
    return await this.get(key);
  }

  /**
   * Cache statistics
   */
  async getStats() {
    const info = await this.redis.info('stats');
    const keyspace = await this.redis.info('keyspace');
    
    return {
      stats: info,
      keyspace: keyspace,
      memory: await this.redis.info('memory'),
    };
  }

  /**
   * Clear by pattern (use with caution)
   */
  async clearPattern(pattern) {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      logger.info(`Cleared ${keys.length} keys matching pattern ${pattern}`);
    }
    return keys.length;
  }
}

module.exports = CacheManager;