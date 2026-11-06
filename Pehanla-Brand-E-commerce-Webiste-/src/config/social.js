/**
 * Social profiles shown in the footer.
 *
 * Order and labels live here; the URLs come from Store Settings (Admin -> Settings -> Social), so the merchant can change
 * them without a deploy. `fallbackUrl` is for a profile that is NOT managed in Settings yet: paste the real URL here and it
 * shows up immediately. Leave it empty and the icon simply isn't rendered - the footer never links to a profile that
 * doesn't exist.
 *
 *   SOCIAL_FALLBACK_URLS.linkedin = 'https://www.linkedin.com/company/pehanly';
 */
export const SOCIAL_FALLBACK_URLS = {
  instagram: '',
  facebook: '',
  linkedin: '',
  tiktok: '',
  youtube: '',
};

/** Platforms in display order. `key` matches both BRAND_MARKS and the settings.social field. */
export const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
];

const isHttpUrl = (value) => /^https?:\/\/\S+$/i.test(String(value || '').trim());

/**
 * Merge the merchant's Store Settings with the fallbacks above.
 * Settings win; anything that is not a real http(s) URL is dropped, so a half-filled field never renders a broken link.
 * Returns [{ key, label, url }] in display order.
 */
export function resolveSocialLinks(social = {}) {
  return SOCIAL_PLATFORMS.map(({ key, label }) => {
    const url = String(social?.[key] || SOCIAL_FALLBACK_URLS[key] || '').trim();
    return isHttpUrl(url) ? { key, label, url } : null;
  }).filter(Boolean);
}
