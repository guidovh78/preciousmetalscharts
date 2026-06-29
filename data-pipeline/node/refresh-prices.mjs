// refresh-prices.mjs — Node 18+ alternative (no Cloudflare needed)
// ---------------------------------------------------------------------------
// Reads the previous snapshot + baseline from ./public, builds a fresh snapshot
// with multi-source failover, and writes them back. Run it on a schedule with
// GitHub Actions (see refresh-prices.workflow.yml), a host cron, or any
// scheduler. Visitors read the static public/prices.json — never the provider.
//
//   node refresh-prices.mjs
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { buildSnapshot } from '../fetchPrices.mjs';

const OUT_DIR = process.env.OUT_DIR || './public';
const SNAP = `${OUT_DIR}/prices.json`;
const BASE = `${OUT_DIR}/baseline.json`;

async function readJSON(p) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; }
}

const env = {
  METALS_DEV_KEY: process.env.METALS_DEV_KEY,
  METALPRICEAPI_KEY: process.env.METALPRICEAPI_KEY,
  GOLDPRICEZ_KEY: process.env.GOLDPRICEZ_KEY,
  APIVERVE_KEY: process.env.APIVERVE_KEY,
};

const [prev, baseline] = await Promise.all([readJSON(SNAP), readJSON(BASE)]);

const result = await buildSnapshot(env, prev, baseline, {
  crossCheck: process.env.CROSS_CHECK === 'true',
  maxDeviationPct: Number(process.env.MAX_DEVIATION_PCT || 3),
});

await mkdir(OUT_DIR, { recursive: true });

if (result.ok) {
  // Live USD->EUR rate (ECB-style, free, no key). Non-fatal: prices still update if it fails;
  // the client falls back to the last known rate.
  try {
    const fx = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) }).then((r) => r.json());
    if (fx && fx.rates) {
      // The 10 most-traded world currencies (USD base) for the live page's currency picker.
      const WANT = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD'];
      const rates = { USD: 1 };
      for (const c of WANT) { const v = Number(fx.rates[c]); if (v > 0) rates[c] = Number(v.toFixed(6)); }
      const eur = Number(fx.rates.EUR);
      result.snapshot.fx = { base: 'USD', eur: (eur > 0.5 && eur < 1.5) ? Number(eur.toFixed(5)) : undefined, rates };
    }
  } catch (e) { console.warn(`FX fetch failed — ${e.message} (snapshot keeps USD only)`); }
  await writeFile(SNAP, JSON.stringify(result.snapshot, null, 2));
  await writeFile(BASE, JSON.stringify(result.baseline, null, 2));

  // Rolling intraday samples (~26h) so the live page can draw a small "today" chart per metal.
  // One sample per run (~every 10 min). Trimmed by time + capped length; persisted in the repo.
  try {
    const INTRA = `${OUT_DIR}/intraday.json`;
    const intr = (await readJSON(INTRA)) || {};
    if (!intr.metals || typeof intr.metals !== 'object') intr.metals = {};
    const ts = result.snapshot.updatedAt || new Date().toISOString();
    const cutoff = Date.now() - 26 * 3600 * 1000;
    for (const m of Object.keys(result.snapshot.metals)) {
      const price = result.snapshot.metals[m] && result.snapshot.metals[m].price;
      if (price == null) continue;
      const arr = Array.isArray(intr.metals[m]) ? intr.metals[m] : [];
      if (!arr.length || arr[arr.length - 1][0] !== ts) arr.push([ts, Number(price)]);
      intr.metals[m] = arr.filter((p) => Date.parse(p[0]) >= cutoff).slice(-220);
    }
    intr.updatedAt = ts; intr.stepMin = 10;
    await writeFile(INTRA, JSON.stringify(intr));
  } catch (e) { console.warn(`intraday update failed — ${e.message}`); }

  console.log(`OK  ${result.snapshot.source}  gold=${result.snapshot.metals.gold.price}  eur=${result.snapshot.fx ? result.snapshot.fx.eur : 'n/a'}`);
} else if (prev) {
  const stale = { ...prev, stale: true, lastCheckFailedAt: new Date().toISOString() };
  await writeFile(SNAP, JSON.stringify(stale, null, 2));
  console.warn(`ALL SOURCES FAILED (tried: ${result.tried.join(', ')}) — kept previous snapshot, marked stale`);
} else {
  console.error('No data and no previous snapshot to fall back to.');
  process.exit(1);
}
