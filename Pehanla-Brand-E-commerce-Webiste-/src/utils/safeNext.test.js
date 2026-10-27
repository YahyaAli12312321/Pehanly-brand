import { describe, it, expect } from 'vitest';
import { safeNext } from './safeNext';

describe('safeNext (post-login return path)', () => {
  it('accepts in-app paths with a query', () => {
    expect(safeNext('/checkout')).toBe('/checkout');
    expect(safeNext('/product/blue-tee?color=Navy')).toBe('/product/blue-tee?color=Navy');
  });
  it.each(['https://evil.example/x', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'checkout', '', null, undefined, '/account', '/account?tab=orders', '/a\nb'])('rejects %s', (v) => {
    expect(safeNext(v)).toBe('');
  });
});
