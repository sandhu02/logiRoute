const { Kafka } = require('kafkajs');
const { TOPICS } = require('../config/topics');

class ReplayConsumer {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'replay-consumer',
      brokers: process.env.KAFKA_BROKERS.split(','),
    });
  }

  async replayDriverTelemetry(tenantId, driverId, startTime, endTime, callback) {
    const consumer = this.kafka.consumer({ groupId: `replay-${Date.now()}` });
    await consumer.connect();
    
    // Get topic metadata to find partitions
    const admin = this.kafka.admin();
    await admin.connect();
    const metadata = await admin.fetchTopicMetadata({
      topics: [TOPICS.DRIVER_TELEMETRY],
    });
    await admin.disconnect();
    
    const topicMetadata = metadata.topics[0];
    const partitions = topicMetadata.partitions.map(p => p.partitionId);
    
    // Subscribe to all partitions
    await consumer.subscribe({
      topic: TOPICS.DRIVER_TELEMETRY,
      fromBeginning: false,
    });
    
    // Seek to the start time for each partition
    for (const partition of partitions) {
      const offsets = await consumer.offsetsForTimes([
        {
          topic: TOPICS.DRIVER_TELEMETRY,
          partition,
          timestamp: startTime.getTime(),
        },
      ]);
      
      if (offsets[0].offset) {
        consumer.seek({
          topic: TOPICS.DRIVER_TELEMETRY,
          partition,
          offset: offsets[0].offset,
        });
      }
    }
    
    const messages = [];
    
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const telemetry = JSON.parse(message.value.toString());
        
        // Filter by driver_id and time range
        if (
          telemetry.driver_id === driverId &&
          telemetry.tenant_id === tenantId &&
          new Date(telemetry.timestamp) >= startTime &&
          new Date(telemetry.timestamp) <= endTime
        ) {
          messages.push(telemetry);
          callback(telemetry);
        }
        
        // Stop if we've passed end time
        if (new Date(telemetry.timestamp) > endTime) {
          await consumer.stop();
        }
      },
    });
    
    // Return after timeout or when done
    return new Promise((resolve) => {
      setTimeout(async () => {
        await consumer.disconnect();
        resolve(messages);
      }, 5000);
    });
  }

  async replayOrderEvents(orderId, startTime, endTime) {
    const consumer = this.kafka.consumer({ groupId: `replay-orders-${Date.now()}` });
    await consumer.connect();
    
    // Since order_id is the key, all events for this order are in one partition
    // We can use the key to filter
    await consumer.subscribe({
      topic: TOPICS.ORDER_EVENTS,
      fromBeginning: false,
    });
    
    const events = [];
    
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (message.key.toString() === orderId) {
          const event = JSON.parse(message.value.toString());
          const eventTime = new Date(event.timestamp);
          
          if (eventTime >= startTime && eventTime <= endTime) {
            events.push(event);
          }
        }
      },
    });
    
    return new Promise((resolve) => {
      setTimeout(async () => {
        await consumer.disconnect();
        resolve(events);
      }, 10000);
    });
  }
}

module.exports = ReplayConsumer;