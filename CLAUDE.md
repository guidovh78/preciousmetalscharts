# preciousmetalscharts — project memory (CLAUDE.md)

Independent live + historical price charts for precious metals (gold, silver, platinum,
palladium), monetized by referring a slice of engaged visitors to gold-IRA providers + bullion
affiliate. Calm, precise, "assay office / precision instrument." Domain: preciousmetalscharts.com.

## Prime directive
The design system and architecture here are deliberate and research-backed. **Do not silently
undo decisions.** If a change conflicts with a rule below, surface it and ask.

## Hard rules (non-negotiable)
1. **No financial, tax, or legal advice.** This site educates and refers; it does not advise.
2. **Never publish invented numbers about real companies.** Every gold-IRA score/fee/minimum
   must be independently verified before shipping. Current figures are illustrative placeholders.
3. **Affiliate links** use `rel="sponsored nofollow"`; visible FTC-style disclosure near any
   ranking + in the footer; scoring weights are fixed before commissions and disclosed.
4. **Label price data "delayed"** ("~10 min delayed"); never imply real-time.
5. **Keep required source attributions** (e.g. goldpricez visible credit) — don't strip them.

## Reference docs — read the relevant one before working in that area
- `docs/design-system.md` — LOCKED visual system: logo, fonts, full tokens, color rules,
  two-tier header, motion/a11y. Read before any UI/CSS/component work.
- `docs/data-pipeline.md` — spot (10-min, multi-source failover, cache) + history (backfill,
  daily update, downsampled timeframe files). Read before touching data/charts/pipeline.
- `docs/geo-seo.md` — SSR requirement, schema, robots/llms/sitemap, answer blocks, measurement.
  Read before content, `<head>`, or markup-structure work.
- `docs/product.md` — site IA, page specs, retention/"Hook" model. Read before adding pages/features.
- `docs/monetization-compliance.md` — funnel economics, market positioning, full compliance.
- `docs/roadmap.md` — existing assets inventory, prioritized build phases, open questions.

## Tech must-haves
- **Server-side render the citeable content** (prices, tables, FAQ answers, comparison data) so
  it exists in the HTML without JS. JS only *enhances*. This is the #1 GEO/SEO lever.
- **Data goes through the cache/abstraction layer** (`prices-client.js` / `history-client.js`).
  Never call a provider API from the browser, never per visitor. Cost must be traffic-independent.
- Recommended stack: a static generator or SSR/SSG/ISR framework (Astro / Eleventy / Next.js).
  Current build is hand-written static HTML following "content in HTML, JS hydrates."

## Design tokens (summary — full rules in docs/design-system.md)
Fonts: **Schibsted Grotesk** (display), **Inter** (body), **IBM Plex Mono** (all numbers, tabular).
```css
/* light :root */
--bg:#F4F4F1; --surface:#FFFFFF; --surface-2:#FAFAF8; --ink:#17191E; --muted:#6B7177; --faint:#9AA0A6;
--line:#E5E6E2; --line-strong:#D6D7D2; --accent:#9A7322; --accent-soft:#F0E6CF;
--up:#1A7F5A; --down:#C2453A; --gold:#C19A2E; --silver:#8C9298; --platinum:#9FB1BB; --palladium:#B8997A;
--radius:14px; --radius-sm:9px; --maxw:1140px;
/* dark [data-theme="dark"] */
--bg:#0D0E11; --surface:#16181D; --surface-2:#1B1E24; --ink:#ECEDEA; --muted:#8A9099; --faint:#5E646C;
--line:#24272E; --line-strong:#2E323A; --accent:#D4A24E; --accent-soft:#2A2316;
--up:#46B488; --down:#E0685C; --gold:#D4A93C; --silver:#A6ADB4; --platinum:#AFC3CE; --palladium:#CDAE8E;
```
Color rules: neutral base + one warm accent; per-metal tints are **identity only** (dot/line);
**green/red = price movement ONLY**; light + dark both first-class. No 3D/WebGL spectacle.

## Header (apply on every page)
Two tiers: (1) logo+wordmark · site nav `Charts · Ratio · Premiums · Alerts · Gold IRA` (current
marked; hides <860px) · currency + theme toggles; (2) sticky in-page section nav with scroll-spy
(active = gold). Site nav → pages; section nav → in-page anchors. Keep them decoupled.

## Client markup contract
```html
<div data-price="gold"></div>   <!-- price -->
<span data-change="gold"></span><!-- % ; JS adds .up/.down -->
<span data-ratio></span>  <span data-freshness></span>  <div data-attributions></div>
<script src="/data-pipeline/prices-client.js" defer></script>
<script src="/data-pipeline/history-client.js"></script>
```
Chart timeframe buttons call `PMCHistory.load('<metal>','<range>')` → `[[date, close], …]`.

## Agent conventions
- Preserve the locked design system + two-tier header on every page/component. Only use tokens
  above; introduce no new colors. Numbers in IBM Plex Mono. Green/red only for price movement.
- Keep citeable content server-rendered; never JS-only for text/numbers.
- Adapters are the only place provider specifics live; add a normalized adapter to add a source.
- No `localStorage`/`sessionStorage` inside Claude.ai artifacts (they fail there); fine on the
  real deployed site for portfolio/preferences.
- Prefer fast, minimal, trustworthy over clever. When unsure about a tradeoff, ask.

## Common commands
```bash
# Spot pipeline (Cloudflare path)
npx wrangler kv namespace create PRICES        # paste id into data-pipeline/wrangler.toml
npx wrangler secret put METALPRICEAPI_KEY      # only sources that need keys
npx wrangler deploy
# History
node data-pipeline/node/backfill-history.mjs   # run ONCE (CSV_GOLD=… and/or START_YEAR + key)
node data-pipeline/node/update-history.mjs      # daily (GitHub Action provided)
```

## Repo map
```
index.html  gold-ira.html              # pages (SSR content + JSON-LD + FAQ)
robots.txt  llms.txt  sitemap.xml       # GEO/SEO — deploy at domain ROOT
data-pipeline/                          # spot + history pipelines (see docs/data-pipeline.md)
docs/                                   # the reference docs listed above
```

**Status:** all prices and all gold-IRA figures are illustrative placeholders pending real data
wiring + verification. See `docs/roadmap.md` Phase 0/1.
