import { describe, expect, it } from 'vitest';
import { SOCIAL_PLATFORMS, resolveSocialLinks } from './social';
import { BRAND_MARKS } from '../components/BrandIcon';

describe('footer social links', () => {
  it('covers the five requested platforms, in order, each with a brand mark', () => {
    expect(SOCIAL_PLATFORMS.map((p) => p.key)).toEqual(['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube']);
    for (const { key } of SOCIAL_PLATFORMS) expect(BRAND_MARKS[key]?.path?.length).toBeGreaterThan(100);
  });

  it('uses the merchant URLs from Store Settings', () => {
    const links = resolveSocialLinks({ instagram: 'https://instagram.com/pehanly', youtube: 'https://youtube.com/@pehanly' });
    expect(links).toEqual([
      { key: 'instagram', label: 'Instagram', url: 'https://instagram.com/pehanly' },
      { key: 'youtube', label: 'YouTube', url: 'https://youtube.com/@pehanly' },
    ]);
  });

  it('renders nothing when no profile is configured - never a placeholder link', () => {
    expect(resolveSocialLinks({})).toEqual([]);
    expect(resolveSocialLinks(undefined)).toEqual([]);
  });

  it('drops values that are not real http(s) URLs', () => {
    expect(resolveSocialLinks({ facebook: 'pehanly', linkedin: '   ', tiktok: 'javascript:alert(1)' })).toEqual([]);
  });

  it('trims and keeps display order regardless of settings order', () => {
    const links = resolveSocialLinks({ youtube: 'https://youtube.com/@p ', facebook: 'https://facebook.com/p' });
    expect(links.map((l) => l.key)).toEqual(['facebook', 'youtube']);
    expect(links[1].url).toBe('https://youtube.com/@p');
  });
});
