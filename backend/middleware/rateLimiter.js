const redisManager = require('../config/redis');
const logger = require('../config/logger');

class RateLimiter {
  get redis() {
    return redisManager.getClient();
  }

  /**
   * Token bucket algorithm
   */
  async tokenBucket(key, capacity, refillRate, refillInterval = 60) {
    const now = Math.floor(Date.now() / 1000);
    const bucketKey = `ratelimit:${key}`;
    
    const result = await this.redis.eval(`
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refill_rate = tonumber(ARGV[2])
      local refill_interval = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      
      local bucket = redis.call('hmget', key, 'tokens', 'timestamp')
      local tokens = tonumber(bucket[1])
      local timestamp = tonumber(bucket[2])
      
      if tokens == nil then
        tokens = capacity
        timestamp = now
      else
        local elapsed = now - timestamp
        local refill = math.floor(elapsed / refill_interval) * refill_rate
        tokens = math.min(capacity, tokens + refill)
        timestamp = now
      end
      
      local allowed = tokens >= 1
      if allowed then
        tokens = tokens - 1
      end
      
      redis.call('hmset', key, 'tokens', tokens, 'timestamp', timestamp)
      redis.call('expire', key, 3600)
      
      return { allowed, tokens }
    `, 1, bucketKey, capacity, refillRate, refillInterval, now);
    
    return {
      allowed: result[0] === 1,
      remainingTokens: result[1],
    };
  }

  /**
   * Fixed window counter (simpler, for high throughput)
   */
  async fixedWindow(key, limit, windowSeconds = 60) {
    const windowKey = `ratelimit:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    
    const current = await this.redis.incr(windowKey);
    if (current === 1) {
      await this.redis.expire(windowKey, windowSeconds);
    }
    
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      reset: Math.ceil(Date.now() / 1000) + windowSeconds,
    };
  }

  /**
   * Sliding window log (most accurate)
   */
  async slidingWindow(key, limit, windowSeconds = 60) {
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);
    const sortedSetKey = `ratelimit:sliding:${key}`;
    
    // Remove old entries
    await this.redis.zremrangebyscore(sortedSetKey, 0, windowStart);
    
    // Count current requests
    const count = await this.redis.zcard(sortedSetKey);
    
    let allowed = count < limit;
    
    if (allowed) {
      // Add current request
      await this.redis.zadd(sortedSetKey, now, `${now}:${Math.random()}`);
      await this.redis.expire(sortedSetKey, windowSeconds);
    }
    
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      reset: new Date(windowStart + (windowSeconds * 1000)).getTime(),
    };
  }

  /**
   * Middleware for Express - Driver rate limiting
   */
  driverRateLimiter(options = {}) {
    const {
      limit = 60, // requests per minute
      windowSeconds = 60,
      algorithm = 'token_bucket', // token_bucket, fixed_window, sliding_window
      capacity = 60,
      refillRate = 10,
      refillInterval = 10,
    } = options;
    
    return async (req, res, next) => {
      try {
        // Get identifier (driver_id, IP, or combination)
        const driverId = req.driver?.id || req.body?.driver_id || req.query?.driver_id;
        const ip = req.ip;
        const identifier = driverId ? `driver:${driverId}` : `ip:${ip}`;
        
        let result;
        
        switch (algorithm) {
          case 'token_bucket':
            result = await this.tokenBucket(identifier, capacity, refillRate, refillInterval);
            break;
          case 'sliding_window':
            result = await this.slidingWindow(identifier, limit, windowSeconds);
            break;
          default:
            result = await this.fixedWindow(identifier, limit, windowSeconds);
        }
        
        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        if (result.reset) {
          res.setHeader('X-RateLimit-Reset', result.reset);
        }
        
        if (!result.allowed) {
          return res.status(429).json({
            error: 'Too many requests',
            retryAfter: Math.ceil(result.reset - Date.now() / 1000),
          });
        }
        
        next();
      } catch (error) {
        logger.error('Rate limiter error:', error);
        // Fail open - allow request if Redis fails
        next();
      }
    };
  }

  /**
   * Tenant-specific rate limiting
   */
  tenantRateLimiter(limit = 1000, windowSeconds = 60) {
    return async (req, res, next) => {
      const tenantId = req.tenant?.id;
      if (!tenantId) {
        return next();
      }
      
      const result = await this.fixedWindow(`tenant:${tenantId}`, limit, windowSeconds);
      
      if (!result.allowed) {
        return res.status(429).json({
          error: 'Tenant rate limit exceeded',
        });
      }
      
      next();
    };
  }

  /**
   * Endpoint-specific rate limiting
   */
  endpointRateLimiter(endpoint, limit = 100, windowSeconds = 60) {
    return async (req, res, next) => {
      const key = `endpoint:${endpoint}:${req.ip}`;
      const result = await this.slidingWindow(key, limit, windowSeconds);
      
      if (!result.allowed) {
        return res.status(429).json({
          error: `Rate limit exceeded for endpoint ${endpoint}`,
        });
      }
      
      next();
    };
  }
}

module.exports = new RateLimiter();