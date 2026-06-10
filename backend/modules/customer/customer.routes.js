const express = require('express');
const router = express.Router();
const { Customer } = require('../../models');
const authMiddleware = require('../../middleware/auth');

router.use(authMiddleware.authenticateJWT);
router.use(authMiddleware.resolveTenant);

// GET /api/v1/customers - List all customers for this tenant
router.get('/', async (req, res) => {
  try {
    const tenant_id = req.tenant.id;
    const customers = await Customer.findAll({
      where: { tenant_id },
      order: [['created_at', 'DESC']]
    });
    res.json(customers);
  } catch (error) {
    console.error('List customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// POST /api/v1/customers - Create a new customer under this tenant
router.post('/', async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    const tenant_id = req.tenant.id;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const customer = await Customer.create({
      tenant_id,
      name,
      phone,
      email
    });

    res.status(201).json(customer);
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

module.exports = router;
