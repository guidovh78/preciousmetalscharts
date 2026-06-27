// sources.mjs
// ---------------------------------------------------------------------------
// Each adapter fetches spot prices and returns a NORMALIZED object in USD per
// troy ounce:  { gold, silver, platinum, palladium }  (numbers, or null if a
// metal is unavailable from that source).
//
// Runs unchanged on Node 18+ and Cloudflare Workers (both have global fetch).
//
// IMPORTANT: endpoints and response field paths differ per provider and can
// change. Each adapter marks the lines you must VERIFY against the provider's
// current docs. The normalization contract below is what keeps the rest of the
// pipeline provider-agnostic, so swapping or reordering sources is trivial.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 6000;

async function getJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// A "rate" API often returns ounces-per-USD (XAU as a tiny fraction). Price per
// ounce is then 1 / rate. Use this helper when a provider gives inverted rates.
const invert = (r) => (r && r > 0 ? 1 / r : null);

// ---------------------------------------------------------------------------
// Adapter list, in DEFAULT PRIORITY ORDER (first = primary, rest = fallbacks).
// `requiresKey` adapters are skipped automatically if their env var is missing,
// so you can run with zero keys and still get data from the keyless sources.
// ---------------------------------------------------------------------------

export const SOURCES = [
  // 1) gold-api.com — free, no API key. Per-symbol endpoints.
  {
    id: 'gold-api',
    label: 'gold-api.com',
    requiresKey: false,
    freeNote: 'Free, no key. Good for a 10-min cadence.',
    attribution: null,
    async fetch() {
      // VERIFY endpoint shape at https://gold-api.com/ . Expected per-symbol:
      //   GET https://api.gold-api.com/price/XAU  ->  { "price": 4035.02, ... }
      const sym = { gold: 'XAU', silver: 'XAG', platinum: 'XPT', palladium: 'XPD' };
      const out = {};
      for (const [metal, code] of Object.entries(sym)) {
        try {
          const j = await getJSON(`https://api.gold-api.com/price/${code}`);
          out[metal] = Number(j.price ?? j.rate ?? j.value); // VERIFY field
        } catch {
          out[metal] = null;
        }
      }
      return out;
    },
  },

  // 2) metals.dev — free tier (no card). One call returns all four metals.
  {
    id: 'metals-dev',
    label: 'metals.dev',
    requiresKey: true,
    envKey: 'METALS_DEV_KEY',
    freeNote: 'Free tier ~100 req/month — fine as a FALLBACK, too low as primary at 10-min.',
    attribution: null,
    async fetch(env) {
      // VERIFY at https://metals.dev/ docs.
      //   GET https://api.metals.dev/v1/latest?api_key=KEY&currency=USD&unit=toz
      //   -> { "metals": { "gold":..., "silver":..., "platinum":..., "palladium":... } }
      const j = await getJSON(
        `https://api.metals.dev/v1/latest?api_key=${env.METALS_DEV_KEY}&currency=USD&unit=toz`
      );
      const m = j.metals || {};
      return {
        gold: Number(m.gold), silver: Number(m.silver),
        platinum: Number(m.platinum), palladium: Number(m.palladium),
      };
    },
  },

  // 3) metalpriceapi.com — free key, no card. Returns rates (often inverted).
  {
    id: 'metalpriceapi',
    label: 'metalpriceapi.com',
    requiresKey: true,
    envKey: 'METALPRICEAPI_KEY',
    freeNote: 'Free key. Check monthly quota; returns ounces-per-USD, so we invert.',
    attribution: null,
    async fetch(env) {
      // VERIFY at https://metalpriceapi.com/documentation
      //   GET https://api.metalpriceapi.com/v1/latest?api_key=KEY&base=USD&currencies=XAU,XAG,XPT,XPD
      //   -> { "rates": { "XAU": 0.000247, ... } }  (ounces per 1 USD)
      const j = await getJSON(
        `https://api.metalpriceapi.com/v1/latest?api_key=${env.METALPRICEAPI_KEY}&base=USD&currencies=XAU,XAG,XPT,XPD`
      );
      const r = j.rates || {};
      return {
        gold: invert(r.XAU), silver: invert(r.XAG),
        platinum: invert(r.XPT), palladium: invert(r.XPD),
      };
    },
  },

  // 4) goldpricez.com — high free limit (~44k/mo) but REQUIRES visible attribution.
  {
    id: 'goldpricez',
    label: 'goldpricez.com',
    requiresKey: true,
    envKey: 'GOLDPRICEZ_KEY',
    freeNote: 'Free ~30-60 req/hour. REQUIRES a visible attribution link (handled below).',
    attribution: { text: 'Gold price data: GoldPriceZ.com', href: 'https://goldpricez.com' },
    async fetch(env) {
      // VERIFY at https://goldpricez.com/about/api . Endpoints are per-metal/currency.
      //   e.g. https://goldpricez.com/api/rates/currency/usd/measure/ounce  (+ key)
      // Adjust the parse to match the exact JSON you receive.
      const base = 'https://goldpricez.com/api';
      const k = env.GOLDPRICEZ_KEY;
      const one = async (metal) => {
        try {
          const j = await getJSON(`${base}/rates/currency/usd/measure/ounce/metal/${metal}?api_key=${k}`);
          return Number(j.ounce_price ?? j.price ?? j.Price_OZ); // VERIFY field
        } catch { return null; }
      };
      return {
        gold: await one('gold'), silver: await one('silver'),
        platinum: await one('platinum'), palladium: await one('palladium'),
      };
    },
  },

  // 5) apiverve.com — 1,000 free calls/month (hourly data). Good last-resort fallback.
  {
    id: 'apiverve',
    label: 'apiverve.com',
    requiresKey: true,
    envKey: 'APIVERVE_KEY',
    freeNote: '1,000 free calls/month, hourly. Use as fallback only.',
    attribution: null,
    async fetch(env) {
      // VERIFY at https://goldprice.apiverve.com/ — gold & silver have separate tools.
      //   GET https://api.apiverve.com/v1/goldprice?currency=USD&hourly=true
      //   headers: { 'x-api-key': KEY }  ->  { data: { ounce: 4312, ... } }
      const h = { headers: { 'x-api-key': env.APIVERVE_KEY } };
      const safe = async (path) => {
        try { const j = await getJSON(`https://api.apiverve.com/v1/${path}?currency=USD`, h);
          return Number(j?.data?.ounce); } catch { return null; }
      };
      return {
        gold: await safe('goldprice'), silver: await safe('silverprice'),
        platinum: null, palladium: null, // apiverve covers gold/silver only
      };
    },
  },
];

// Sanity bounds per metal (USD/oz) to reject obviously broken feeds.
export const RANGES = {
  gold:      [800, 12000],
  silver:    [5, 600],
  platinum:  [200, 6000],
  palladium: [100, 9000],
};
