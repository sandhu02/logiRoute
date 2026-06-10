const TrackingWorker = require('../consumers/TrackingWorker');
const MatchmakerWorker = require('./matchmakerWorker');
const logger = require('../config/logger');

class WorkerManager {
  constructor(io) {
    this.io = io;
    this.trackingWorker = new TrackingWorker(null, io); // uses default redis inside
    this.matchmakerWorker = new MatchmakerWorker();
  }

  async startAll() {
    try {
      logger.info('Starting background workers...');
      
      await Promise.all([
        this.trackingWorker.start(),
        this.matchmakerWorker.start()
      ]);
      
      logger.info('All background workers started successfully.');
    } catch (error) {
      logger.error('Failed to start workers:', error);
      throw error;
    }
  }

  async stopAll() {
    try {
      logger.info('Stopping background workers...');
      
      await Promise.all([
        this.trackingWorker.stop(),
        this.matchmakerWorker.stop()
      ]);
      
      logger.info('All background workers stopped successfully.');
    } catch (error) {
      logger.error('Error stopping workers:', error);
    }
  }
}

module.exports = WorkerManager;
