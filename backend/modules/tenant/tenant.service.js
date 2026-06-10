const { Tenant } = require('../../models');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

class TenantService {
  async createTenant(data) {
    try {
      const tenant = await Tenant.create(data);
      return tenant;
    } catch (error) {
      throw error;
    }
  }

  async getTenant(id) {
    return await Tenant.findByPk(id);
  }

  async getTenantBySubdomain(subdomain) {
    return await Tenant.findOne({ where: { subdomain } });
  }

  async generateTenantApiKey(tenantId) {
    const rawApiKey = crypto.randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(rawApiKey, 10);
    
    await Tenant.update({ api_key_hash: hash }, { where: { id: tenantId } });
    
    return { apiKey: rawApiKey }; // Only return this once
  }
}

module.exports = new TenantService();
