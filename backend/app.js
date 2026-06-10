const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const authRoutes = require('./modules/auth/auth.routes');
const telemetryRoutes = require('./modules/telemetry/telemetry.routes');
const dispatchRoutes = require('./modules/dispatch/dispatch.routes');
const dispatcherRoutes = require('./modules/dispatcher/dispatcher.routes');

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/telemetry', telemetryRoutes);
app.use('/api/v1/dispatch', dispatchRoutes);
app.use('/api/v1/dispatchers', dispatcherRoutes);

try {
  const tenantRoutes = require('./modules/tenant/tenant.routes');
  app.use('/api/v1/tenants', tenantRoutes);
} catch (e) {
  console.log('Tenant routes not yet implemented');
}

try {
  const driverRoutes = require('./modules/driver/driver.routes');
  app.use('/api/v1/drivers', driverRoutes);
} catch (e) {
  console.log('Driver routes not yet implemented');
}

// Orders and Customers
try {
  const orderRoutes = require('./modules/order/order.routes');
  app.use('/api/v1/orders', orderRoutes);
} catch (e) {
  console.log('Order routes not yet implemented');
}

try {
  const customerRoutes = require('./modules/customer/customer.routes');
  app.use('/api/v1/customers', customerRoutes);
} catch (e) {
  console.log('Customer routes not yet implemented');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Basic error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

module.exports = app;
