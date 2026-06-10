const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Tenant, Driver } = require('../../models');
const authMiddleware = require('../../middleware/auth');

// GET /api/v1/auth/tenants - Public route to fetch list of tenants for driver registration dropdown
router.get('/tenants', async (req, res) => {
  try {
    const tenants = await Tenant.findAll({
      attributes: ['id', 'name', 'subdomain']
    });
    res.json(tenants);
  } catch (error) {
    console.error('List tenants error:', error);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

// POST /api/v1/auth/business/signup - Register a new business (Tenant)
router.post('/business/signup', async (req, res) => {
  try {
    const { name, subdomain, email, password } = req.body;
    
    if (!name || !subdomain || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if tenant email or subdomain already exists
    const existingEmail = await Tenant.findOne({ where: { email } });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const existingSubdomain = await Tenant.findOne({ where: { subdomain } });
    if (existingSubdomain) {
      return res.status(400).json({ error: 'Subdomain already taken' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create tenant
    const tenant = await Tenant.create({
      name,
      subdomain,
      email,
      password: hashedPassword
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: tenant.id,
        role: 'admin',
        tenant_id: tenant.id,
        name: tenant.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        email: tenant.email
      }
    });
  } catch (error) {
    console.error('Business signup error:', error);
    res.status(500).json({ error: 'Failed to register business' });
  }
});

// POST /api/v1/auth/business/login - Login for businesses (Tenants)
router.post('/business/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find tenant
    const tenant = await Tenant.findOne({ where: { email } });
    if (!tenant) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, tenant.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: tenant.id,
        role: 'admin',
        tenant_id: tenant.id,
        name: tenant.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        email: tenant.email
      }
    });
  } catch (error) {
    console.error('Business login error:', error);
    res.status(500).json({ error: 'Failed to authenticate business' });
  }
});

// POST /api/v1/auth/driver/signup - Register a new driver under a tenant
router.post('/driver/signup', async (req, res) => {
  try {
    const { name, phone, email, password, tenant_id } = req.body;

    if (!name || !phone || !email || !password || !tenant_id) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if tenant exists
    const tenant = await Tenant.findByPk(tenant_id);
    if (!tenant) {
      return res.status(404).json({ error: 'Selected business not found' });
    }

    // Check if email already registered
    const existingDriver = await Driver.findOne({ where: { email } });
    if (existingDriver) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate API key
    const rawApiKey = crypto.randomBytes(32).toString('hex');

    // Create driver
    const driver = await Driver.create({
      name,
      phone,
      email,
      password: hashedPassword,
      tenant_id,
      api_key: rawApiKey,
      status: 'offline'
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        driver_id: driver.id,
        role: 'driver',
        tenant_id: driver.tenant_id,
        name: driver.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      apiKey: rawApiKey,
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        tenant_id: driver.tenant_id,
        status: driver.status
      }
    });
  } catch (error) {
    console.error('Driver signup error:', error);
    res.status(500).json({ error: 'Failed to register driver' });
  }
});

// POST /api/v1/auth/driver/login - Login for drivers
router.post('/driver/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find driver
    const driver = await Driver.findOne({ where: { email } });
    if (!driver) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, driver.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        driver_id: driver.id,
        role: 'driver',
        tenant_id: driver.tenant_id,
        name: driver.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      apiKey: driver.api_key,
      driver: {
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        tenant_id: driver.tenant_id,
        status: driver.status
      }
    });
  } catch (error) {
    console.error('Driver login error:', error);
    res.status(500).json({ error: 'Failed to authenticate driver' });
  }
});

// GET /api/v1/auth/me - Verify and return current session info
router.get('/me', authMiddleware.authenticateJWT, async (req, res) => {
  try {
    // If it succeeds, authenticateJWT sets req.user
    if (req.user.role === 'admin' || req.user.role === 'dispatcher') {
      const tenant = await Tenant.findByPk(req.user.tenant_id);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      return res.json({
        role: req.user.role,
        user: {
          id: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          email: tenant.email
        }
      });
    } else if (req.user.role === 'driver') {
      const driver = await Driver.findByPk(req.user.driver_id);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });
      return res.json({
        role: 'driver',
        user: {
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
          email: driver.email,
          tenant_id: driver.tenant_id,
          status: driver.status
        }
      });
    }

    res.status(400).json({ error: 'Unknown role' });
  } catch (error) {
    console.error('Auth me check error:', error);
    res.status(500).json({ error: 'Failed to check session' });
  }
});

module.exports = router;
