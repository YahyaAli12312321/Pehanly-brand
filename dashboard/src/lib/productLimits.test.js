import { describe, it, expect } from 'vitest';
import { PRODUCT_IMAGE_LIMIT, imageCountError, AUDIENCE_OPTIONS } from './productLimits';

const imgs = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://res.cloudinary.com/x/${i}.jpg`, publicId: `p${i}` }));

describe('product image limit', () => {
  it('is 25', () => expect(PRODUCT_IMAGE_LIMIT).toBe(25));
  it('accepts 25 and rejects 26', () => {
    expect(imageCountError(imgs(25))).toBe('');
    expect(imageCountError(imgs(26))).toMatch(/at most 25/);
  });
});

describe('audience options', () => {
  it('offers default, men, women, unisex', () => {
    expect(AUDIENCE_OPTIONS.map((o) => o.value)).toEqual(['', 'men', 'women', 'unisex']);
  });
});
