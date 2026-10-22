'use strict';

const BANNER_PLACEMENTS = Object.freeze({
  HOME_HERO: 'home_hero',
  RETAIL_PROMO: 'retail_promo',
  WHOLESALE_PROMO: 'wholesale_promo',
  MANUFACTURING_PROMO: 'manufacturing_promo',
});

const BANNER_STATUSES = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SCHEDULED: 'scheduled',
  EXPIRED: 'expired',
});

module.exports = {
  BANNER_PLACEMENTS,
  BANNER_STATUSES,
};