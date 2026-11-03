import { describe, it, expect } from 'vitest';
import { PRODUCT_IMAGE_LIMIT, PRODUCT_CREATE_IMAGE_LIMIT, imageLimitFor, imageCountError, AUDIENCE_OPTIONS } from './productLimits';

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

describe('creation flow allows one main image only', () => {
  it('create limit is 1, edit limit stays 25', () => {
    expect(PRODUCT_CREATE_IMAGE_LIMIT).toBe(1);
    expect(imageLimitFor(true)).toBe(1);
    expect(imageLimitFor(false)).toBe(25);
  });
  it('rejects 2 images when creating but still accepts them when editing', () => {
    expect(imageCountError(imgs(1), imageLimitFor(true))).toBe('');
    expect(imageCountError(imgs(2), imageLimitFor(true))).toMatch(/at most 1/);
    expect(imageCountError(imgs(2), imageLimitFor(false))).toBe('');
  });
});
