const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth');
const rateLimiter = require('../../middleware/rateLimiter');
const telemetryProducer = require('../../producers/TelemetryProducer');

// POST /api/v1/telemetry - Driver telemetry ingestion
router.post('/',
  authMiddleware.authenticateDriverAPIKey,
  rateLimiter.driverRateLimiter({ limit: 60, algorithm: 'token_bucket' }),
  async (req, res) => {
    try {
      const { lat, lng, speed, heading, accuracy, timestamp } = req.body;
      const { driver_id, tenant_id } = req.driver;
      
      // Validate coordinates
      if (!lat || !lng || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Invalid coordinates' });
      }
      
      // Publish to Kafka asynchronously
      await telemetryProducer.publishDriverTelemetry({
        driver_id,
        tenant_id,
        lat,
        lng,
        speed: speed || 0,
        heading: heading || 0,
        accuracy: accuracy || 0,
        timestamp: timestamp || new Date().toISOString(),
      });
      
      // Return 202 Accepted immediately
      res.status(202).json({ 
        message: 'Telemetry accepted',
        driver_id,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Telemetry ingestion error:', error);
      res.status(500).json({ error: 'Failed to process telemetry' });
    }
  }
);

// Batch telemetry ingestion
router.post('/batch',
  authMiddleware.authenticateDriverAPIKey,
  rateLimiter.driverRateLimiter({ limit: 300, algorithm: 'token_bucket' }),
  async (req, res) => {
    try {
      const { telemetry_batch } = req.body;
      const { driver_id, tenant_id } = req.driver;
      
      if (!Array.isArray(telemetry_batch) || telemetry_batch.length === 0) {
        return res.status(400).json({ error: 'Invalid batch data' });
      }
      
      // Add driver_id and tenant_id to each telemetry point
      const enrichedBatch = telemetry_batch.map(point => ({
        ...point,
        driver_id,
        tenant_id,
        timestamp: point.timestamp || new Date().toISOString(),
      }));
      
      await telemetryProducer.publishBatchTelemetry(enrichedBatch);
      
      res.status(202).json({
        message: `Batch telemetry accepted`,
        count: enrichedBatch.length,
      });
    } catch (error) {
      console.error('Batch telemetry error:', error);
      res.status(500).json({ error: 'Failed to process batch' });
    }
  }
);

module.exports = router;