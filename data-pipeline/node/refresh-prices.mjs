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
  await writeFile(SNAP, JSON.stringify(result.snapshot, null, 2));
  await writeFile(BASE, JSON.stringify(result.baseline, null, 2));
  console.log(`OK  ${result.snapshot.source}  gold=${result.snapshot.metals.gold.price}`);
} else if (prev) {
  const stale = { ...prev, stale: true, lastCheckFailedAt: new Date().toISOString() };
  await writeFile(SNAP, JSON.stringify(stale, null, 2));
  console.warn(`ALL SOURCES FAILED (tried: ${result.tried.join(', ')}) — kept previous snapshot, marked stale`);
} else {
  console.error('No data and no previous snapshot to fall back to.');
  process.exit(1);
}
