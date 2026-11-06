# Footer – social media section & brand icons

## Kya badla
Footer ke column 1 mein pehle contact aur social icons ek hi qataar mein the, aur social icons Material Symbols ke **generic** glyphs the (Instagram = `photo_camera`, Facebook = `thumb_up`). Ab:

1. **Alag "Follow PEHANLY" section** copyright bar ke upar: heading + ek line subtext (left), brand icons (right). Mobile par stacked aur centered.
2. **Asli brand marks** — Instagram, Facebook, LinkedIn, TikTok, YouTube (aur contact row mein WhatsApp). Inline SVG, sab 24×24 grid par, 18×18 render, 40×40 circular buttons, 14px gap.
3. **Contact details** ab icon + text list hai (WhatsApp / email / phone) — zyada premium aur social buttons se alag padhai jati hai. Teeno links pehle ki tarah kaam karte hain.

## Icons kahan se aaye
[Simple Icons](https://github.com/simple-icons/simple-icons) (CC0 1.0) ke official path data ko **inline** kiya gaya hai — koi nayi runtime dependency nahi, koi extra network request nahi. `fill="currentColor"`, to hover states pure CSS hain.

## URLs kahan se aati hain
- **Pehli priority:** Store Settings → Social (Admin ▸ Settings). Merchant khud badal sakta hai, deploy ki zaroorat nahi.
- **Fallback:** `web/src/config/social.js` → `SOCIAL_FALLBACK_URLS`. Jo profile Settings mein nahi hai, uska asli URL yahan paste kar dein.
- **Koi fake link nahi:** jo URL khali ho ya valid `http(s)` na ho, uska icon render hi nahi hota. Saare paanch khali hon to poora section chhup jata hai.
- Platform add/remove karna ho to `SOCIAL_PLATFORMS` array aur `BRAND_MARKS` mein entry — footer code chhune ki zaroorat nahi.

## LinkedIn (backend change)
Settings mein sirf facebook/instagram/tiktok/youtube the. **linkedin** add kiya gaya:
- `proj/src/models/StoreSettings.js` – `social.linkedin`
- `proj/src/validators/settings.validators.js` – `linkedin: optionalUrl`
- `fe/src/pages/SettingsPage.jsx` – LinkedIn field + URL validation

Optional field hai, default khali — koi migration nahi chahiye, purana data waisa hi chalega.

## Hover / accessibility
- Hover: accent `#A8BD24` background, primary text, soft accent glow, 0.3s ease-out transition, aur halka 2px lift.
- Lift sirf `motion-safe` par — reduced-motion users ko colour change milta hai, movement nahi.
- Har link par `aria-label` ("PEHANLY on Instagram"), `title`, `rel="noopener noreferrer me"`, keyboard focus ring (accent, offset).
- SVG `aria-hidden` hain, to screen reader sirf label parhta hai.

## Files
- Naye: `web/src/components/BrandIcon.jsx`, `web/src/config/social.js`, `web/src/config/social.test.js`, `web/e2e/footer-social.mocked-api.cjs`
- Badle: `web/src/components/Footer.jsx`, `proj/src/models/StoreSettings.js`, `proj/src/validators/settings.validators.js`, `fe/src/pages/SettingsPage.jsx`

## Tests (jo actually chale)
- **Website unit (vitest):** 67/67, 5 naye — paanch platforms order mein, Settings URLs, khali = kuch nahi, invalid URL drop, trim + order.
- **Browser (real Chromium, mocked API — real backend/DB nahi):** 20/20 — section + heading, paanch links sahi order/URL/target/rel, har icon real SVG (path data 348–1988 chars, koi font glyph nahi), sab buttons 40×40, sab icons 18×18, ek row mein aligned, 14px even gap, hover accent + lift, 0.3s transition, reduced-motion mein movement nahi, keyboard focus, contact links barqarar, purani footer navigation barqarar, desktop/tablet/mobile mein overflow nahi, partially configured aur empty cases.
- **Regression:** website eslint clean, build OK, e2e smoke 118 / flows 142 / home-sections 11 / audience 14 / auth-session 13 / under-garments 48 — sab pass. Backend 318/318. Admin `tsc` clean, 99/99 unit, build OK.

## Limitations
- Asli MongoDB / live backend par test nahi hua; browser tests mocked API par chale.
- Abhi project mein kisi platform ka asli URL mojood nahi tha, is liye koi URL hardcode nahi kiya — Settings ya `social.js` mein daalte hi icons aa jayenge.
- Hover colour har platform par ek hi accent hai (brand-consistent). Agar har icon par uska official brand colour chahiye to `BRAND_MARKS[key].hex` already mojood hai, ek line se ho jayega.
