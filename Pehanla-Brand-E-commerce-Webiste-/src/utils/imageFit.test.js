import { describe, it, expect } from 'vitest';
import { chooseFit } from './imageFit';

describe('chooseFit', () => {
  it('4:5 frame: portrait 4:5 fills, square and 3:2 landscape are shown whole', () => {
    expect(chooseFit(800, 1000, 0.8)).toBe('cover');
    expect(chooseFit(1000, 1000, 0.8)).toBe('contain');
    expect(chooseFit(1500, 1000, 0.8)).toBe('contain');
  });
  it('3:4 card frame: 4:5 and 3:4 fill, square is shown whole', () => {
    expect(chooseFit(800, 1000, 0.75)).toBe('cover');
    expect(chooseFit(900, 1200, 0.75)).toBe('cover');
    expect(chooseFit(1000, 1000, 0.75)).toBe('contain');
  });
  it('unknown size falls back to cover', () => expect(chooseFit(0, 0)).toBe('cover'));
});
