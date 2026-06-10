const redisManager = require('../config/redis');
const logger = require('../config/logger');

class DriverLocationRepository {
  get redis() {
    return redisManager.getClient();
  }

  /**
   * Update driver's geolocation and state
   */
  async updateDriverLocation(tenantId, driverId, locationData) {
    const { lat, lng, status, speed, heading, assigned_order_id, timestamp } = locationData;
    const updateTimestamp = timestamp || Date.now();
    
    const pipeline = this.redis.pipeline();
    
    // 1. Update geospatial index
    if (lat && lng) {
      pipeline.geoadd(
        `tenant:${tenantId}:drivers:geo`,
        lng,
        lat,
        driverId
      );
    }
    
    // 2. Update driver state hash
    const hashKey = `tenant:${tenantId}:driver:${driverId}`;
    const hashFields = {
      lat: lat?.toString() || '',
      lng: lng?.toString() || '',
      status: status || 'offline',
      last_update_ts: updateTimestamp.toString(),
      speed: speed?.toString() || '0',
      heading: heading?.toString() || '0',
    };
    
    if (assigned_order_id) {
      hashFields.assigned_order_id = assigned_order_id;
    }
    
    pipeline.hset(hashKey, hashFields);
    pipeline.expire(hashKey, 3600); // Expire after 1 hour if no updates
    
    // 3. Update available drivers sorted set
    if (status === 'available') {
      pipeline.zadd(`tenant:${tenantId}:available`, updateTimestamp, driverId);
    } else {
      pipeline.zrem(`tenant:${tenantId}:available`, driverId);
    }
    
    // Execute all commands atomically
    await pipeline.exec();
    
    logger.debug(`Updated location for driver ${driverId} in tenant ${tenantId}`);
  }

  /**
   * Get driver's current location and state
   */
  async getDriverLocation(tenantId, driverId) {
    const hashKey = `tenant:${tenantId}:driver:${driverId}`;
    const data = await this.redis.hgetall(hashKey);
    
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    
    return {
      driver_id: driverId,
      tenant_id: tenantId,
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lng),
      status: data.status,
      last_update_ts: parseInt(data.last_update_ts),
      speed: parseFloat(data.speed || 0),
      heading: parseFloat(data.heading || 0),
      assigned_order_id: data.assigned_order_id,
    };
  }

  /**
   * Find nearby available drivers
   */
  async findNearbyDrivers(tenantId, lng, lat, radiusKm = 5, limit = 10) {
    // Convert km to meters for Redis
    const radiusMeters = radiusKm * 1000;
    
    // First, find drivers within radius using geospatial index
    const nearbyDrivers = await this.redis.georadius(
      `tenant:${tenantId}:drivers:geo`,
      lng,
      lat,
      radiusMeters,
      'm',
      'WITHDIST',
      'ASC',
      'COUNT',
      limit * 2 // Get extra for filtering
    );
    
    if (!nearbyDrivers || nearbyDrivers.length === 0) {
      return [];
    }
    
    // Filter for available drivers only
    const availableDrivers = [];
    for (const [driverId, distance] of nearbyDrivers) {
      const driver = await this.getDriverLocation(tenantId, driverId);
      if (driver && driver.status === 'available') {
        availableDrivers.push({
          driver_id: driverId,
          distance_km: parseFloat(distance),
          ...driver
        });
        
        if (availableDrivers.length >= limit) break;
      }
    }
    
    return availableDrivers;
  }

  /**
   * Find nearby drivers using georadiusbymember (by existing driver)
   */
  async findNearbyDriversByDriver(tenantId, driverId, radiusKm = 5) {
    const driver = await this.getDriverLocation(tenantId, driverId);
    if (!driver) {
      throw new Error(`Driver ${driverId} not found`);
    }
    
    return this.findNearbyDrivers(
      tenantId,
      driver.lng,
      driver.lat,
      radiusKm
    );
  }

  /**
   * Get all available drivers (paginated)
   */
  async getAvailableDrivers(tenantId, offset = 0, limit = 100) {
    const availableKey = `tenant:${tenantId}:available`;
    
    // Get drivers sorted by last update (most recent first)
    const driverIds = await this.redis.zrevrange(
      availableKey,
      offset,
      offset + limit - 1
    );
    
    if (!driverIds || driverIds.length === 0) {
      return [];
    }
    
    // Fetch details for each driver
    const drivers = [];
    for (const driverId of driverIds) {
      const driver = await this.getDriverLocation(tenantId, driverId);
      if (driver && driver.status === 'available') {
        drivers.push(driver);
      } else {
        // Clean up stale entries
        await this.redis.zrem(availableKey, driverId);
      }
    }
    
    return drivers;
  }

  /**
   * Ensure DB-available drivers are registered in Redis
   */
  async syncAvailableDriversFromDb(tenantId) {
    const { Driver } = require('../models');
    const dbAvailable = await Driver.findAll({
      where: { tenant_id: tenantId, status: 'available' },
      attributes: ['id'],
    });

    for (const driver of dbAvailable) {
      const existing = await this.getDriverLocation(tenantId, driver.id);
      if (!existing || existing.status !== 'available') {
        await this.updateDriverLocation(tenantId, driver.id, {
          lat: existing?.lat || 31.5204,
          lng: existing?.lng || 74.3587,
          status: 'available',
          speed: existing?.speed || 0,
          heading: existing?.heading || 0,
        });
      }
    }
  }

  /**
   * Get count of available drivers (validated live state with DB fallback)
   */
  async getAvailableDriversCount(tenantId) {
    await this.syncAvailableDriversFromDb(tenantId);

    const validated = await this.getAvailableDrivers(tenantId, 0, 1000);
    if (validated.length > 0) {
      return validated.length;
    }

    const { Driver } = require('../models');
    return await Driver.count({ where: { tenant_id: tenantId, status: 'available' } });
  }

  /**
   * Remove driver from all indices (when driver logs out)
   */
  async removeDriver(tenantId, driverId) {
    const pipeline = this.redis.pipeline();
    
    pipeline.del(`tenant:${tenantId}:driver:${driverId}`);
    pipeline.zrem(`tenant:${tenantId}:available`, driverId);
    pipeline.zrem(`tenant:${tenantId}:drivers:geo`, driverId);
    
    await pipeline.exec();
    
    logger.info(`Removed driver ${driverId} from tenant ${tenantId}`);
  }

  /**
   * Bulk update driver statuses (for maintenance)
   */
  async bulkUpdateDriverStatus(tenantId, driverIds, status) {
    const pipeline = this.redis.pipeline();
    const timestamp = Date.now();
    
    for (const driverId of driverIds) {
      const hashKey = `tenant:${tenantId}:driver:${driverId}`;
      pipeline.hset(hashKey, 'status', status, 'last_update_ts', timestamp);
      
      if (status === 'available') {
        pipeline.zadd(`tenant:${tenantId}:available`, timestamp, driverId);
      } else {
        pipeline.zrem(`tenant:${tenantId}:available`, driverId);
      }
    }
    
    await pipeline.exec();
    logger.info(`Bulk updated ${driverIds.length} drivers to status ${status}`);
  }

  /**
   * Clean up stale drivers (no update for > 5 minutes)
   */
  async cleanupStaleDrivers(tenantId, timeoutMs = 300000) {
    const threshold = Date.now() - timeoutMs;
    const availableKey = `tenant:${tenantId}:available`;
    
    // Get all available drivers
    const driverIds = await this.redis.zrange(availableKey, 0, -1);
    
    const staleDrivers = [];
    for (const driverId of driverIds) {
      const driver = await this.getDriverLocation(tenantId, driverId);
      if (driver && driver.last_update_ts < threshold) {
        staleDrivers.push(driverId);
      }
    }
    
    if (staleDrivers.length > 0) {
      await this.bulkUpdateDriverStatus(tenantId, staleDrivers, 'offline');
      logger.info(`Cleaned up ${staleDrivers.length} stale drivers`);
    }
    
    return staleDrivers.length;
  }
}

module.exports = DriverLocationRepository;