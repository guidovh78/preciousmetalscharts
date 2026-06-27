# Price data pipeline (free, 10-min refresh, multi-source failover)

This pulls live precious-metal prices from **free** APIs, refreshes every **10 minutes**,
and falls over automatically across **multiple sources** so you never depend on one. The
key idea: refresh on a schedule into a cache, and serve every visitor from that cache — so
your provider usage is a fixed number per day, **independent of traffic**.

```
[ cron, every 10 min ] -> try gold-api -> metals.dev -> metalpriceapi -> goldpricez -> apiverve
                          first valid wins -> validate ranges -> write snapshot (cache)
[ every visitor ]      -> reads the cached snapshot (prices.json) -> never calls a provider
[ all sources down ]   -> keep serving the last good snapshot, flagged "stale"
```

## Files

| File | Role |
|------|------|
| `sources.mjs` | The provider adapters, in priority order. Each normalizes to USD/oz. Add/remove/reorder here. |
| `fetchPrices.mjs` | Failover + validation + outlier rejection + day-change. Provider-agnostic. |
| `worker.mjs` + `wrangler.toml` | **Path A — Cloudflare Worker** (cron + KV + edge-cached endpoint). |
| `node/refresh-prices.mjs` + `node/refresh-prices.workflow.yml` | **Path B — Node + GitHub Action** (writes static `prices.json`). |
| `prices-client.js` | Drop-in for the site: reads the snapshot, updates cards, ratio, freshness, credits. |
| `prices.sample.json` | The exact shape the site consumes. |

## Why this stays free

1 call every 10 min = **144 calls/day ≈ 4,300/month** (one call returns all four metals if
the source supports it). That fits comfortably in free tiers such as goldpricez (~44k/mo) or
the keyless gold-api.com. If your chosen free source only allows ~1,000/month, just refresh
**hourly** instead (≈720/month) — for a price-info site, an hour old is fine, and you still
pay nothing. Match the cadence to the limit, not the other way around.

## Setup — Path A (Cloudflare Worker, recommended)

```bash
cd data-pipeline
npm i -g wrangler
npx wrangler kv namespace create PRICES      # paste the id into wrangler.toml
# add keys only for the sources that need them (gold-api.com needs none):
npx wrangler secret put METALS_DEV_KEY
npx wrangler secret put METALPRICEAPI_KEY
# ...
npx wrangler deploy
```

Point the site at the Worker: in `prices-client.js` set
`SNAPSHOT_URL = "https://<your-worker>.workers.dev/prices.json"` (or a custom route).
Cron + KV + the edge cache are all on Cloudflare's free plan at this volume.

## Setup — Path B (no Cloudflare)

1. Copy `node/refresh-prices.workflow.yml` to `.github/workflows/refresh-prices.yml`.
2. Add provider keys as repo **Secrets** (Settings → Secrets → Actions).
3. The action runs every 10 min, writes `public/prices.json`, and commits it.
4. Serve `public/` with your host; `prices-client.js` reads `/prices.json`.

(Don't want commit noise? Push the file to object storage — Cloudflare R2 / S3 — instead of
committing, and point the client there.)

## Hooking up the site

Add attributes to the price elements and include the client script:

```html
<div class="metal-price" data-price="gold"></div>
<span class="chg" data-change="gold"></span>
<span data-ratio></span>
<span data-freshness></span>
<div data-attributions></div>   <!-- footer -->
<script src="/data-pipeline/prices-client.js" defer></script>
```

The client polls **your own cache** once a minute (free), not the provider.

## Failover & data quality

- **First valid source wins** each cycle (cheap: ~1 provider call). Fallbacks only fire when
  the primary is down — that's your independence from any single source.
- Set `CROSS_CHECK="true"` to require **two** sources and take the per-metal **median**, with
  outlier rejection (`MAX_DEVIATION_PCT`, default 3%). Costs one extra call per cycle.
- Every value is range-checked (`RANGES` in `sources.mjs`) so a broken feed can't push a
  nonsense price live.
- If everything fails, the previous snapshot keeps serving, marked `stale` — the site never
  shows an error or an empty price.

## Honest caveats

- **Verify each adapter's endpoint + field path** against the provider's current docs — these
  differ per provider and change. The `// VERIFY` comments mark exactly what to confirm. The
  normalization contract means you only touch the adapter, never the site.
- **Attribution:** some free tiers (e.g. goldpricez) require a **visible credit link**. The
  pipeline carries that through `attributions`; the client renders it in `[data-attributions]`.
  Don't strip it — it's a condition of the free tier.
- **Free tiers aren't guaranteed.** Keep 2–3 sources configured so a withdrawn free plan is a
  shrug, not an outage. Re-check limits before launch; some providers raise prices often.
- **Label it "delayed."** Show "~10 min delayed" rather than implying live data — it's honest
  and usually required for free market data.

---

# Historical data (charts: 1W / 1M / 1Y / 5Y / 10Y / 20Y / 50Y)

History is mostly immutable — a past close never changes — so you fetch the past **once**
(backfill), then append **only new days**. Visitors load small, pre-built per-range files;
rebuilding ranges costs **zero** API calls (it's done locally from your archive).

```
[ ONE TIME ]  backfill  -> public/history/<metal>.json            (full daily archive)
                        -> public/history/<metal>-<range>.json    (1w … 50y, for the chart)
[ DAILY ]     update    -> +1 small API call/metal, append new days, regenerate range files
[ VISITOR ]   loads /history/gold-10y.json  -> a static file, no API call
```

## Files

| File | Role |
|------|------|
| `history-sources.mjs` | Time-series adapters (metalpriceapi, metals-api) + **CSV import** for deep history. |
| `buildHistory.mjs` | Backfill paging, incremental merge (dedupe + range-check), timeframe downsampling. |
| `node/backfill-history.mjs` | **Run once** to build the archive (from API and/or CSV). |
| `node/update-history.mjs` | **Run daily** to append new days. |
| `node/update-history.workflow.yml` | GitHub Action for the daily update. |
| `history-client.js` | `PMCHistory.load('gold','10y')` → points for the chart, cached in memory. |

## Why it's cheap

After the one-time backfill, it's **one small API call per metal per day** to fetch the
missing day(s) — ~365 calls/year, not per visitor. The long-range files (10y/20y/50y) are
**downsampled** (weekly/monthly), so they stay tiny and the chart stays readable — nobody can
tell daily from monthly on a 50-year chart.

## Getting deep history for free (the honest part)

Free APIs differ a lot in how far back their **daily** data goes — some give a few years,
few give decades. Two realistic routes:

1. **CSV seed (best for 20–50y).** Download a long daily series once (e.g. LBMA daily fixes,
   or any CSV with `date,close`) and import it:
   ```bash
   CSV_GOLD=./seed/gold.csv CSV_SILVER=./seed/silver.csv node data-pipeline/node/backfill-history.mjs
   ```
2. **API backfill (recent years).** With a free key, page year-by-year:
   ```bash
   METALPRICEAPI_KEY=xxxx START_YEAR=2006 node data-pipeline/node/backfill-history.mjs
   ```
You can do both — CSV for the deep past, API to extend to today. For the very long ranges,
**monthly** points are fine (and that's exactly what the 20y/50y files use).

## Daily update

Copy `node/update-history.workflow.yml` to `.github/workflows/update-history.yml` and add the
keys as repo secrets. It runs at 06:20 UTC, appends new days, regenerates the range files, and
commits them. (Prefer no commits? Write to R2/S3 instead and point `history-client.js` there.)

## Hooking up the chart

```html
<script src="/data-pipeline/history-client.js"></script>
<script>
  // when the user clicks a range button:
  const points = await PMCHistory.load('gold', '10y');  // [[date, close], ...]
  drawChart(points);                                    // your existing renderer
  PMCHistory.warm('gold');                              // prefetch 1y + 5y
</script>
```

The 24H / intraday view comes from the **spot** pipeline's recent samples, not from history;
history covers 1W and longer.
