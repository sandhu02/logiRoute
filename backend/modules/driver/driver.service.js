const { Driver } = require('../../models');
const crypto = require('crypto');
const DriverLocationRepository = require('../../repositories/driverLocation.repository');

const DEFAULT_LAT = 31.5204;
const DEFAULT_LNG = 74.3587;

class DriverService {
  constructor() {
    this.driverLocationRepo = new DriverLocationRepository();
  }
  async createDriver(data) {
    try {
      const rawApiKey = crypto.randomBytes(32).toString('hex');
      // Auth expects raw api_key since it does direct lookup `where: { api_key: apiKey }`
      const driver = await Driver.create({
        ...data,
        api_key: rawApiKey
      });
      return { driver, apiKey: rawApiKey };
    } catch (error) {
      throw error;
    }
  }

  async getDriver(id, tenantId) {
    return await Driver.findOne({ where: { id, tenant_id: tenantId } });
  }

  async updateDriverStatus(id, tenantId, status) {
    await Driver.update({ status }, { where: { id, tenant_id: tenantId } });

    const existing = await this.driverLocationRepo.getDriverLocation(tenantId, id);
    await this.driverLocationRepo.updateDriverLocation(tenantId, id, {
      lat: existing?.lat || DEFAULT_LAT,
      lng: existing?.lng || DEFAULT_LNG,
      status,
      speed: existing?.speed || 0,
      heading: existing?.heading || 0,
      assigned_order_id: status === 'busy' ? existing?.assigned_order_id : undefined,
    });

    if (status === 'available') {
      const dispatchService = require('../dispatch/dispatch.service');
      setImmediate(() => dispatchService.matchPendingOrders(tenantId));
    }

    return true;
  }

  async listDrivers(tenantId) {
    return await Driver.findAll({ where: { tenant_id: tenantId } });
  }
}

module.exports = new DriverService();
