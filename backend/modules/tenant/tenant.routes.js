const express = require('express');
const router = express.Router();
const tenantService = require('./tenant.service');

// POST /api/v1/tenants - Create a new tenant
router.post('/', async (req, res) => {
  try {
    const { name, subdomain } = req.body;
    if (!name || !subdomain) {
      return res.status(400).json({ error: 'Name and subdomain are required' });
    }
    const tenant = await tenantService.createTenant({ name, subdomain });
    res.status(201).json(tenant);
  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

// GET /api/v1/tenants/:id
router.get('/:id', async (req, res) => {
  try {
    const tenant = await tenantService.getTenant(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.status(200).json(tenant);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
});

// POST /api/v1/tenants/:id/api-key - Generate new API key
router.post('/:id/api-key', async (req, res) => {
  try {
    const result = await tenantService.generateTenantApiKey(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

module.exports = router;
