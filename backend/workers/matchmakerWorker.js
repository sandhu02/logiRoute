const { createConsumer } = require('../config/kafka');
const { TOPICS } = require('../config/topics');
const dispatchService = require('../modules/dispatch/dispatch.service');
const logger = require('../config/logger');

class MatchmakerWorker {
  constructor() {
    this.consumer = createConsumer('matchmaker-worker-group');
    this.isRunning = false;
  }

  async start() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: TOPICS.ORDER_EVENTS,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const orderEvent = JSON.parse(message.value.toString());
          
          // Only trigger matchmaking for newly created orders
          if (orderEvent.event_type === 'created') {
            logger.info(`Matchmaking triggered for order ${orderEvent.order_id}`);
            await dispatchService.findAndOfferDrivers(orderEvent.order_id);
          }
        } catch (error) {
          logger.error('Matchmaker worker error:', error);
        }
      },
      autoCommit: true,
    });

    this.isRunning = true;
    logger.info('Matchmaker worker started');
  }

  async stop() {
    if (this.isRunning) {
      await this.consumer.disconnect();
      this.isRunning = false;
      logger.info('Matchmaker worker stopped');
    }
  }
}

module.exports = MatchmakerWorker;