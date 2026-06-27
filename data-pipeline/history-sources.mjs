// history-sources.mjs
// ---------------------------------------------------------------------------
// Sources for HISTORICAL (time-series) data. Each adapter returns daily closes
// for one metal over a date range, normalized to a Map<"YYYY-MM-DD", number>
// in USD per troy ounce.
//
// History is mostly immutable: a past close never changes. So we fetch the past
// ONCE (backfill), then append only new days. The caller pages the backfill
// year-by-year, so even 20 years is ~20 calls total — trivial for a free tier.
//
// Runs on Node 18+ and Cloudflare Workers (global fetch). VERIFY every endpoint
// and field path against the provider's current docs — they differ and change.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 12000;
const CODE = { gold: 'XAU', silver: 'XAG', platinum: 'XPT', palladium: 'XPD' };
const invert = (r) => (r && r > 0 ? 1 / r : null);

async function getJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

export const HISTORY_SOURCES = [
  // 1) metalpriceapi.com — timeframe endpoint returns a date range in one call.
  {
    id: 'metalpriceapi',
    label: 'metalpriceapi.com',
    requiresKey: true,
    envKey: 'METALPRICEAPI_KEY',
    // VERIFY: free tier may cap the range per call -> caller pages by year.
    async timeseries(env, metal, startISO, endISO) {
      // GET https://api.metalpriceapi.com/v1/timeframe?api_key=KEY
      //     &start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&base=USD&currencies=XAU
      // -> { rates: { "2024-01-02": { XAU: 0.000247 }, ... } }   (inverted)
      const url = `https://api.metalpriceapi.com/v1/timeframe?api_key=${env.METALPRICEAPI_KEY}`
        + `&start_date=${startISO}&end_date=${endISO}&base=USD&currencies=${CODE[metal]}`;
      const j = await getJSON(url);
      const out = new Map();
      const rates = j.rates || j.quotes || {};
      for (const [day, obj] of Object.entries(rates)) {
        const raw = obj?.[CODE[metal]];
        const px = invert(Number(raw));               // ounces-per-USD -> USD/oz
        if (px) out.set(day, Number(px.toFixed(2)));
      }
      return out;
    },
  },

  // 2) metals-api.com — timeseries endpoint (fallback). Note: some plans don't
  //    allow today's date as end_date; the caller already ends at "yesterday".
  {
    id: 'metals-api',
    label: 'metals-api.com',
    requiresKey: true,
    envKey: 'METALS_API_KEY',
    async timeseries(env, metal, startISO, endISO) {
      // VERIFY: https://metals-api.com/documentation
      // GET https://metals-api.com/api/timeseries?access_key=KEY
      //     &start_date=...&end_date=...&base=USD&symbols=XAU
      // -> { rates: { "2024-01-02": { XAU: 0.000247 } } }  (often inverted)
      const url = `https://metals-api.com/api/timeseries?access_key=${env.METALS_API_KEY}`
        + `&start_date=${startISO}&end_date=${endISO}&base=USD&symbols=${CODE[metal]}`;
      const j = await getJSON(url);
      const out = new Map();
      for (const [day, obj] of Object.entries(j.rates || {})) {
        const raw = obj?.[CODE[metal]];
        const px = invert(Number(raw));
        if (px) out.set(day, Number(px.toFixed(2)));
      }
      return out;
    },
  },
];

// ---------------------------------------------------------------------------
// CSV import — the realistic way to get FREE deep history (20–50 years).
// Download a historical series once (e.g. LBMA daily fixes, or any CSV with a
// date column and a price column) and import it. After that, the daily API
// update keeps it current.
// ---------------------------------------------------------------------------
export function parseCsv(csvText, { dateCol = 'date', closeCol = 'close', delimiter = ',' } = {}) {
  const lines = csvText.trim().split(/\r?\n/);
  const header = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());
  const di = header.indexOf(dateCol.toLowerCase());
  const ci = header.indexOf(closeCol.toLowerCase());
  if (di < 0 || ci < 0) throw new Error(`CSV must have "${dateCol}" and "${closeCol}" columns`);
  const out = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter);
    const day = normalizeDate(cols[di]);
    const px = Number(String(cols[ci]).replace(/[^0-9.\-]/g, ''));
    if (day && isFinite(px) && px > 0) out.set(day, px);
  }
  return out;
}

// Accepts YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY -> returns YYYY-MM-DD or null.
export function normalizeDate(s) {
  if (!s) return null;
  s = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const a = +m[1], b = +m[2], y = m[3];
    // assume US MM/DD if first part > 12 is impossible; prefer MM/DD then DD/MM
    const mm = a <= 12 ? a : b, dd = a <= 12 ? b : a;
    return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}
