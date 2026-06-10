const { producer } = require('../config/kafka');
const { TOPICS } = require('../config/topics');
const { validateMessage, driverTelemetrySchema } = require('../schemas/messages');

class TelemetryProducer {
  constructor() {
    this.producer = producer;
    this.isConnected = false;
  }

  async connect() {
    if (!this.isConnected) {
      await this.producer.connect();
      this.isConnected = true;
      console.log('Telemetry producer connected');
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
      console.log('Telemetry producer disconnected');
    }
  }

  async publishDriverTelemetry(telemetryData) {
    // Validate message
    const validation = validateMessage(telemetryData, driverTelemetrySchema);
    if (!validation.isValid) {
      throw new Error(`Invalid telemetry data: ${validation.errors.join(', ')}`);
    }

    // Ensure timestamp exists
    if (!telemetryData.timestamp) {
      telemetryData.timestamp = new Date().toISOString();
    }

    // Key is driver_id to ensure ordering per driver
    const key = telemetryData.driver_id;

    const result = await this.producer.send({
      topic: TOPICS.DRIVER_TELEMETRY,
      messages: [
        {
          key,
          value: JSON.stringify(telemetryData),
          timestamp: Date.now().toString(),
          headers: {
            'content-type': 'application/json',
            'producer-id': 'ingestion-gateway',
            'schema-version': '1.0.0',
          },
        },
      ],
      acks: -1, // Wait for all replicas
      timeout: 30000,
    });

    return result;
  }

  async publishBatchTelemetry(telemetryBatch) {
    const messages = telemetryBatch.map((data) => {
      if (!data.timestamp) {
        data.timestamp = new Date().toISOString();
      }
      
      return {
        key: data.driver_id,
        value: JSON.stringify(data),
        timestamp: Date.now().toString(),
        headers: {
          'content-type': 'application/json',
          'producer-id': 'ingestion-gateway',
          'batch-size': telemetryBatch.length.toString(),
        },
      };
    });

    const result = await this.producer.send({
      topic: TOPICS.DRIVER_TELEMETRY,
      messages,
      acks: -1,
      timeout: 60000,
    });

    return result;
  }

  async publishOrderEvent(orderEvent) {
    const result = await this.producer.send({
      topic: TOPICS.ORDER_EVENTS,
      messages: [
        {
          key: orderEvent.order_id, // Key by order_id for ordering
          value: JSON.stringify({
            ...orderEvent,
            timestamp: orderEvent.timestamp || new Date().toISOString(),
          }),
          timestamp: Date.now().toString(),
        },
      ],
      acks: -1,
    });
    return result;
  }

  async publishDispatchEvent(dispatchEvent) {
    const result = await this.producer.send({
      topic: TOPICS.DISPATCH_EVENTS,
      messages: [
        {
          key: dispatchEvent.order_id, // Key by order_id for ordering
          value: JSON.stringify({
            ...dispatchEvent,
            timestamp: dispatchEvent.timestamp || new Date().toISOString(),
          }),
          timestamp: Date.now().toString(),
        },
      ],
      acks: -1,
    });
    return result;
  }
}

module.exports = new TelemetryProducer();