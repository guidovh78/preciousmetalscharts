// history-client.js — load a pre-built timeframe file for the chart.
// ---------------------------------------------------------------------------
// Files live at /history/<metal>-<range>.json and are STATIC — serving them to
// any number of visitors costs zero API calls. Loaded files are cached in
// memory so switching back to a range is instant.
//
//   const pts = await PMCHistory.load('gold', '10y');  // -> [[date, close], ...]
//   // feed pts into your existing chart renderer
// ---------------------------------------------------------------------------

window.PMCHistory = (function () {
  const BASE = '/history';
  const RANGES = ['1w', '1m', '1y', '5y', '10y', '20y', '50y'];
  const cache = new Map();

  async function load(metal, range) {
    if (!RANGES.includes(range)) throw new Error(`Unknown range: ${range}`);
    const key = `${metal}-${range}`;
    if (cache.has(key)) return cache.get(key);
    const res = await fetch(`${BASE}/${key}.json`, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`No data for ${key}`);
    const file = await res.json();
    cache.set(key, file.points);
    return file.points;          // [[ "YYYY-MM-DD", close ], ...]
  }

  // Prefetch the likely-first ranges so the initial chart is instant.
  function warm(metal, ranges = ['1y', '5y']) {
    ranges.forEach((r) => load(metal, r).catch(() => {}));
  }

  return { load, warm, RANGES };
})();
