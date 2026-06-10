// Driver telemetry schema
const driverTelemetrySchema = {
  type: 'object',
  required: ['driver_id', 'tenant_id', 'lat', 'lng', 'timestamp'],
  properties: {
    driver_id: { type: 'string', format: 'uuid' },
    tenant_id: { type: 'string', format: 'uuid' },
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
    timestamp: { type: 'string', format: 'date-time' },
    speed: { type: 'number', minimum: 0, maximum: 300 },
    heading: { type: 'number', minimum: 0, maximum: 359 },
    accuracy: { type: 'number', minimum: 0 },
    altitude: { type: 'number' },
    battery_level: { type: 'number', minimum: 0, maximum: 100 },
    ignition: { type: 'boolean' },
  },
};

// Order events schema
const orderEventSchema = {
  type: 'object',
  required: ['order_id', 'tenant_id', 'event_type', 'timestamp'],
  properties: {
    order_id: { type: 'string', format: 'uuid' },
    tenant_id: { type: 'string', format: 'uuid' },
    event_type: {
      type: 'string',
      enum: ['created', 'assigned', 'picked_up', 'delivered', 'cancelled', 'updated'],
    },
    timestamp: { type: 'string', format: 'date-time' },
    data: { type: 'object' }, // Additional event-specific data
    previous_status: { type: 'string' },
    new_status: { type: 'string' },
    actor_id: { type: 'string', format: 'uuid' }, // driver_id or customer_id
  },
};

// Dispatch events schema
const dispatchEventSchema = {
  type: 'object',
  required: ['order_id', 'tenant_id', 'dispatch_type', 'timestamp'],
  properties: {
    order_id: { type: 'string', format: 'uuid' },
    tenant_id: { type: 'string', format: 'uuid' },
    dispatch_type: {
      type: 'string',
      enum: ['offer_sent', 'offer_accepted', 'offer_rejected', 'offer_expired', 'assignment'],
    },
    timestamp: { type: 'string', format: 'date-time' },
    driver_id: { type: 'string', format: 'uuid' },
    offer_id: { type: 'string', format: 'uuid' },
    match_score: { type: 'number', minimum: 0, maximum: 1 },
    eta_seconds: { type: 'number' },
    distance_meters: { type: 'number' },
  },
};

// Validation function
const validateMessage = (message, schema) => {
  // Simple validation - use ajv or similar in production
  const errors = [];
  
  for (const requiredField of schema.required || []) {
    if (!message[requiredField]) {
      errors.push(`Missing required field: ${requiredField}`);
    }
  }
  
  // Type checking
  if (schema.properties.timestamp && message.timestamp) {
    if (isNaN(Date.parse(message.timestamp))) {
      errors.push(`Invalid timestamp format: ${message.timestamp}`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  driverTelemetrySchema,
  orderEventSchema,
  dispatchEventSchema,
  validateMessage,
};