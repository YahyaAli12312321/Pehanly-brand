'use strict';

const { WHATSAPP_EVENTS: E } = require('../../../constants/WhatsApp');
const { money, lines } = require('./format');

module.exports = {
  [E.ADMIN_DAILY_SUMMARY]: (v) => lines([`*PEHANLY daily summary* - ${v.date}`, ['Orders', v.totalOrders], ['Sales (orders placed)', money(v.totalSales, 'PKR')], ['Revenue (paid)', money(v.totalRevenue, 'PKR')], ['Pending payments', v.pendingPayments], ['Wholesale orders', v.wholesaleOrders], ['Low-stock products', v.lowStockProducts]]),
  [E.ADMIN_TEST]: (v) => lines(['*PEHANLY test notification*', 'This is a test message from the admin dashboard.', ['Provider', v.provider], v.simulated ? 'Simulated: no real WhatsApp message is sent.' : null]),
};
