# Roadmap, assets & open questions

## Existing assets (already built)
- **Pages:** `index.html` (homepage, SSR content + 2 JSON-LD blocks + FAQ), `gold-ira.html`
  (fully static comparison + 2 JSON-LD blocks + FAQ). Both use the locked design system + two-tier
  header.
- **Technical SEO/GEO:** `robots.txt`, `llms.txt`, `sitemap.xml` (deploy at domain root).
- **Spot pipeline:** `data-pipeline/{sources,fetchPrices,worker,prices-client}.{mjs,js}` +
  `wrangler.toml` + Node/GitHub-Action variant. Tested: failover, validation, median consensus,
  day-change, stale fallback.
- **History pipeline:** `data-pipeline/{history-sources,buildHistory,history-client}.{mjs,js}` +
  `node/{backfill,update}-history.mjs` + GitHub Action. Tested: year-paged backfill, dedupe merge,
  downsampling, incremental update, CSV import + date normalization.
- **Status of numbers:** all prices and all gold-IRA figures are **illustrative placeholders**
  pending real data wiring + verification.

## Build roadmap (prioritized)

### Phase 0 — wire what exists
- [ ] Connect `index.html` spot cards to `prices-client.js`; replace the demo "updated …s ago"
      ticker with the real `[data-freshness]` "~10 min delayed" timestamp.
- [ ] Wire homepage chart timeframe buttons (1W…MAX) to `PMCHistory.load()`.
- [ ] Verify each adapter's endpoint + field path against provider docs (`// VERIFY`); pick the
      primary free source + 1–2 fallbacks; set keys as secrets.
- [ ] Deploy spot pipeline (Worker or GH Action); run the one-time history backfill (CSV seed for
      deep history + API for recent years); enable the daily update Action.

### Phase 1 — money page for real
- [ ] Replace gold-IRA placeholders with **verified** scores/fees/minimums; confirm affiliate
      terms; finalize disclosure + scoring-method copy.

### Phase 2 — complete the IA
- [ ] Build `/ratio`, `/premiums`, `/alerts` (reuse header, tokens, schema, section-nav).
- [ ] Implement alerts (email capture + target-price trigger) and the newsletter.

### Phase 3 — retention & personalization
- [ ] Portfolio/stack tracker persistence; "since your last visit" pulse; remember
      metal/currency/timeframe; per-chart data-storytelling line.

### Phase 4 — GEO/SEO loop
- [ ] Submit sitemap; validate all schema; Core Web Vitals green; answer blocks on every page;
      stand up the weekly mention/citation-rate measurement; begin honest off-site presence.

## Open questions / to verify before launch
- Exact endpoints/response fields for each chosen data source (spot + history) — confirm vs current
  docs; some return ounces-per-USD (invert) and some cap timeseries range (page it).
- Which free source(s) give acceptable **daily** history depth; otherwise source a one-time CSV for
  20–50y (LBMA fixes or equivalent).
- Real, verified gold-IRA provider data + your actual affiliate terms.
- EUR (and other currency) conversion source if you offer non-USD pricing.
- Final hosting choice (affects deploy of root files + cron mechanism).
