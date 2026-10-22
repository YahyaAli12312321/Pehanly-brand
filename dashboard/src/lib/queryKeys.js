/**
 * Central query-key factory. Every server-state query lives under a stable root key so
 * mutations can invalidate a whole module with `queryClient.invalidateQueries({ queryKey: keys.orders.all })`.
 */
const k = (root) => ({
  all: [root],
  lists: () => [root, 'list'],
  list: (params) => [root, 'list', params],
  detail: (id) => [root, 'detail', id],
});

export const keys = {
  auth: { me: ['auth', 'me'] },
  dashboard: { summary: ['dashboard', 'summary'] },
  analytics: { all: ['analytics'], range: (range) => ['analytics', range] },
  categories: { ...k('categories'), summary: ['categories', 'summary'], audiences: ['categories', 'audiences'] },
  products: { ...k('products'), summary: ['products', 'summary'] },
  inventory: { ...k('inventory'), summary: ['inventory', 'summary'], history: (sku, p) => ['inventory', 'history', sku, p] },
  orders: { ...k('orders'), summary: ['orders', 'summary'] },
  cancellations: k('cancellations'),
  returns: k('returns'),
  customers: { ...k('customers'), summary: ['customers', 'summary'], orders: (id, p) => ['customers', 'orders', id, p] },
  payments: k('payments'),
  wholesale: { ...k('wholesale'), stats: ['wholesale', 'stats'], packs: (p) => ['wholesale', 'packs', p] },
  manufacturing: { ...k('manufacturing'), catalog: (type) => ['manufacturing', 'catalog', type] },
  printing: { ...k('printing'), services: (p) => ['printing', 'services', p] },
  quotes: k('quotes'),
  coupons: k('coupons'),
  banners: { ...k('banners'), stats: ['banners', 'stats'] },
  reviews: k('reviews'),
  notifications: { all: ['notifications'], list: (p) => ['notifications', 'list', p], unread: ['notifications', 'unread'] },
  settings: { all: ['settings'] },
  shipping: k('shipping'),
  staff: { ...k('staff'), permissions: ['staff', 'permissions'] },
  audit: k('audit'),
  media: k('media'),
  health: ['health'],
};
