const Redis = require('ioredis');
const logger = require('./logger');

class RedisManager {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.isCluster = false;
    this.isSentinel = false;
  }

  connect() {
    const config = {
      host: process.env.REDIS_HOST || 'redis',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`Redis retry attempt ${times}, delaying ${delay}ms`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    };

    // Handle Redis Cluster
    if (process.env.REDIS_CLUSTER === 'true') {
      this.isCluster = true;
      const nodes = process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
        const [host, port] = node.split(':');
        return { host, port: parseInt(port) };
      });
      this.client = new Redis.Cluster(nodes, {
        redisOptions: config,
        clusterRetryStrategy: (times) => Math.min(times * 100, 3000),
      });
    } 
    // Handle Redis Sentinel
    else if (process.env.REDIS_SENTINEL === 'true') {
      this.isSentinel = true;
      this.client = new Redis({
        sentinels: JSON.parse(process.env.REDIS_SENTINELS),
        name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
        password: process.env.REDIS_PASSWORD,
        db: config.db,
        retryStrategy: config.retryStrategy,
      });
    } 
    // Standalone Redis
    else {
      this.client = new Redis(config);
    }

    // Setup event handlers
    this.client.on('connect', () => {
      logger.info('Redis connected');
    });

    this.client.on('error', (err) => {
      logger.error('Redis error:', err);
    });

    this.client.on('ready', () => {
      logger.info('Redis ready');
    });

    // Subscriber client for Pub/Sub
    this.subscriber = this.client.duplicate();

    return this.client;
  }

  async healthCheck() {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }

  async disconnect() {
    await this.client.quit();
    if (this.subscriber) await this.subscriber.quit();
    logger.info('Redis disconnected');
  }

  getClient() {
    if (!this.client) {
      throw new Error('Redis not connected. Call connect() first.');
    }
    return this.client;
  }

  getSubscriber() {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not available');
    }
    return this.subscriber;
  }
}

module.exports = new RedisManager();