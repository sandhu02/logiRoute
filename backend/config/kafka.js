const { Kafka, Partitioners } = require('kafkajs');
const { logLevel } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'dispatch-system',
  brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['kafka:9092'],
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
  logLevel: logLevel.INFO,
  ssl: process.env.KAFKA_SSL === 'true' ? {
    rejectUnauthorized: false,
  } : false,
  sasl: process.env.KAFKA_SASL_USERNAME ? {
    mechanism: 'scram-sha-256',
    username: process.env.KAFKA_SASL_USERNAME,
    password: process.env.KAFKA_SASL_PASSWORD,
  } : undefined,
});

// Admin client for topic management
const admin = kafka.admin();

// Producer instance
const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
  allowAutoTopicCreation: false, // We'll create topics manually via admin
  transactionTimeout: 30000,
  idempotent: true, // Enable idempotent producer to prevent duplicates
  maxInFlightRequests: 5,
});

// Consumer instances (will be created per consumer group)
const createConsumer = (groupId) => {
  return kafka.consumer({
    groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    maxBytesPerPartition: 1048576, // 1MB
    maxWaitTimeInMs: 5000,
    retry: {
      maxRetryTime: 10000,
      initialRetryTime: 100,
      retries: 10,
    },
  });
};

const { ensureTopics } = require('./topics');

const connectKafka = async () => {
  await admin.connect();
  await producer.connect();
};

const initTopics = async () => {
  await ensureTopics(admin);
};

module.exports = {
  kafka,
  admin,
  producer,
  createConsumer,
  connectKafka,
  initTopics,
};