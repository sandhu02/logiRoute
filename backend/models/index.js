const sequelize = require('../config/database');

const Tenant = require('./Tenant');
const Driver = require('./Driver');
const Customer = require('./Customer');
const Order = require('./Order');
const DispatchOffer = require('./Dispatch');

const initDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    // Sync all models
    await sequelize.sync({ alter: true });
    console.log('Database synchronized.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  initDatabase,
  Tenant,
  Driver,
  Customer,
  Order,
  DispatchOffer
};
