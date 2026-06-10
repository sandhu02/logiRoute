const { producer } = require('../../config/kafka');
const { TOPICS } = require('../../config/topics');
const logger = require('../../config/logger');

class DispatchProducer {
  constructor() {
    this.producer = producer;
    this.isConnected = false;
  }

  async connect() {
    if (!this.isConnected) {
      await this.producer.connect();
      this.isConnected = true;
    }
  }

  async publishDispatchEvent(eventData) {
    try {
      await this.connect();
      
      const message = {
        key: eventData.order_id, // Ensure events for the same order go to the same partition
        value: JSON.stringify({
          ...eventData,
          timestamp: new Date().toISOString()
        })
      };

      await this.producer.send({
        topic: TOPICS.DISPATCH_EVENTS || 'dispatch-events', // Fallback to 'dispatch-events' if undefined
        messages: [message]
      });

    } catch (error) {
      logger.error('Failed to publish dispatch event to Kafka', error);
      // In a real production system, you might not want to throw or fail dispatch if Kafka is down
    }
  }
}

module.exports = new DispatchProducer();
