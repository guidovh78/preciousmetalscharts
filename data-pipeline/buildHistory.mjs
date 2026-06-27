// buildHistory.mjs
// ---------------------------------------------------------------------------
// Pure-ish logic for the historical archive:
//   - backfillFromApi : page year-by-year through the first working source
//   - mergeIncremental : add only the days you don't already have
//   - deriveTimeframes : build the small per-range files the chart loads
//
// The "master" series per metal is the full daily archive you keep. Everything
// else (1w … 50y) is derived from it locally — no API calls to rebuild ranges.
// ---------------------------------------------------------------------------

import { HISTORY_SOURCES } from './history-sources.mjs';
import { RANGES } from './sources.mjs';

const METALS = ['gold', 'silver', 'platinum', 'palladium'];

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
// History reaches back decades, where prices were far below modern spot (gold was
// $35/oz in 1960, silver < $1, platinum < $100). So history uses MUCH wider sanity
// bounds than the live-spot RANGES (which stay tight to catch broken feeds).
const HIST_RANGES = { gold: [20, 20000], silver: [0.3, 2000], platinum: [40, 12000], palladium: [20, 15000] };
function inRange(metal, v) { const [lo, hi] = (HIST_RANGES[metal] || RANGES[metal]); return v != null && isFinite(v) && v >= lo && v <= hi; }

// master = { metal, base, unit, points: [[ "YYYY-MM-DD", close ], ...] sorted asc }
export function emptyMaster(metal) { return { metal, base: 'USD', unit: 'troy_oz', points: [] }; }

// Merge a Map(date->close) into a master, keeping only NEW, in-range days.
export function mergeIncremental(master, map) {
  const seen = new Set(master.points.map((p) => p[0]));
  let added = 0;
  for (const [day, px] of map) {
    if (!seen.has(day) && inRange(master.metal, px)) { master.points.push([day, px]); seen.add(day); added++; }
  }
  master.points.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return added;
}

// Backfill from APIs, paging one calendar year per call (free-tier friendly).
export async function backfillFromApi(env, metal, startYear) {
  const src = HISTORY_SOURCES.find((s) => !s.requiresKey || env[s.envKey]);
  if (!src) throw new Error('No historical source available (set an API key).');
  const master = emptyMaster(metal);
  const endYear = new Date().getUTCFullYear();
  for (let y = startYear; y <= endYear; y++) {
    const start = `${y}-01-01`;
    const end = y === endYear ? yesterday() : `${y}-12-31`;
    try {
      const map = await src.timeseries(env, metal, start, end);
      mergeIncremental(master, map);
    } catch (e) {
      // try the next source for this year, then continue
      for (const alt of HISTORY_SOURCES) {
        if (alt === src || (alt.requiresKey && !env[alt.envKey])) continue;
        try { mergeIncremental(master, await alt.timeseries(env, metal, start, end)); break; } catch {}
      }
    }
  }
  return master;
}

// Fetch only the days after the master's last date (the daily incremental).
export async function updateFromApi(env, master) {
  const last = master.points.length ? master.points[master.points.length - 1][0] : null;
  const start = last ? addDays(last, 1) : `${new Date().getUTCFullYear()}-01-01`;
  const end = yesterday();
  if (start > end) return 0; // already current
  for (const src of HISTORY_SOURCES) {
    if (src.requiresKey && !env[src.envKey]) continue;
    try { return mergeIncremental(master, await src.timeseries(env, master.metal, start, end)); }
    catch {}
  }
  return 0;
}

function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// ----- timeframe derivation ------------------------------------------------
// Long ranges are downsampled (weekly / monthly) so files stay small and charts
// stay readable. Nobody can tell daily from monthly on a 50-year chart.
const RANGE_DEFS = {
  '1w':  { days: 7,            sample: 'daily'   },
  '1m':  { days: 31,           sample: 'daily'   },
  '1y':  { days: 366,          sample: 'daily'   },
  '5y':  { days: 5 * 366,      sample: 'weekly'  },
  '10y': { days: 10 * 366,     sample: 'weekly'  },
  '20y': { days: 20 * 366,     sample: 'monthly' },
  '50y': { days: 50 * 366,     sample: 'monthly' },
};

function sliceByDays(points, days) {
  if (!points.length) return [];
  const cutoff = addDays(points[points.length - 1][0], -days);
  return points.filter((p) => p[0] >= cutoff);
}

// keep the LAST point in each bucket (week = ISO year+week, month = YYYY-MM)
function downsample(points, mode) {
  if (mode === 'daily') return points;
  const buckets = new Map();
  for (const p of points) {
    const key = mode === 'monthly' ? p[0].slice(0, 7) : isoWeekKey(p[0]);
    buckets.set(key, p); // later point overwrites -> last in bucket wins
  }
  return [...buckets.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function isoWeekKey(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;            // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3);          // nearest Thursday
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Produce { "1w": file, ..., "50y": file } from a master series.
export function deriveTimeframes(master, { ranges = Object.keys(RANGE_DEFS) } = {}) {
  const out = {};
  for (const r of ranges) {
    const def = RANGE_DEFS[r];
    if (!def) continue;
    const pts = downsample(sliceByDays(master.points, def.days), def.sample);
    if (pts.length < 2) continue; // not enough history for this range yet
    out[r] = {
      metal: master.metal, range: r, base: master.base, unit: master.unit,
      sample: def.sample, points: pts, generatedAt: new Date().toISOString(),
    };
  }
  return out;
}

export { METALS, RANGE_DEFS };
