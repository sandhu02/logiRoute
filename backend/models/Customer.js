const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Tenant = require('./Tenant');

const Customer = sequelize.define('Customer', {
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
    type: DataTypes.STRING(255),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255)
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'customers',
  timestamps: false,
  underscored: true,
  indexes: [
    {
      name: 'customers_tenant_phone_idx',
      fields: ['tenant_id', 'phone']   // for quick lookup by phone
    }
  ]
});

Customer.belongsTo(Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
Tenant.hasMany(Customer, { foreignKey: 'tenant_id', as: 'customers' });

module.exports = Customer;