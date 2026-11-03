import { describe, it, expect } from 'vitest';
import { statusLabel, canRetry, eventLabel, buildListParams } from './whatsapp';

describe('whatsapp helpers', () => {
  it('labels a mock "sent" message as simulated, never as delivered', () => {
    expect(statusLabel({ status: 'sent', simulated: true }).label).toBe('Sent (simulated)');
    expect(statusLabel({ status: 'sent', simulated: false }).label).toBe('Sent');
    expect(statusLabel({ status: 'delivered' }).label).toBe('Delivered');
    expect(statusLabel(null).label).toBe('-');
  });
  it('only failed messages are retryable', () => {
    expect(canRetry({ status: 'failed' })).toBe(true);
    for (const s of ['pending', 'processing', 'sent', 'delivered', 'skipped']) expect(canRetry({ status: s })).toBe(false);
  });
  it('humanizes event keys', () => {
    expect(eventLabel('customer_order_shipped')).toBe('Customer order shipped');
    expect(eventLabel('')).toBe('-');
  });
  it('builds list params without empty or "all" filters', () => {
    const iso = (v, end) => `${v}${end ? 'E' : 'S'}`;
    expect(buildListParams({ page: 2, limit: 20, status: 'all', event: 'all', recipientType: 'all', search: '  ', from: '', to: '' }, iso)).toEqual({ page: 2, limit: 20 });
    expect(buildListParams({ page: 1, limit: 10, status: 'failed', event: 'admin_low_stock', recipientType: 'admin', search: ' PH-1 ', from: '2026-11-01', to: '2026-11-02' }, iso))
      .toEqual({ page: 1, limit: 10, status: 'failed', event: 'admin_low_stock', recipientType: 'admin', search: 'PH-1', from: '2026-11-01S', to: '2026-11-02E' });
  });
});
