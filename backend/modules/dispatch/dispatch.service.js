const { Order, Driver, DispatchOffer } = require('../../models');
const DriverLocationRepository = require('../../repositories/driverLocation.repository');
const dispatchProducer = require('./dispatch.producer');
const socketManager = require('../../config/socket');
const logger = require('../../config/logger');

class DispatchService {
  constructor() {
    this.driverLocationRepo = new DriverLocationRepository();
    this.activeOffers = new Map(); // orderId -> { timer, offers, order }
  }

  async hasActiveOffers(orderId) {
    if (this.activeOffers.has(orderId)) return true;

    const { Op } = require('sequelize');
    const thirtySecondsAgo = new Date(Date.now() - 30000);
    const count = await DispatchOffer.count({
      where: {
        order_id: orderId,
        responded_at: null,
        offered_at: { [Op.gte]: thirtySecondsAgo },
      },
    });
    return count > 0;
  }

  async matchPendingOrders(tenantId) {
    const pendingOrders = await Order.findAll({
      where: { tenant_id: tenantId, status: 'pending' },
      order: [['created_at', 'ASC']],
    });

    for (const order of pendingOrders) {
      if (!(await this.hasActiveOffers(order.id))) {
        await this.findAndOfferDrivers(order.id);
      }
    }
  }

  async findAndOfferDrivers(orderId) {
    const order = await Order.findByPk(orderId);
    if (!order || order.status !== 'pending') {
      logger.warn(`Order ${orderId} not available for dispatch`);
      return;
    }

    if (await this.hasActiveOffers(orderId)) {
      logger.info(`Order ${orderId} already has active offers`);
      return;
    }

    // Find nearby available drivers (50km radius for broader matching)
    let nearbyDrivers = await this.driverLocationRepo.findNearbyDrivers(
      order.tenant_id,
      order.pickup_lng,
      order.pickup_lat,
      50
    );

    // Fallback: offer to all available drivers in the tenant
    if (nearbyDrivers.length === 0) {
      const available = await this.driverLocationRepo.getAvailableDrivers(order.tenant_id);
      nearbyDrivers = available.map((driver) => ({
        ...driver,
        distance_km: this.haversineKm(
          Number(order.pickup_lat),
          Number(order.pickup_lng),
          driver.lat,
          driver.lng
        ),
      }));
    }

    if (nearbyDrivers.length === 0) {
      logger.info(`No available drivers for order ${orderId}`);
      return;
    }
    
    // Score and sort drivers
    const scoredDrivers = this.scoreDrivers(nearbyDrivers, order);
    const topDrivers = scoredDrivers.slice(0, 5); // Offer to top 5 drivers
    
    // Create dispatch offers
    const offers = [];
    for (const driver of topDrivers) {
      const offer = await DispatchOffer.create({
        order_id: order.id,
        driver_id: driver.driver_id,
        offered_at: new Date(),
      });
      
      offers.push(offer);
      
      // Emit Socket.IO offer to specific driver
      socketManager.emitDispatchOffer(order.tenant_id, driver.driver_id, {
        offer_id: offer.id,
        order_id: order.id,
        pickup: { lat: order.pickup_lat, lng: order.pickup_lng },
        dropoff: { lat: order.dropoff_lat, lng: order.dropoff_lng },
        distance_km: driver.distance_km,
        expires_in: 30,
      });
      
      // Publish to Kafka for audit
      await dispatchProducer.publishDispatchEvent({
        order_id: order.id,
        tenant_id: order.tenant_id,
        dispatch_type: 'offer_sent',
        driver_id: driver.driver_id,
        offer_id: offer.id,
        match_score: driver.score,
        distance_meters: driver.distance_km * 1000,
      });
    }
    
    // Start timeout timer
    const timer = setTimeout(async () => {
      await this.expireOffers(order.id);
    }, 30000); // 30 seconds
    
    this.activeOffers.set(order.id, {
      timer,
      offers,
      order,
      drivers: topDrivers,
    });
    
    logger.info(`Sent offers for order ${orderId} to ${topDrivers.length} drivers`);
  }

  haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  scoreDrivers(drivers, order) {
    return drivers.map(driver => {
      let score = 100;
      
      // Closer distance = higher score
      const distanceScore = Math.max(0, 100 - (driver.distance_km * 10));
      score = score * 0.6 + distanceScore * 0.4;
      
      // Factor in response time (if available)
      const responseTimeScore = driver.avg_response_time ? 
        Math.max(0, 100 - (driver.avg_response_time / 10)) : 50;
      score = score * 0.7 + responseTimeScore * 0.3;
      
      return { ...driver, score };
    }).sort((a, b) => b.score - a.score);
  }

  async acceptOffer(orderId, driverId, offerId) {
    const activeOffer = this.activeOffers.get(orderId);
    let siblingOffers = [];

    if (activeOffer) {
      clearTimeout(activeOffer.timer);

      const isValidDriver = activeOffer.offers.some((o) => o.driver_id === driverId);
      if (!isValidDriver) {
        throw new Error('Driver not eligible for this offer');
      }

      siblingOffers = activeOffer.offers;
    } else {
      const { Op } = require('sequelize');
      const thirtySecondsAgo = new Date(Date.now() - 30000);

      const offer = await DispatchOffer.findOne({
        where: {
          id: offerId,
          driver_id: driverId,
          order_id: orderId,
          responded_at: null,
          offered_at: { [Op.gte]: thirtySecondsAgo },
        },
        include: [{ model: Order, as: 'order' }],
      });

      if (!offer || !offer.order || offer.order.status !== 'pending') {
        throw new Error('No active offer found for this order');
      }

      siblingOffers = await DispatchOffer.findAll({
        where: { order_id: orderId, responded_at: null },
      });
    }

    const existingAccepted = await DispatchOffer.findOne({
      where: { order_id: orderId, accepted: true },
    });
    if (existingAccepted) {
      throw new Error('No active offer found for this order');
    }

    await DispatchOffer.update(
      { responded_at: new Date(), accepted: true },
      { where: { id: offerId, driver_id: driverId } }
    );

    const order = await Order.findByPk(orderId);
    if (!order || order.status !== 'pending') {
      throw new Error('Order no longer available');
    }

    await order.update({
      status: 'assigned',
      assigned_driver_id: driverId,
      updated_at: new Date(),
    });

    await Driver.update(
      { status: 'busy', updated_at: new Date() },
      { where: { id: driverId } }
    );

    const driverLocation = await this.driverLocationRepo.getDriverLocation(order.tenant_id, driverId);
    await this.driverLocationRepo.updateDriverLocation(
      order.tenant_id,
      driverId,
      {
        lat: driverLocation?.lat,
        lng: driverLocation?.lng,
        status: 'busy',
        assigned_order_id: orderId,
      }
    );

    await dispatchProducer.publishDispatchEvent({
      order_id: orderId,
      tenant_id: order.tenant_id,
      dispatch_type: 'offer_accepted',
      driver_id: driverId,
      offer_id: offerId,
    });

    for (const offer of siblingOffers) {
      if (offer.driver_id !== driverId) {
        socketManager.emitDispatchOffer(order.tenant_id, offer.driver_id, {
          order_id: orderId,
          accepted_by_other: true,
        });

        await DispatchOffer.update(
          { responded_at: new Date(), accepted: false },
          { where: { id: offer.id } }
        );
      }
    }

    const updatedOrder = await Order.findByPk(orderId);
    const orderPayload = updatedOrder.toJSON();

    socketManager.emitOrderAssigned(order.tenant_id, orderId, driverId);
    socketManager.emitOrderUpdated(orderPayload, order.tenant_id);
    socketManager.emitDriverStatus(order.tenant_id, driverId, 'available', 'busy');
    socketManager.emitDispatchResponse(order.tenant_id, orderId, driverId, true);

    this.activeOffers.delete(orderId);

    logger.info(`Offer ${offerId} accepted by driver ${driverId} for order ${orderId}`);
    return { success: true, order: orderPayload };
  }

  async getDriverOffers(driverId) {
    const { Op } = require('sequelize');
    const thirtySecondsAgo = new Date(Date.now() - 30000);

    const offers = await DispatchOffer.findAll({
      where: {
        driver_id: driverId,
        responded_at: null,
        offered_at: { [Op.gte]: thirtySecondsAgo },
      },
      include: [{ model: Order, as: 'order' }],
      order: [['offered_at', 'DESC']],
    });

    return offers.map((offer) => {
      const order = offer.order;
      const expiresAt = new Date(offer.offered_at.getTime() + 30000);
      const expiresIn = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));

      return {
        offer_id: offer.id,
        order_id: offer.order_id,
        offered_at: offer.offered_at,
        expires_in: expiresIn,
        pickup: order ? { lat: order.pickup_lat, lng: order.pickup_lng } : null,
        dropoff: order ? { lat: order.dropoff_lat, lng: order.dropoff_lng } : null,
        order: order ? order.toJSON() : null,
      };
    });
  }

  async expireOffers(orderId) {
    const activeOffer = this.activeOffers.get(orderId);
    if (!activeOffer) return;
    
    // Update all offers as expired
    for (const offer of activeOffer.offers) {
      await DispatchOffer.update(
        { responded_at: new Date(), accepted: false },
        { where: { id: offer.id } }
      );
      
      // Notify driver that offer expired
      socketManager.emitDispatchOffer(activeOffer.order.tenant_id, offer.driver_id, {
        order_id: orderId,
        expired: true,
      });
    }
    
    // Update order status
    await Order.update(
      { status: 'pending', updated_at: new Date() },
      { where: { id: orderId } }
    );
    
    // Publish expiration event
    await dispatchProducer.publishDispatchEvent({
      order_id: orderId,
      tenant_id: activeOffer.order.tenant_id,
      dispatch_type: 'offer_expired',
    });
    
    this.activeOffers.delete(orderId);
    logger.info(`Offers expired for order ${orderId}`);
  }
}

module.exports = new DispatchService();