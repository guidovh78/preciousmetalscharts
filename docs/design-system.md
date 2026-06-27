# Design system — LOCKED

Aesthetic: **"assay office / precision instrument."** Neutral, exact, restrained. The data is
the hero; color is a signal, not decoration. This file is the source of truth for all UI work.

## Logo & wordmark
- **Mark:** a minimalist monoline rising chart-line that ends in a small filled metal block,
  inside a rounded-square frame. SVG primitives: rounded `rect` frame (stroke `--line-strong`),
  an accent `path`/`polyline` (stroke `--accent`), a small filled accent `rect` (the metal block).
- **Wordmark:** lowercase `preciousmetals` + `charts`, where **`charts` is in the gold accent**
  (`--accent`). Top-left in the header; repeated in the footer.
- Reference SVG (already in both pages' footers):
  ```html
  <svg class="logo-mark" viewBox="0 0 34 34" fill="none">
    <rect x="1" y="1" width="32" height="32" rx="9" fill="none" stroke="var(--line-strong)"/>
    <path d="M8 22.5 L14 16 L18.5 19.5 L26 10" stroke="var(--accent)" stroke-width="2.1"
          stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="23.4" y="7.4" width="5.2" height="5.2" rx="1.3" fill="var(--accent)"/>
  </svg>
  ```

## Typography
- **Display / headings:** Schibsted Grotesk (500/600/700).
- **Body / UI:** Inter (400/500/600).
- **All numbers & data:** IBM Plex Mono (400/500/600), tabular. Prices, %, dates, table figures —
  always mono, so columns align and figures read as instrument readouts.
- Google Fonts load:
  `family=Schibsted+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap`
- CSS vars:
  ```css
  --font-display:"Schibsted Grotesk","Inter",system-ui,sans-serif;
  --font-body:"Inter",system-ui,sans-serif;
  --font-mono:"IBM Plex Mono",ui-monospace,monospace;
  ```

## Color tokens (exact — copy verbatim)
**Light (`:root`):**
```css
--bg:#F4F4F1; --surface:#FFFFFF; --surface-2:#FAFAF8; --ink:#17191E; --muted:#6B7177; --faint:#9AA0A6;
--line:#E5E6E2; --line-strong:#D6D7D2; --accent:#9A7322; --accent-soft:#F0E6CF;
--up:#1A7F5A; --down:#C2453A; --up-bg:rgba(26,127,90,.10); --down-bg:rgba(194,69,58,.10);
--gold:#C19A2E; --silver:#8C9298; --platinum:#9FB1BB; --palladium:#B8997A;
--shadow:0 1px 2px rgba(20,22,28,.04),0 8px 24px rgba(20,22,28,.05);
--radius:14px; --radius-sm:9px; --maxw:1140px; --hh:64px; --nh:48px;
```
**Dark (`[data-theme="dark"]`):**
```css
--bg:#0D0E11; --surface:#16181D; --surface-2:#1B1E24; --ink:#ECEDEA; --muted:#8A9099; --faint:#5E646C;
--line:#24272E; --line-strong:#2E323A; --accent:#D4A24E; --accent-soft:#2A2316;
--up:#46B488; --down:#E0685C; --up-bg:rgba(70,180,136,.12); --down-bg:rgba(224,104,92,.12);
--gold:#D4A93C; --silver:#A6ADB4; --platinum:#AFC3CE; --palladium:#CDAE8E;
```

## Color rules
- **Neutral base everywhere** — greys + one warm accent.
- **Per-metal tints** (`--gold/--silver/--platinum/--palladium`) are **identity only**: a dot, a
  sparkline stroke, a card's `--mc` accent. Never fill large areas with them.
- **Green/red (`--up/--down`) mean price movement ONLY.** Never for decoration, buttons, or
  unrelated status. They are a signal.
- **Light + dark are both first-class.** Toggle sets `data-theme` on `<html>`.

## Layout, motion, accessibility
- Radius `14px` (cards) / `9px` (controls). Max-width `1140px` (home) / `1120px` (IRA). Header
  height `64px`; in-page section nav `48px`.
- **Motion restraint:** subtle transitions only. **No 3D/WebGL spectacle** — it tanks usability
  and speed; this is a data/finance tool, and speed = trust = conversions.
- **Accessibility:** visible keyboard focus; honor `prefers-reduced-motion`; sufficient contrast;
  `aria-pressed` / `aria-current` / `aria-expanded` on interactive elements.

## Header pattern (apply on every page)
Two tiers:
1. **Top header:** logo + wordmark · **site nav** (`Charts · Ratio · Premiums · Alerts · Gold
   IRA`, current page marked `aria-current="page"`) · currency toggle (USD/EUR) · theme toggle.
   Site nav **hides under ~860px**.
2. **Sticky in-page section nav** below the header, with **scroll-spy** (active section in gold
   via `IntersectionObserver`).

**Decoupling rule:** site nav → **pages** (`/`, `/ratio`, `/premiums`, `/alerts`, `/gold-ira`);
section nav → **in-page anchors** (`#live`, `#ratio`, …). Keep them separate so they don't fight.
