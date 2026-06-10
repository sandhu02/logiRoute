const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth');
const dispatchService = require('./dispatch.service');
const rateLimiter = require('../../middleware/rateLimiter');

// GET /api/v1/dispatch/offers - List active dispatch offers for the authenticated driver
router.get('/offers',
  authMiddleware.authenticateDriverAPIKey,
  async (req, res) => {
    try {
      const { driver_id } = req.driver;
      const offers = await dispatchService.getDriverOffers(driver_id);
      res.json(offers);
    } catch (error) {
      console.error('Get driver offers error:', error);
      res.status(500).json({ error: 'Failed to fetch offers' });
    }
  }
);

// POST /api/v1/dispatch/accept - Accept a dispatch offer
router.post('/accept',
  authMiddleware.authenticateDriverAPIKey,
  rateLimiter.driverRateLimiter({ limit: 10, algorithm: 'fixed_window' }),
  async (req, res) => {
    try {
      const { order_id, offer_id } = req.body;
      const { driver_id, tenant_id } = req.driver;
      
      if (!order_id || !offer_id) {
        return res.status(400).json({ error: 'Missing order_id or offer_id' });
      }
      
      const result = await dispatchService.acceptOffer(order_id, driver_id, offer_id);
      
      res.json({
        success: true,
        message: 'Offer accepted',
        order: result.order,
      });
    } catch (error) {
      console.error('Accept offer error:', error);
      
      if (error.message === 'No active offer found for this order') {
        return res.status(410).json({ error: 'Offer expired or already taken' });
      }
      
      res.status(500).json({ error: 'Failed to accept offer' });
    }
  }
);

// POST /api/v1/dispatch/decline - Decline a dispatch offer
router.post('/decline',
  authMiddleware.authenticateDriverAPIKey,
  rateLimiter.driverRateLimiter({ limit: 20, algorithm: 'fixed_window' }),
  async (req, res) => {
    try {
      const { order_id, offer_id } = req.body;
      const { driver_id } = req.driver;
      
      // Update offer in database
      const { DispatchOffer } = require('../../models');
      await DispatchOffer.update(
        { responded_at: new Date(), accepted: false },
        { where: { id: offer_id, driver_id } }
      );
      
      res.json({ success: true, message: 'Offer declined' });
    } catch (error) {
      console.error('Decline offer error:', error);
      res.status(500).json({ error: 'Failed to decline offer' });
    }
  }
);

module.exports = router;