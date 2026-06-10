// Topic definitions matching your schema
const topicConfigs = [
  {
    name: 'driver-telemetry',
    partitions: 12, // Match number of CPU cores typically
    replicationFactor: 1,
    retentionDays: 7,
    configEntries: [
      {
        name: 'retention.ms',
        value: (7 * 24 * 60 * 60 * 1000).toString(), // 7 days
      },
      {
        name: 'retention.bytes',
        value: (50 * 1024 * 1024 * 1024).toString(), // 50GB
      },
      {
        name: 'cleanup.policy',
        value: 'delete',
      },
      {
        name: 'compression.type',
        value: 'producer',
      },
      {
        name: 'segment.bytes',
        value: (512 * 1024 * 1024).toString(), // 512MB segments
      },
      {
        name: 'min.insync.replicas',
        value: '2',
      },
    ],
    keyType: 'driver_id', // All telemetry from same driver -> same partition
  },
  {
    name: 'order-events',
    partitions: 6,
    replicationFactor: 1,
    retentionDays: 30,
    configEntries: [
      {
        name: 'retention.ms',
        value: (30 * 24 * 60 * 60 * 1000).toString(),
      },
      {
        name: 'retention.bytes',
        value: (100 * 1024 * 1024 * 1024).toString(), // 100GB
      },
      {
        name: 'cleanup.policy',
        value: 'delete',
      },
      {
        name: 'compression.type',
        value: 'producer',
      },
      {
        name: 'segment.bytes',
        value: (1024 * 1024 * 1024).toString(), // 1GB segments
      },
    ],
    keyType: 'order_id', // All events for same order -> same partition
  },
  {
    name: 'dispatch-events',
    partitions: 6,
    replicationFactor: 1,
    retentionDays: 30,
    configEntries: [
      {
        name: 'retention.ms',
        value: (30 * 24 * 60 * 60 * 1000).toString(),
      },
      {
        name: 'retention.bytes',
        value: (50 * 1024 * 1024 * 1024).toString(),
      },
      {
        name: 'cleanup.policy',
        value: 'delete',
      },
      {
        name: 'compression.type',
        value: 'producer',
      },
    ],
    keyType: 'order_id', // All dispatch attempts for same order -> same partition
  },
];

// Helper to create topics if they don't exist
async function ensureTopics(admin) {
  const existingTopics = await admin.listTopics();
  const topicsToCreate = topicConfigs.filter(
    (topic) => !existingTopics.includes(topic.name)
  );

  if (topicsToCreate.length > 0) {
    await admin.createTopics({
      topics: topicsToCreate.map((topic) => ({
        topic: topic.name,
        numPartitions: topic.partitions,
        replicationFactor: topic.replicationFactor,
        configEntries: topic.configEntries,
      })),
      waitForLeaders: true,
      timeout: 30000,
    });
    console.log(`Created topics: ${topicsToCreate.map((t) => t.name).join(', ')}`);
  } else {
    console.log('All topics already exist');
  }

  // Verify partitions for existing topics
  for (const topic of topicConfigs) {
    const metadata = await admin.fetchTopicMetadata({ topics: [topic.name] });
    const topicMetadata = metadata.topics[0];
    if (topicMetadata.partitions.length !== topic.partitions) {
      console.warn(
        `⚠️ Topic ${topic.name} has ${topicMetadata.partitions.length} partitions, expected ${topic.partitions}`
      );
    }
  }
}

module.exports = {
  topicConfigs,
  ensureTopics,
  TOPICS: {
    DRIVER_TELEMETRY: 'driver-telemetry',
    ORDER_EVENTS: 'order-events',
    DISPATCH_EVENTS: 'dispatch-events',
  },
};