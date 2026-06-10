const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth');
const DriverLocationRepository = require('../../repositories/driverLocation.repository');
const orderService = require('../order/order.service');
const { Driver } = require('../../models');

const driverLocationRepo = new DriverLocationRepository();

// GET /api/v1/dispatchers/orders - Get all orders with real-time status
router.get('/orders',
  authMiddleware.authenticateJWT,
  authMiddleware.resolveTenant,
  authMiddleware.requireRole(['admin', 'dispatcher']),
  async (req, res) => {
    try {
      const { status, limit, offset, include_live } = req.query;
      const tenant_id = req.tenant.id;
      
      const orders = await orderService.listOrders(tenant_id, {
        status,
        limit: limit ? parseInt(limit) : 50,
        offset: offset ? parseInt(offset) : 0,
      });
      
      // If include_live is true, enrich with live driver locations
      if (include_live === 'true' && orders.rows.length > 0) {
        const enrichedOrders = await Promise.all(orders.rows.map(async (order) => {
          if (order.assigned_driver_id) {
            const liveDriver = await driverLocationRepo.getDriverLocation(
              tenant_id,
              order.assigned_driver_id
            );
            if (liveDriver) {
              order.dataValues.live_driver_location = liveDriver;
            }
          }
          return order;
        }));
        orders.rows = enrichedOrders;
      }
      
      res.json(orders);
    } catch (error) {
      console.error('Get dispatcher orders error:', error);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }
);

// GET /api/v1/dispatchers/drivers - List drivers with live locations
router.get('/drivers',
  authMiddleware.authenticateJWT,
  authMiddleware.resolveTenant,
  authMiddleware.requireRole(['admin', 'dispatcher']),
  async (req, res) => {
    try {
      const { status, limit, include_live } = req.query;
      const tenant_id = req.tenant.id;
      
      // Get drivers from database
      const drivers = await Driver.findAll({
        where: { tenant_id, ...(status && { status }) },
        limit: limit ? parseInt(limit) : 100,
      });
      
      // Get live locations from Redis
      if (include_live === 'true') {
        const driversWithLocation = await Promise.all(drivers.map(async (driver) => {
          const liveData = await driverLocationRepo.getDriverLocation(
            tenant_id,
            driver.id
          );
          
          if (liveData) {
            driver.dataValues.live_location = {
              lat: liveData.lat,
              lng: liveData.lng,
              last_update: liveData.last_update_ts,
              speed: liveData.speed,
              heading: liveData.heading,
            };
          }
          
          return driver;
        }));
        
        return res.json(driversWithLocation);
      }
      
      res.json(drivers);
    } catch (error) {
      console.error('Get dispatcher drivers error:', error);
      res.status(500).json({ error: 'Failed to fetch drivers' });
    }
  }
);

// GET /api/v1/dispatchers/drivers/nearby - Get nearby drivers for a location
router.get('/drivers/nearby',
  authMiddleware.authenticateJWT,
  authMiddleware.resolveTenant,
  authMiddleware.requireRole(['admin', 'dispatcher']),
  async (req, res) => {
    try {
      const { lat, lng, radius_km = 5, limit = 20 } = req.query;
      const tenant_id = req.tenant.id;
      
      if (!lat || !lng) {
        return res.status(400).json({ error: 'Missing lat or lng' });
      }
      
      const nearbyDrivers = await driverLocationRepo.findNearbyDrivers(
        tenant_id,
        parseFloat(lng),
        parseFloat(lat),
        parseFloat(radius_km),
        parseInt(limit)
      );
      
      res.json({
        drivers: nearbyDrivers,
        count: nearbyDrivers.length,
        location: { lat: parseFloat(lat), lng: parseFloat(lng) },
        radius_km: parseFloat(radius_km),
      });
    } catch (error) {
      console.error('Get nearby drivers error:', error);
      res.status(500).json({ error: 'Failed to fetch nearby drivers' });
    }
  }
);

// GET /api/v1/dispatchers/stats - Real-time dispatch statistics
router.get('/stats',
  authMiddleware.authenticateJWT,
  authMiddleware.resolveTenant,
  authMiddleware.requireRole(['admin', 'dispatcher']),
  async (req, res) => {
    try {
      const tenant_id = req.tenant.id;
      
      const availableCount = await driverLocationRepo.getAvailableDriversCount(tenant_id);
      const pendingOrders = await orderService.listOrders(tenant_id, { status: 'pending', limit: 1 });
      const assignedOrders = await orderService.listOrders(tenant_id, { status: 'assigned', limit: 1 });
      const pickedUpOrders = await orderService.listOrders(tenant_id, { status: 'picked_up', limit: 1 });

      res.json({
        tenant_id,
        available_drivers: availableCount,
        pending_orders: pendingOrders.count,
        active_orders: assignedOrders.count + pickedUpOrders.count,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  }
);

module.exports = router;