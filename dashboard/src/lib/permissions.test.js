import { describe, it, expect } from 'vitest';
import { can, isOwner, MODULES } from './permissions';
import { ORDER_STATUS_TRANSITIONS, ORDER_STATUSES } from './orderLifecycle';
import { attentionItems, totalAttention } from './attention';

const staff = (permissions) => ({ role: 'staff', permissions });

describe('can()', () => {
  it('denies anonymous and customers', () => {
    expect(can(null, 'orders.read')).toBe(false);
    expect(can({ role: 'customer' }, 'orders.read')).toBe(false);
  });
  it('grants the owner everything', () => {
    expect(can({ role: 'admin' }, 'settings.manage')).toBe(true);
    expect(isOwner({ role: 'admin' })).toBe(true);
    expect(isOwner(staff([]))).toBe(false);
  });
  it('manage implies read, read does not imply manage', () => {
    expect(can(staff(['orders.manage']), 'orders.read')).toBe(true);
    expect(can(staff(['orders.read']), 'orders.manage')).toBe(false);
    expect(can(staff(['orders.manage']), 'payments.read')).toBe(false);
  });
  it('knows the 16 backend modules', () => {
    expect(MODULES).toHaveLength(16);
  });
});

describe('order lifecycle', () => {
  it('only references known statuses', () => {
    for (const [from, tos] of Object.entries(ORDER_STATUS_TRANSITIONS)) {
      expect(ORDER_STATUSES).toContain(from);
      tos.forEach((t) => expect(ORDER_STATUSES).toContain(t));
    }
  });
  it('terminal states have no exits and shipped cannot be cancelled', () => {
    expect(ORDER_STATUS_TRANSITIONS.delivered).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.cancelled).toEqual([]);
    expect(ORDER_STATUS_TRANSITIONS.shipped).toEqual(['delivered']);
  });
});

describe('attention', () => {
  it('totals actionable counts and ignores the muted row', () => {
    expect(totalAttention({ pendingReviews: 2, lowStockSkus: 3, quotesAwaitingCustomer: 50 })).toBe(5);
    expect(totalAttention()).toBe(0);
  });
  it('points the printing row at the canonical route', () => {
    expect(attentionItems({}).find((i) => i.key === 'pendingPrintingRequests').to).toBe('/printing');
  });
});
