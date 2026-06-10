const jwt = require('jsonwebtoken');
const redisManager = require('../config/redis');
const { Driver } = require('../models');

const authMiddleware = {
  // JWT authentication for dispatchers
  authenticateJWT: (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  },

  // API key or JWT authentication for drivers (telemetry ingestion / driver endpoints)
  authenticateDriverAPIKey: async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No credentials provided' });
    }

    const tokenOrKey = authHeader.split(' ')[1];
    const redis = redisManager.getClient();
    
    try {
      // 1. Try to verify if it is a driver JWT
      try {
        const decoded = jwt.verify(tokenOrKey, process.env.JWT_SECRET);
        if (decoded && decoded.role === 'driver') {
          const driverInfo = {
            driver_id: decoded.driver_id,
            tenant_id: decoded.tenant_id,
            name: decoded.name,
          };
          req.driver = driverInfo;
          req.tenantId = decoded.tenant_id;
          return next();
        }
      } catch (jwtError) {
        // Not a valid JWT, proceed with API key verification
      }

      // 2. Check Redis cache for API key
      let driverInfo = await redis.get(`driver:apikey:${tokenOrKey}`);
      
      if (!driverInfo) {
        // Fallback to database
        const driver = await Driver.findOne({
          where: { api_key: tokenOrKey },
          include: ['tenant'],
        });
        
        if (!driver) {
          return res.status(401).json({ error: 'Invalid API key or token' });
        }
        
        driverInfo = {
          driver_id: driver.id,
          tenant_id: driver.tenant_id,
          name: driver.name,
        };
        
        // Cache for 1 hour
        await redis.setex(`driver:apikey:${tokenOrKey}`, 3600, JSON.stringify(driverInfo));
      } else {
        driverInfo = JSON.parse(driverInfo);
      }
      
      req.driver = driverInfo;
      req.tenantId = driverInfo.tenant_id;
      next();
    } catch (error) {
      console.error('Driver auth error:', error);
      return res.status(500).json({ error: 'Authentication failed' });
    }
  },

  // Tenant resolver middleware (from header, user JWT, or subdomain)
  resolveTenant: async (req, res, next) => {
    const subdomain = req.headers['x-tenant-id'] || (req.user && req.user.tenant_id) || req.subdomains[0];
    
    if (!subdomain && !req.tenantId) {
      return res.status(400).json({ error: 'Tenant not specified' });
    }
    
    const tenantId = req.tenantId || subdomain;
    req.tenant = { id: tenantId };
    next();
  },

  // Role-based access control
  requireRole: (roles) => {
    return (req, res, next) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      next();
    };
  },
};

module.exports = authMiddleware;