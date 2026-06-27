// fetchPrices.mjs
// ---------------------------------------------------------------------------
// Orchestrates the free price pipeline with multi-source failover.
//
// Strategy (cheap by default, resilient always):
//  1. Try sources in priority order; stop at the FIRST that returns all metals
//     within sane ranges. That's 1 provider call per cycle in normal operation.
//  2. If CROSS_CHECK is on, gather a 2nd valid source and take the per-metal
//     MEDIAN, dropping any value that deviates more than MAX_DEVIATION from it.
//  3. If NO source returns valid data, the caller keeps serving the previous
//     snapshot (marked stale) — the site never breaks.
//
// Day-change % is computed against a "day open" baseline captured at the first
// successful run of each UTC day.
// ---------------------------------------------------------------------------

import { SOURCES, RANGES } from './sources.mjs';

const METALS = ['gold', 'silver', 'platinum', 'palladium'];

function inRange(metal, v) {
  if (v == null || !isFinite(v)) return false;
  const [lo, hi] = RANGES[metal];
  return v >= lo && v <= hi;
}

// A source result counts as valid only if at least the two monetary metals
// (gold + silver) are present and sane. Platinum/palladium may be null.
function isUsable(metals) {
  return inRange('gold', metals.gold) && inRange('silver', metals.silver);
}

function median(nums) {
  const a = nums.filter((n) => n != null && isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * @param {object} env       environment with API keys
 * @param {object} prev      previous snapshot (or null)
 * @param {object} baseline  { date: 'YYYY-MM-DD', open: {gold,...} } or null
 * @param {object} opts      { crossCheck?: boolean, maxDeviationPct?: number }
 */
export async function buildSnapshot(env, prev, baseline, opts = {}) {
  const crossCheck = opts.crossCheck ?? false;
  const maxDev = opts.maxDeviationPct ?? 3; // drop a source >3% off the median

  const usable = [];
  const tried = [];
  const attributions = [];

  for (const src of SOURCES) {
    if (src.requiresKey && !env[src.envKey]) continue; // skip keyless-missing
    tried.push(src.id);
    try {
      const metals = await src.fetch(env);
      if (isUsable(metals)) {
        usable.push({ id: src.id, label: src.label, metals, attribution: src.attribution });
        if (!crossCheck) break;            // cheap mode: first valid wins
        if (usable.length >= 2) break;     // cross-check needs only two
      }
    } catch (e) {
      // swallow and fall through to the next source
    }
  }

  // No source worked → tell caller to keep the previous snapshot.
  if (usable.length === 0) {
    return { ok: false, tried };
  }

  // Consensus prices per metal.
  const price = {};
  for (const metal of METALS) {
    const vals = usable.map((u) => u.metals[metal]).filter((v) => inRange(metal, v));
    if (vals.length === 0) { price[metal] = null; continue; }
    if (vals.length === 1) { price[metal] = vals[0]; continue; }
    const med = median(vals);
    // outlier rejection: keep values within maxDev% of the median, re-median
    const kept = vals.filter((v) => Math.abs(v - med) / med * 100 <= maxDev);
    price[metal] = median(kept.length ? kept : vals);
  }

  // Day-open baseline (for change %).
  const today = new Date().toISOString().slice(0, 10);
  let base = baseline;
  if (!base || base.date !== today) {
    base = { date: today, open: { ...price } };
  } else {
    // backfill any metal that was missing at first run of the day
    for (const m of METALS) if (base.open[m] == null && price[m] != null) base.open[m] = price[m];
  }

  const metalsOut = {};
  for (const m of METALS) {
    const p = price[m];
    const open = base.open[m];
    const changePct = p != null && open ? ((p - open) / open) * 100 : null;
    metalsOut[m] = {
      price: p,
      open: open ?? null,
      changePct: changePct != null ? Number(changePct.toFixed(2)) : null,
    };
  }

  for (const u of usable) if (u.attribution) attributions.push(u.attribution);

  const snapshot = {
    updatedAt: new Date().toISOString(),
    delayedMinutes: 10,
    base: 'USD',
    unit: 'troy_oz',
    source: usable.map((u) => u.label).join(' + '),
    sourcesTried: tried,
    metals: metalsOut,
    attributions,     // render these in the footer if present
    stale: false,
  };

  return { ok: true, snapshot, baseline: base };
}
