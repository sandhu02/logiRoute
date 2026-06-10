require('dotenv').config();
const app = require('./app');
const { initDatabase } = require('./models');
const { connectKafka, initTopics } = require('./config/kafka');
const redisManager = require('./config/redis');
const socketManager = require('./config/socket');
const WorkerManager = require('./workers/workerManager');
const logger = require('./config/logger');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1. Initialize database
    await initDatabase();
    logger.info('Database initialized');

    // 2. Initialize Redis
    await redisManager.connect();
    logger.info('Redis connected');

    // 3. Initialize Kafka
    await connectKafka();
    await initTopics();
    logger.info('Kafka initialized');

    // 4. Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`HTTP server listening on port ${PORT}`);
    });

    // 5. Initialize Socket.IO with Redis adapter
    const io = await socketManager.initialize(server);
    logger.info('Socket.IO initialized');

    // 6. Start background workers
    const workerManager = new WorkerManager(io);
    await workerManager.startAll();
    logger.info('All workers started');

    // 7. Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await workerManager.stopAll();
      await socketManager.getIO().close();
      server.close();
      await redisManager.disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();