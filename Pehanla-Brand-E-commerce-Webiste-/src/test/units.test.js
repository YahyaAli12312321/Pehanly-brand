import { describe, expect, it, vi } from 'vitest';
import { buildPath, matchRoute } from '../routes';
import { discountPercent, formatPKR, isValidEmail, isValidPhone } from '../utils/format';
import { findSku, flattenSkus, isLadiesShoes, toCartLine } from '../utils/product';
import { detectCurrency, formatMoney, linePrice, orderCurrency, priceRange, skuCompareAt, skuPrice, soldIn, sumMoney } from '../utils/currency';
import { http } from '../services/http';
import { authApi } from '../services/accountApi';
import { ApiError, toApiError } from '../services/http';
import { breadcrumbSchema, productSchema } from '../seo/schema';

const product = {
  id: 'p1', slug: 'tee', name: 'Tee', category: { name: 'Tees', slug: 'tees' }, image: { url: 'https://x/img.jpg' },
  priceMin: 1000, priceMax: 1200, inStock: true,
  variants: [{ id: 'v1', color: { name: 'Black', hexCode: '#000' }, images: [{ url: 'https://x/v.jpg' }],
    sizes: [{ id: 's1', sku: 'TEE-BLK-M', size: 'M', price: 1000, compareAtPrice: 1500, inStock: true, maxQuantity: 5 }, { id: 's2', sku: 'TEE-BLK-L', size: 'L', price: 1200, inStock: false, maxQuantity: 0 }] }],
};

describe('routes', () => {
  it('builds clean URLs from legacy route keys', () => {
    expect(buildPath('home')).toBe('/');
    expect(buildPath('product-detail', { slug: 'a b' })).toBe('/product/a%20b');
    expect(buildPath('shop', { category: 'hoodies', page: 2 })).toBe('/shop/hoodies?page=2');
    expect(buildPath('account', { tab: 'orders' })).toBe('/account?tab=orders');
  });
  it('matches paths back to route keys', () => {
    expect(matchRoute('/product/tee/')).toEqual({ route: 'product-detail', params: { slug: 'tee' } });
    expect(matchRoute('/custom-manufacturing/polos').route).toBe('manufacturing-detail');
    expect(matchRoute('/nope').route).toBe('not-found');
  });
});

describe('format', () => {
  it('formats PKR and discounts', () => {
    expect(formatPKR(3499)).toMatch(/3,499/);
    expect(discountPercent(750, 1000)).toBe(25);
    expect(discountPercent(1000, 1000)).toBe(0);
    expect(discountPercent(undefined, 1000)).toBe(0);
  });
  it('validates contact fields', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidPhone('0300 1234567')).toBe(true);
    expect(isValidPhone('12')).toBe(false);
  });
});

describe('product helpers', () => {
  it('flattens and finds SKUs and builds cart lines from real SKU data', () => {
    expect(flattenSkus(product)).toHaveLength(2);
    expect(findSku(product, 'v1', 'M').id).toBe('s1');
    expect(findSku(product, 'v1', 'XL')).toBeNull();
    const sku = flattenSkus(product)[0];
    const line = toCartLine(product, sku, 2);
    expect(line).toMatchObject({ id: 's1', skuId: 's1', productId: 'p1', price: 1000, originalPrice: 1500, size: 'M', maxQuantity: 5 });
  });
  it("never allows Ladies' Shoes in wholesale/manufacturing", () => {
    expect(isLadiesShoes({ slug: 'ladies-shoes', name: "Ladies' Shoes" })).toBe(true);
    expect(isLadiesShoes({ name: 'Women Shoes' })).toBe(true);
    expect(isLadiesShoes({ slug: 'mens-shoes', name: "Men's Shoes" })).toBe(false);
    expect(isLadiesShoes({ slug: 'hoodies', name: 'Hoodies' })).toBe(false);
    expect(isLadiesShoes(null)).toBe(false);
  });
});

describe('api error mapping', () => {
  it('maps network failures', () => {
    const e = toApiError(new Error('boom'));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.isNetwork).toBe(true);
  });
  it('maps server responses and never leaks raw bodies', () => {
    const e = toApiError({ response: { status: 500, data: {} } });
    expect(e.status).toBe(500);
    expect(e.message).toMatch(/our side/);
    const v = toApiError({ response: { status: 400, data: { message: 'Validation failed', code: 'VALIDATION_ERROR', errors: [{ path: 'customer.email', message: 'Invalid email' }] } } });
    expect(v.code).toBe('VALIDATION_ERROR');
    expect(Object.values(v.fieldErrors)).toContain('Invalid email');
  });
});

describe('structured data', () => {
  it('only emits AggregateRating when real reviews exist', () => {
    expect(productSchema(product, { reviewCount: 0, averageRating: 0 }).aggregateRating).toBeUndefined();
    expect(productSchema(product, null).aggregateRating).toBeUndefined();
    const withReviews = productSchema(product, { reviewCount: 3, averageRating: 4.5 });
    expect(withReviews.aggregateRating).toMatchObject({ ratingValue: 4.5, reviewCount: 3 });
  });
  it('derives offers from real prices and stock', () => {
    const s = productSchema(product, null);
    expect(s.offers).toMatchObject({ lowPrice: 1000, highPrice: 1200, availability: 'https://schema.org/InStock' });
    expect(productSchema({ ...product, priceMin: null }, null).offers).toBeUndefined();
  });
  it('emits a USD offer only when a real USD price exists, independent of selected currency', () => {
    expect(productSchema(product, null).offers.priceCurrency).toBe('PKR');
    const both = productSchema({ ...product, priceMinUSD: 9.99, priceMaxUSD: 12.5, currencies: ['PKR', 'USD'] }, null);
    expect(both.offers.map((o) => [o.priceCurrency, o.lowPrice])).toEqual([['PKR', 1000], ['USD', 9.99]]);
  });
  it('builds breadcrumbs', () => {
    const b = breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }]);
    expect(b.itemListElement).toHaveLength(2);
    expect(b.itemListElement[1].position).toBe(2);
  });
});

describe('currency utils', () => {
  it('formats PKR and USD', () => {
    expect(formatMoney(4500, 'PKR')).toBe('Rs. 4,500');
    expect(formatMoney(19.99, 'USD')).toBe('$19.99');
  });
  it('reads prices per currency and never converts', () => {
    expect(skuPrice({ price: 1000, priceUSD: 9 }, 'USD')).toBe(9);
    expect(skuPrice({ price: 1000 }, 'USD')).toBeNull();
    expect(skuCompareAt({ price: 1, priceUSD: 9, compareAtPriceUSD: 12 }, 'USD')).toBe(12);
    expect(priceRange({ priceMin: 1, priceMax: 2 }, 'USD')).toEqual({ min: null, max: null });
    expect(soldIn({ currencies: ['PKR', 'USD'] }, 'USD')).toBe(true);
    expect(soldIn({}, 'USD')).toBe(false);
    expect(orderCurrency({})).toBe('PKR');
    expect(orderCurrency({ currency: 'USD' })).toBe('USD');
  });
  it('sums money exactly', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(linePrice({ price: 100, priceUSD: 2.5 }, 'USD')).toBe(2.5);
  });
  it('detects currency for the initial preference only', () => {
    const nav = (o) => ({ userAgent: 'Mozilla', languages: ['en-US'], language: 'en-US', ...o });
    expect(detectCurrency({ navigator: nav(), timeZone: 'America/New_York' })).toBe('USD');
    expect(detectCurrency({ navigator: nav(), timeZone: 'Asia/Karachi' })).toBe('PKR');
    expect(detectCurrency({ navigator: nav({ languages: ['ur-PK'] }), timeZone: 'Europe/London' })).toBe('PKR');
    expect(detectCurrency({ navigator: nav({ webdriver: true }), timeZone: 'America/New_York' })).toBe('PKR');
    expect(detectCurrency({ navigator: nav({ userAgent: 'Googlebot/2.1' }), timeZone: 'America/New_York' })).toBe('PKR');
  });
});

describe('origin rejection message', () => {
  it('turns a CORS_ORIGIN_NOT_ALLOWED 403 into a clear customer message', () => {
    const e = toApiError({ response: { status: 403, data: { success: false, message: 'Origin not allowed', code: 'CORS_ORIGIN_NOT_ALLOWED' } } });
    expect(e.status).toBe(403);
    expect(e.code).toBe('CORS_ORIGIN_NOT_ALLOWED');
    expect(e.message).toMatch(/not allowed to reach the server/);
  });
});

describe('website registration payload', () => {
  it('always sends role "customer" and cannot be overridden by the caller', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue({ data: { data: { user: { role: 'customer' } } } });
    await authApi.register({ name: 'A B', email: 'a@x.pk', phone: '03001234567', password: 'long-enough-1' });
    await authApi.register({ name: 'A B', email: 'a@x.pk', phone: '03001234567', password: 'long-enough-1', role: 'admin' });
    expect(post.mock.calls[0][1].role).toBe('customer');
    expect(post.mock.calls[1][1].role).toBe('customer');
    post.mockRestore();
  });
});
