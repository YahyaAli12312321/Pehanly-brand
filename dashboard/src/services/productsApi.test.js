import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn(async (_url, body) => ({ data: { _id: 'p1', ...body } }));
const patch = vi.fn(async (_url, body) => ({ data: { _id: 'p1', ...body } }));
vi.mock('../lib/apiClient', () => ({ get: vi.fn(), post: (...a) => post(...a), patch: (...a) => patch(...a), cleanParams: (x) => x }));

import { productsApi } from './productsApi';

const imgs = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://res.cloudinary.com/x/${i}.jpg`, publicId: `p${i}`, alt: `alt ${i}` }));
const form = (over = {}) => ({ name: 'Tee', slug: '', shortDescription: '', description: '', category: 'c1', audience: '', generalImages: [], isFeatured: false, isNewArrival: false, isBestSeller: false, wholesaleEnabled: false, wholesaleMoq: 12, wholesaleTiers: [], seoTitle: '', seoDescription: '', ...over });

beforeEach(() => { post.mockClear(); patch.mockClear(); });

describe('productsApi audience', () => {
  it.each(['men', 'women', 'unisex'])('create sends audience=%s', async (a) => {
    await productsApi.create(form({ audience: a }));
    expect(post.mock.calls[0][1].audience).toBe(a);
  });
  it('edit sends the new audience, and null when reset to "same as category"', async () => {
    await productsApi.update('p1', form({ audience: 'unisex' }));
    expect(patch.mock.calls[0][1].audience).toBe('unisex');
    await productsApi.update('p1', form({ audience: '' }));
    expect(patch.mock.calls[1][1].audience).toBeNull();
  });
});

describe('productsApi images', () => {
  it('create and edit both send 25 images in order with alt text and sortOrder', async () => {
    await productsApi.create(form({ generalImages: imgs(25) }));
    await productsApi.update('p1', form({ generalImages: imgs(25) }));
    for (const body of [post.mock.calls[0][1], patch.mock.calls[0][1]]) {
      expect(body.generalImages).toHaveLength(25);
      expect(body.generalImages.map((i) => i.publicId)).toEqual(imgs(25).map((i) => i.publicId));
      expect(body.generalImages[7]).toMatchObject({ alt: 'alt 7', sortOrder: 7 });
    }
  });
});
