const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Tenant = sequelize.define('Tenant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  subdomain: {
    type: DataTypes.STRING(100),
    unique: true
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
  api_key_hash: {
    type: DataTypes.STRING(255),
    field: 'api_key_hash'   // store bcrypt hash of API key
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'tenants',
  timestamps: false,          // using created_at manually
  underscored: true
});

module.exports = Tenant;