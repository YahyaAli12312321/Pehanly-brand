import { get, post, cleanParams } from '../lib/apiClient';

/**
 * Inventory (admin). Backend: /admin/inventory — inventory.read (GET) / inventory.manage (adjust).
 * The ONLY way to change stock of an existing SKU. Terminology: stock = on-hand, reservedStock, available = stock - reserved.
 *
 * Row: { sku, size, price, isEnabled, stock, reservedStock, available, lowStockThreshold|null, stockStatus(ok|low|out),
 *        product{_id,name,slug,category}, variant{_id,colorName,variantCode} }
 */
export const ADJUST_REASONS = [
  { value: 'factory_inward_batch_received', label: 'Factory Inward Batch Received', addOnly: true },
  { value: 'physical_cycle_count_discrepancy', label: 'Physical Cycle Count Discrepancy' },
  { value: 'fabric_qc_defect_damaged_return', label: 'Fabric QC Defect / Damaged Return' },
  { value: 'sample_pull_institutional_client', label: 'Sample Pull for Institutional Client' },
  { value: 'direct_sales_counter_allocation', label: 'Direct Sales Counter Allocation' },
];

export const inventoryApi = {
  /** params: search, filter(all|out|critical|low), category, product, sortBy, sortDir, page, limit */
  list: async (params = {}) => {
    const body = await get('/admin/inventory', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },
  /** { trackedSkus, warehouseOnHand, reservedForOrders, availableToSell, attentionRequired, outOfStock, criticalStock } */
  summary: async () => (await get('/admin/inventory/summary')).data,
  /** InventoryTransaction rows (newest first): { _id, sku, type, quantity, previousStock, newStock, reason, notes, reference, createdBy{name}, createdAt } */
  history: async (sku, params = {}) => {
    const body = await get(`/admin/inventory/${encodeURIComponent(sku)}/history`, cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },
  /** direction: add|remove, quantity >= 1, reason in ADJUST_REASONS -> { sku, stock, reservedStock, available, lowStockThreshold, stockStatus, transactionId } */
  adjust: async (sku, { direction, quantity, reason, notes, reference }) => {
    const body = { direction, quantity: Number(quantity), reason };
    if (direction === 'add' && reason === 'factory_inward_batch_received') body.mode = 'stock_in';
    if (notes && notes.trim()) body.notes = notes.trim();
    if (reference && reference.trim()) body.reference = reference.trim();
    return (await post(`/admin/inventory/${encodeURIComponent(sku)}/adjust`, body)).data;
  },
};
