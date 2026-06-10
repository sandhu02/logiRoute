const { createConsumer } = require('../config/kafka');
const { TOPICS } = require('../config/topics');
const Redis = require('ioredis');
const { Server } = require('socket.io');
const DriverLocationRepository = require('../repositories/driverLocation.repository');

class TrackingWorker {
  constructor(redisClient, socketIoServer) {
    this.consumer = createConsumer('tracking-worker-group');
    this.redis = redisClient || new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: process.env.REDIS_PORT || 6379,
      keyPrefix: 'driver:',
    });
    this.driverLocationRepo = new DriverLocationRepository();
    this.io = socketIoServer;
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) return;
    
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: TOPICS.DRIVER_TELEMETRY,
      fromBeginning: false, // Only consume new messages
    });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const telemetry = JSON.parse(message.value.toString());
          await this.processTelemetry(telemetry, partition, message.offset);
        } catch (error) {
          console.error('Error processing telemetry:', error);
          // Send to dead letter queue or log
        }
      },
      autoCommit: true,
      autoCommitInterval: 5000,
      eachBatchAutoResolve: true,
    });

    this.isRunning = true;
    console.log('Tracking worker started');
  }

  async processTelemetry(telemetry, partition, offset) {
    const { driver_id, lat, lng, timestamp, speed, heading, tenant_id } = telemetry;
    
    // 1. Standardize location storage in Redis using the repository
    try {
      await this.driverLocationRepo.updateDriverLocation(tenant_id, driver_id, {
        lat,
        lng,
        status: 'available', // telemetry implies driver is online and active
        speed,
        heading,
        timestamp: new Date(timestamp).getTime(),
      });
    } catch (repoErr) {
      console.error('Failed to update driver location in repository:', repoErr);
    }
    
    // 2. Store last 10 positions for history (circular buffer)
    try {
      const driverKey = `${tenant_id}:${driver_id}`;
      const historyKey = `${driverKey}:history`;
      const positionData = JSON.stringify({ lat, lng, timestamp, speed, heading });
      await this.redis.lpush(historyKey, positionData);
      await this.redis.ltrim(historyKey, 0, 9);
      await this.redis.expire(historyKey, 3600); // Keep history for 1 hour
    } catch (historyErr) {
      console.error('Failed to save tracking history:', historyErr);
    }
    
    // 3. Emit via Socket.IO to connected dispatchers
    if (this.io) {
      this.io.to(`tenant:${tenant_id}:dispatchers`).emit('driver:location', {
        driver_id,
        lat,
        lng,
        speed,
        heading,
        timestamp,
      });
    }
  }

  async getDriverLocation(tenantId, driverId) {
    const driverKey = `${tenantId}:${driverId}`;
    const location = await this.redis.hgetall(driverKey);
    
    if (!location || Object.keys(location).length === 0) {
      return null;
    }
    
    return {
      driver_id: driverId,
      tenant_id: tenantId,
      lat: parseFloat(location.lat),
      lng: parseFloat(location.lng),
      last_update: location.last_update,
      speed: parseFloat(location.speed),
      heading: parseFloat(location.heading),
    };
  }

  async getNearbyDrivers(tenantId, lat, lng, radiusKm = 5) {
    const locationKey = `location:${tenantId}`;
    
    // Convert km to meters (Redis uses meters)
    const radiusMeters = radiusKm * 1000;
    
    const nearby = await this.redis.georadius(
      locationKey,
      lng,
      lat,
      radiusMeters,
      'km',
      'WITHDIST',
      'ASC'
    );
    
    return nearby.map(([driverId, distance]) => ({
      driver_id: driverId,
      distance_km: parseFloat(distance),
    }));
  }

  async stop() {
    if (this.isRunning) {
      await this.consumer.disconnect();
      await this.redis.quit();
      this.isRunning = false;
      console.log('Tracking worker stopped');
    }
  }
}

module.exports = TrackingWorker;