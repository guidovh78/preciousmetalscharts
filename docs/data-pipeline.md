# Data pipeline — spot + history

**Core principle:** decouple the API from the visitor. A scheduled task refreshes a cache;
every visitor reads the cache. Cost is then **independent of traffic** (1 visitor or 1,000,000 →
same API usage). Never call a provider API from the browser, never per visitor.

## Repo structure (data-pipeline/)
```
sources.mjs            # SPOT adapters (5 free sources) + RANGES sanity bounds
fetchPrices.mjs        # spot failover + validation + median + day-change + stale fallback
worker.mjs             # Cloudflare Worker: cron refresh + edge-cached /prices.json
wrangler.toml          # cron */10, KV binding, secrets
prices-client.js       # drop-in: hydrates [data-price]/[data-change]/[data-ratio]/[data-freshness]
prices.sample.json     # spot snapshot shape
history-sources.mjs    # HISTORY time-series adapters + CSV import + date normalize
buildHistory.mjs       # backfill paging, incremental merge, downsample timeframes
history-client.js      # PMCHistory.load(metal,range) → points for the chart
history/gold-10y.sample.json
node/refresh-prices.mjs + refresh-prices.workflow.yml     # spot, Node + GitHub Action
node/backfill-history.mjs                                  # run ONCE
node/update-history.mjs + update-history.workflow.yml      # history daily, GitHub Action
```

## Spot prices (live, 10-min)
- **Cadence:** every 10 min ≈ 144 calls/day ≈ 4,300/month (one call returns all metals where the
  source supports it). If a free tier is ~1,000/month, refresh **hourly** (~720/month). Match
  cadence to the limit, not the other way around.
- **Multi-source failover (independence):** `sources.mjs` lists adapters in priority order —
  `gold-api.com` (keyless), `metals.dev`, `metalpriceapi`, `goldpricez` (needs visible
  attribution), `apiverve`. Each **normalizes to USD/oz**. `fetchPrices.mjs` tries them in order,
  **first valid wins**; fallbacks fire only if the primary is down. `requiresKey` sources are
  skipped automatically when their env var is missing.
- **Validation:** every value range-checked (`RANGES`) so a broken feed can't go live.
- **Optional consensus:** `CROSS_CHECK=true` fetches a 2nd source and takes the per-metal
  **median** with outlier rejection (`MAX_DEVIATION_PCT`, default 3%).
- **Stale fallback:** if all sources fail, keep serving the last good snapshot, flagged
  `stale:true`. The site never shows an error or empty price.
- **Day-change %:** vs a `dayOpen` baseline captured at the first run of each UTC day.
- **Serving:** Worker serves `/prices.json` with
  `Cache-Control: public, s-maxage=600, stale-while-revalidate=120` + edge cache, so origin/KV is
  hit at most a few times per window. Node+GitHub-Action path writes a static `prices.json`.
- **Client:** `prices-client.js` polls **your own cache** every 60s and updates
  `[data-price]`, `[data-change]` (adds `.up`/`.down`), `[data-ratio]`, `[data-freshness]`
  ("as of HH:MM · ~10 min delayed"), `[data-attributions]`.

Deploy:
```bash
npx wrangler kv namespace create PRICES     # paste id into wrangler.toml
npx wrangler secret put METALS_DEV_KEY      # only sources that need keys; gold-api.com needs none
npx wrangler deploy
# or Node path: set keys as env/secrets, schedule node/refresh-prices.mjs (GH Action provided)
```

## Historical data (1W/1M/1Y/5Y/10Y/20Y/50Y)
- **History is immutable** → backfill **once**, then append only new days.
- **Backfill** (`node/backfill-history.mjs`, run once): builds a daily **master** per metal at
  `public/history/<metal>.json`. Two combinable sources:
  - **CSV seed** (best for 20–50y of free data): import a downloaded `date,close` series (e.g.
    LBMA daily fixes) via `CSV_GOLD=…` etc.
  - **API backfill** (recent years): page year-by-year with `START_YEAR` + a free key.
- **Daily update** (`node/update-history.mjs`, GH Action 06:20 UTC): fetch only the missing
  day(s) (one tiny call/metal), merge, regenerate range files. ~365 calls/year total.
- **Derived timeframe files** (`deriveTimeframes`): per range, sliced and **downsampled** —
  1w/1m/1y daily, 5y/10y **weekly**, 20y/50y **monthly** — so files stay small and charts stay
  readable. Written to `public/history/<metal>-<range>.json`.
- **Client:** `PMCHistory.load('gold','10y') → [[date, close], …]` (in-memory cached);
  `PMCHistory.warm('gold')` prefetches 1y+5y. Static files → **zero** API cost per visitor.
- **24H/intraday** comes from the spot sampler, not history; history covers 1W+.

Commands:
```bash
CSV_GOLD=./seed/gold.csv node data-pipeline/node/backfill-history.mjs   # deep history via CSV
METALPRICEAPI_KEY=xxxx START_YEAR=2006 node data-pipeline/node/backfill-history.mjs  # API
node data-pipeline/node/update-history.mjs   # daily append + regenerate range files
```

## Client markup contract
```html
<div data-price="gold"></div>
<span data-change="gold"></span>   <!-- gets .up / .down -->
<span data-ratio></span>  <span data-freshness></span>  <div data-attributions></div>
<script src="/data-pipeline/prices-client.js" defer></script>
<script src="/data-pipeline/history-client.js"></script>
```

## Conventions & caveats
- **Adapters are the only place provider specifics live.** To add/swap a source, add an adapter
  returning the normalized shape; touch nothing else.
- **Verify each adapter's endpoint + field path** against the provider's current docs (`// VERIFY`
  markers). Some return ounces-per-USD (invert with `1/rate`); some cap timeseries range (page it).
- **Keep 2–3 sources configured** so a withdrawn free plan is a shrug, not an outage.
- **Honor attributions** the pipeline carries (e.g. goldpricez) — render in `[data-attributions]`.
- Tested logic: spot failover/validation/median/day-change/stale; history backfill paging, dedupe
  merge, downsampling, incremental update, CSV import + date normalization.
