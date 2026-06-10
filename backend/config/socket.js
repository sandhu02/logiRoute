const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const jwt = require('jsonwebtoken');
const redisManager = require('./redis');
const logger = require('./logger');
const DriverLocationRepository = require('../repositories/driverLocation.repository');
const driverLocationRepo = new DriverLocationRepository();

class SocketManager {
  constructor(server) {
    this.io = null;
    this.server = server;
    this.pubClient = null;
    this.subClient = null;
  }

  async initialize() {
    // Initialize Redis clients for adapter
    this.pubClient = redisManager.getClient().duplicate();
    this.subClient = redisManager.getClient().duplicate();
    

    // Create Socket.IO server
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Use Redis adapter for horizontal scaling
    this.io.adapter(createAdapter(this.pubClient, this.subClient));

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        const clientType = socket.handshake.auth.clientType; // 'dispatcher' or 'driver'
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        let decoded;
        if (clientType === 'driver') {
          // Driver authentication with API key
          decoded = await this.verifyDriverApiKey(token);
          socket.userType = 'driver';
          socket.driverId = decoded.driver_id;
          socket.tenantId = decoded.tenant_id;
        } else {
          // Dispatcher authentication with JWT
          decoded = jwt.verify(token, process.env.JWT_SECRET);
          socket.userType = 'dispatcher';
          socket.userId = decoded.user_id;
          socket.tenantId = decoded.tenant_id;
          socket.role = decoded.role;
        }

        next();
      } catch (error) {
        logger.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.info('Socket.IO server initialized with Redis adapter');
    return this.io;
  }

  async verifyDriverApiKey(apiKey) {
    const redis = redisManager.getClient();
    
    // 1. Try to verify if it is a driver JWT
    try {
      const decoded = jwt.verify(apiKey, process.env.JWT_SECRET);
      if (decoded && decoded.role === 'driver') {
        return {
          driver_id: decoded.driver_id,
          tenant_id: decoded.tenant_id,
          name: decoded.name,
        };
      }
    } catch (jwtError) {
      // Not a valid JWT, proceed with API key verification
    }

    // 2. Check Redis cache
    const cached = await redis.get(`driver:apikey:${apiKey}`);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // 3. Fallback to database lookup
    const { Driver } = require('../models');
    try {
      const driver = await Driver.findOne({
        where: { api_key: apiKey },
        include: ['tenant'],
      });
      
      if (driver) {
        const driverInfo = {
          driver_id: driver.id,
          tenant_id: driver.tenant_id,
          name: driver.name,
        };
        
        // Cache API key for 1 hour
        await redis.setex(`driver:apikey:${apiKey}`, 3600, JSON.stringify(driverInfo));
        return driverInfo;
      }
    } catch (dbError) {
      logger.error('Database query error during socket auth:', dbError);
    }
    
    throw new Error('Invalid API key or token');
  }

  handleConnection(socket) {
    logger.info(`Socket connected: ${socket.id}, Type: ${socket.userType}, Tenant: ${socket.tenantId}`);

    // Join tenant-specific rooms
    if (socket.userType === 'dispatcher') {
      socket.join(`tenant:${socket.tenantId}:dispatchers`);
      socket.emit('connected', { 
        message: 'Connected to dispatcher room',
        tenantId: socket.tenantId,
        socketId: socket.id 
      });
    } else if (socket.userType === 'driver') {
      socket.join(`tenant:${socket.tenantId}:drivers`);
      socket.join(`driver:${socket.driverId}`); // Personal room
      socket.emit('connected', { 
        message: 'Connected to driver room',
        driverId: socket.driverId,
        tenantId: socket.tenantId 
      });
      this.onDriverConnected(socket);
    }

    // Handle subscription to specific order updates
    socket.on('subscribe:order', (orderId) => {
      socket.join(`order:${orderId}`);
      logger.debug(`Socket ${socket.id} subscribed to order ${orderId}`);
    });

    socket.on('unsubscribe:order', (orderId) => {
      socket.leave(`order:${orderId}`);
    });

    // Handle driver status updates (from driver app)
    socket.on('driver:status:update', async (data) => {
      if (socket.userType === 'driver') {
        await this.handleDriverStatusUpdate(socket, data);
      }
    });

    // Handle location updates (fallback if not using Kafka)
    socket.on('driver:location:update', async (data) => {
      if (socket.userType === 'driver') {
        await this.handleDriverLocationUpdate(socket, data);
      }
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
      this.handleDisconnect(socket);
    });
  }

  async onDriverConnected(socket) {
    try {
      const { Driver } = require('../models');
      const driver = await Driver.findByPk(socket.driverId);
      if (!driver || driver.status !== 'available') return;

      const existing = await driverLocationRepo.getDriverLocation(socket.tenantId, socket.driverId);
      await driverLocationRepo.updateDriverLocation(socket.tenantId, socket.driverId, {
        lat: existing?.lat || 31.5204,
        lng: existing?.lng || 74.3587,
        status: 'available',
        speed: existing?.speed || 0,
        heading: existing?.heading || 0,
      });

      const dispatchService = require('../modules/dispatch/dispatch.service');
      setImmediate(() => dispatchService.matchPendingOrders(socket.tenantId));
    } catch (err) {
      logger.error(`Driver connect sync failed for ${socket.driverId}:`, err);
    }
  }

  async handleDriverStatusUpdate(socket, data) {
    const { status, orderId } = data;
    const { driverId, tenantId } = socket;

    try {
      const existing = await driverLocationRepo.getDriverLocation(tenantId, driverId);
      await driverLocationRepo.updateDriverLocation(tenantId, driverId, {
        lat: existing?.lat || 31.5204,
        lng: existing?.lng || 74.3587,
        status: status || existing?.status || 'offline',
        speed: existing?.speed || 0,
        heading: existing?.heading || 0,
        assigned_order_id: orderId || existing?.assigned_order_id,
      });

      if (status === 'available') {
        const dispatchService = require('../modules/dispatch/dispatch.service');
        setImmediate(() => dispatchService.matchPendingOrders(tenantId));
      }
    } catch (err) {
      logger.error(`Failed to sync driver ${driverId} status to Redis:`, err);
    }

    // Emit status update to all dispatchers
    this.io.to(`tenant:${tenantId}:dispatchers`).emit('driver:status', {
      driver_id: driverId,
      status: status,
      order_id: orderId,
      timestamp: new Date().toISOString(),
    });

    // Also emit to driver's personal room
    this.io.to(`driver:${driverId}`).emit('driver:status:ack', {
      status: 'updated',
      newStatus: status,
    });
  }

  async handleDriverLocationUpdate(socket, data) {
    const { lat, lng, heading, speed, status } = data;
    const { driverId, tenantId } = socket;

    // Throttle location updates (max 2 per second)
    const now = Date.now();
    const lastUpdate = socket.lastLocationUpdate || 0;
    if (now - lastUpdate < 500) return; // 500ms throttle
    
    socket.lastLocationUpdate = now;

    // Persist to Redis
    try {
      await driverLocationRepo.updateDriverLocation(tenantId, driverId, {
        lat,
        lng,
        status: status || 'available',
        speed: speed || 0,
        heading: heading || 0,
        timestamp: now
      });
    } catch (err) {
      logger.error(`Failed to update driver ${driverId} location in Redis via socket:`, err);
    }

    // Emit to dispatchers
    this.io.to(`tenant:${tenantId}:dispatchers`).emit('driver:location', {
      driver_id: driverId,
      lat,
      lng,
      heading,
      speed,
      timestamp: new Date().toISOString(),
    });
  }

  handleDisconnect(socket) {
    if (socket.userType === 'driver') {
      // Notify dispatchers that driver disconnected
      this.io.to(`tenant:${socket.tenantId}:dispatchers`).emit('driver:disconnected', {
        driver_id: socket.driverId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Emit methods for workers
  emitDriverLocation(tenantId, driverId, location) {
    this.io.to(`tenant:${tenantId}:dispatchers`).emit('driver:location', {
      driver_id: driverId,
      ...location,
    });
  }

  emitDriverStatus(tenantId, driverId, oldStatus, newStatus) {
    this.io.to(`tenant:${tenantId}:dispatchers`).emit('driver:status', {
      driver_id: driverId,
      old_status: oldStatus,
      new_status: newStatus,
      timestamp: new Date().toISOString(),
    });
  }

  emitOrderUpdated(order, tenantId) {
    // Emit to dispatchers
    this.io.to(`tenant:${tenantId}:dispatchers`).emit('order:updated', order);
    
    // Emit to driver if assigned
    if (order.assigned_driver_id) {
      this.io.to(`driver:${order.assigned_driver_id}`).emit('order:updated', order);
    }
    
    // Emit to order-specific room
    this.io.to(`order:${order.id}`).emit('order:updated', order);
  }

  emitDispatchOffer(tenantId, driverId, offer) {
    this.io.to(`driver:${driverId}`).emit('dispatch:offer', offer);
  }

  emitDispatchResponse(tenantId, orderId, driverId, accepted) {
    this.io.to(`tenant:${tenantId}:dispatchers`).emit('dispatch:response', {
      order_id: orderId,
      driver_id: driverId,
      accepted,
      timestamp: new Date().toISOString(),
    });
  }

  emitOrderAssigned(tenantId, orderId, driverId) {
    this.io.to(`tenant:${tenantId}:dispatchers`).emit('order:assigned', {
      order_id: orderId,
      driver_id: driverId,
      timestamp: new Date().toISOString(),
    });
  }

  getIO() {
    if (!this.io) {
      throw new Error('Socket.IO not initialized');
    }
    return this.io;
  }
}

module.exports = new SocketManager();