import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn(async () => ({ data: { items: [] } }));
const post = vi.fn(async () => ({ data: { status: 'sent' } }));
vi.mock('../lib/apiClient', () => ({ get: (...a) => get(...a), post: (...a) => post(...a), patch: vi.fn(), del: vi.fn(), cleanParams: (x) => x }));

import { notificationsApi } from './notificationsApi';
beforeEach(() => { get.mockClear(); post.mockClear(); });

describe('notificationsApi.whatsapp', () => {
  it('calls the owner-only endpoints', async () => {
    await notificationsApi.whatsapp.list({ status: 'failed' });
    expect(get).toHaveBeenCalledWith('/admin/notifications/whatsapp', { status: 'failed' });
    await notificationsApi.whatsapp.config();
    expect(get).toHaveBeenLastCalledWith('/admin/notifications/whatsapp/config');
    await notificationsApi.whatsapp.retry('abc');
    expect(post).toHaveBeenLastCalledWith('/admin/notifications/whatsapp/abc/retry');
    await notificationsApi.whatsapp.test({ to: '0300', simulate: 'failure', extra: 1 });
    expect(post).toHaveBeenLastCalledWith('/admin/notifications/whatsapp/test', { to: '0300', simulate: 'failure' });
  });
});
