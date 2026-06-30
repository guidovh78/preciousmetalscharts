// build-ratio-data.mjs — turn our gold + silver deep history into citeable ratio assets.
// ---------------------------------------------------------------------------------------
// Reads gold-50y.json + silver-50y.json (monthly deep history, World Bank-backed) and writes:
//   public/ratio-stats.json   — long-run statistics (avg, min/max with dates, distribution,
//                               percentile breakpoints) used by /ratio for live context + GEO.
//   public/ratio-history.csv  — the full gold-to-silver ratio history, a downloadable/citeable
//                               linkable asset (date,gold_usd,silver_usd,ratio).
// Factual data only — no advice. Run daily (folded into the market-recap Action).
//
//   DATA_DIR=./public node build-ratio-data.mjs
// ---------------------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';

const DATA = process.env.DATA_DIR || './public';

async function readJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }

const gold = await readJSON(`${DATA}/history/gold-50y.json`);
const silver = await readJSON(`${DATA}/history/silver-50y.json`);
if (!gold || !gold.points || !silver || !silver.points) {
  console.error('Missing gold-50y.json / silver-50y.json in ' + DATA);
  process.exit(1);
}

// align gold + silver by date → ratio series
const sm = new Map(silver.points.map((p) => [p[0], p[1]]));
const rows = []; // {date, gold, silver, ratio}
for (const [date, gp] of gold.points) {
  const sp = sm.get(date);
  if (sp && sp > 0 && gp > 0) rows.push({ date, gold: gp, silver: sp, ratio: gp / sp });
}
if (rows.length < 12) { console.error('Too few aligned ratio points: ' + rows.length); process.exit(1); }

const ratios = rows.map((r) => r.ratio);
const sorted = [...ratios].sort((a, b) => a - b);
const sum = ratios.reduce((a, b) => a + b, 0);
const average = sum / ratios.length;
const median = sorted[Math.floor(sorted.length / 2)];
const pct = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

let minRow = rows[0], maxRow = rows[0];
for (const r of rows) { if (r.ratio < minRow.ratio) minRow = r; if (r.ratio > maxRow.ratio) maxRow = r; }
const latest = rows[rows.length - 1];

const yr = (d) => String(d).slice(0, 4);
const stats = {
  updatedAt: new Date().toISOString(),
  count: rows.length,
  rangeLabel: `${yr(rows[0].date)}–${yr(latest.date)}`,
  average: +average.toFixed(1),
  median: +median.toFixed(1),
  min: { value: +minRow.ratio.toFixed(1), date: minRow.date },
  max: { value: +maxRow.ratio.toFixed(1), date: maxRow.date },
  latest: { value: +latest.ratio.toFixed(1), date: latest.date },
  p10: +pct(0.1).toFixed(1), p25: +pct(0.25).toFixed(1), p75: +pct(0.75).toFixed(1), p90: +pct(0.9).toFixed(1),
  // compact sorted distribution (1-decimal) so the page can place the LIVE ratio's percentile client-side
  distribution: sorted.map((v) => +v.toFixed(1)),
};

await writeFile(`${DATA}/ratio-stats.json`, JSON.stringify(stats));

// CSV — the downloadable, citeable asset
let csv = 'date,gold_usd,silver_usd,gold_to_silver_ratio\n';
for (const r of rows) csv += `${r.date},${r.gold.toFixed(2)},${r.silver.toFixed(2)},${r.ratio.toFixed(2)}\n`;
await writeFile(`${DATA}/ratio-history.csv`, csv);

console.log(`ratio-data: ${rows.length} months ${stats.rangeLabel} | avg ${stats.average} | min ${stats.min.value} (${stats.min.date}) | max ${stats.max.value} (${stats.max.date})`);
