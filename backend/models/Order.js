const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Tenant = require('./Tenant');
const Driver = require('./Driver');
const Customer = require('./Customer');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: Tenant, key: 'id' },
    field: 'tenant_id'
  },
  customer_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: Customer, key: 'id' },
    field: 'customer_id'
  },
  pickup_lat: {
    type: DataTypes.DECIMAL(10, 8),
    field: 'pickup_lat'
  },
  pickup_lng: {
    type: DataTypes.DECIMAL(11, 8),
    field: 'pickup_lng'
  },
  dropoff_lat: {
    type: DataTypes.DECIMAL(10, 8),
    field: 'dropoff_lat'
  },
  dropoff_lng: {
    type: DataTypes.DECIMAL(11, 8),
    field: 'dropoff_lng'
  },
  status: {
    type: DataTypes.STRING(30),
    defaultValue: 'pending',
    validate: {
      isIn: [['pending', 'assigned', 'picked_up', 'delivered', 'cancelled']]
    }
  },
  assigned_driver_id: {
    type: DataTypes.UUID,
    references: { model: Driver, key: 'id' },
    field: 'assigned_driver_id'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'orders',
  timestamps: false,
  underscored: true,
  indexes: [
    {
      name: 'orders_tenant_status_idx',
      fields: ['tenant_id', 'status']
    },
    {
      name: 'orders_tenant_updated_at_idx',
      fields: ['tenant_id', 'updated_at']
    },
    {
      name: 'orders_customer_id_idx',
      fields: ['customer_id']   // for customer order history
    }
  ]
});

// Associations
Order.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Order.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Order.belongsTo(Driver, { foreignKey: 'assigned_driver_id', as: 'assignedDriver' });
Tenant.hasMany(Order, { foreignKey: 'tenant_id', as: 'orders' });
Customer.hasMany(Order, { foreignKey: 'customer_id', as: 'orders' });
Driver.hasMany(Order, { foreignKey: 'assigned_driver_id', as: 'assignedOrders' });

module.exports = Order;