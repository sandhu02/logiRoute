const express = require('express');
const router = express.Router();
const driverService = require('./driver.service');
const authMiddleware = require('../../middleware/auth');

// Note: For now, we bypass JWT check for easy testing if no JWT secret is present
// In production, uncomment `router.use(authMiddleware.authenticateJWT)`
// router.use(authMiddleware.authenticateJWT);
router.use(authMiddleware.resolveTenant);

// POST /api/v1/drivers
router.post('/', async (req, res) => {
  try {
    const data = { ...req.body, tenant_id: req.tenant.id };
    const result = await driverService.createDriver(data);
    res.status(201).json(result);
  } catch (error) {
    console.error('Create driver error:', error);
    res.status(500).json({ error: 'Failed to create driver' });
  }
});

// GET /api/v1/drivers
router.get('/', async (req, res) => {
  try {
    const drivers = await driverService.listDrivers(req.tenant.id);
    res.status(200).json(drivers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

// GET /api/v1/drivers/:id
router.get('/:id', async (req, res) => {
  try {
    const driver = await driverService.getDriver(req.params.id, req.tenant.id);
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    res.status(200).json(driver);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch driver' });
  }
});

// PATCH /api/v1/drivers/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await driverService.updateDriverStatus(req.params.id, req.tenant.id, status);
    res.status(200).json({ message: 'Status updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
