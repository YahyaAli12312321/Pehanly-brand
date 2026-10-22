import { http, getData, getList } from './http';

export const authApi = {
  me: () => getData(http.get('/auth/me')),
  login: (body) => getData(http.post('/auth/login', body)),
  // The storefront only ever creates customer accounts: the role is always sent, and cannot be overridden here.
  register: (body) => getData(http.post('/auth/register', { ...body, role: 'customer' })),
  logout: () => getData(http.post('/auth/logout')),
  forgotPassword: (body) => http.post('/auth/forgot-password', body).then((r) => r.data),
  resetPassword: (body) => http.post('/auth/reset-password', body).then((r) => r.data),
};

export const accountApi = {
  profile: () => getData(http.get('/account')),
  updateProfile: (body) => getData(http.patch('/account', body)),
  changePassword: (body) => http.post('/account/change-password', body).then((r) => r.data),
  logoutOthers: () => http.post('/account/logout-other-sessions').then((r) => r.data),
  addresses: () => getData(http.get('/account/addresses')),
  addAddress: (body) => getData(http.post('/account/addresses', body)),
  updateAddress: (id, body) => getData(http.patch(`/account/addresses/${id}`, body)),
  deleteAddress: (id) => http.delete(`/account/addresses/${id}`).then((r) => r.data),
};

export const ordersApi = {
  create: (body) => getData(http.post('/orders', body)),
  mine: (params) => getList(http.get('/orders/my', { params })),
  one: (id) => getData(http.get(`/orders/my/${id}`)),
  trackGuest: (body) => getData(http.post('/orders/guest/track', body)),
  requestCancellation: (id, body) => getData(http.post(`/orders/my/${id}/cancellation`, body)),
};

export const checkoutApi = {
  shipping: (body) => getData(http.post('/shipping/calculate', body)),
  // PKR sends no extra params (identical to the original request); other currencies ask the backend for THEIR rules.
  freeShippingInfo: (currency = 'PKR') =>
    getData(http.get('/shipping/free-shipping', currency && currency !== 'PKR' ? { params: { currency } } : undefined)),
  validateCoupon: (body) => getData(http.post('/coupons/validate', body)),
};

export const returnsApi = {
  mine: (params) => getList(http.get('/returns/my', { params })),
  request: (orderId, body) => getData(http.post(`/returns/orders/${orderId}`, body)),
};
