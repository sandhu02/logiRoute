const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Order = require('./Order');
const Driver = require('./Driver');

const DispatchOffer = sequelize.define('DispatchOffer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  order_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: Order, key: 'id' },
    field: 'order_id'
  },
  driver_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: Driver, key: 'id' },
    field: 'driver_id'
  },
  offered_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'offered_at'
  },
  responded_at: {
    type: DataTypes.DATE,
    field: 'responded_at'
  },
  accepted: {
    type: DataTypes.BOOLEAN,
    defaultValue: null,
    field: 'accepted'
  }
}, {
  tableName: 'dispatch_offers',
  timestamps: false,
  underscored: true
});

// Associations
DispatchOffer.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
DispatchOffer.belongsTo(Driver, { foreignKey: 'driver_id', as: 'driver' });
Order.hasMany(DispatchOffer, { foreignKey: 'order_id', as: 'offers' });
Driver.hasMany(DispatchOffer, { foreignKey: 'driver_id', as: 'offers' });

module.exports = DispatchOffer;