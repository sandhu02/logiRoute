const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Tenant = require('./Tenant');

const Driver = sequelize.define('Driver', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: Tenant, key: 'id' },
    onDelete: 'CASCADE',
    field: 'tenant_id'
  },
  name: {
    type: DataTypes.STRING(255)
  },
  phone: {
    type: DataTypes.STRING(50)
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'offline',
    validate: {
      isIn: [['offline', 'available', 'busy']]
    }
  },
  api_key: {
    type: DataTypes.STRING(255),
    field: 'api_key',
    comment: 'Stored encrypted (e.g., AES-256)'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'drivers',
  timestamps: false,
  underscored: true,
  indexes: [
    {
      name: 'drivers_tenant_status_idx',
      fields: ['tenant_id', 'status']
    }
  ]
});

// Association
Driver.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(Driver, { foreignKey: 'tenant_id', as: 'drivers' });

module.exports = Driver;