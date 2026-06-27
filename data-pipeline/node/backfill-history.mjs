// backfill-history.mjs — run ONCE to build the historical archive.
// ---------------------------------------------------------------------------
//   node backfill-history.mjs                 # backfill from API, START_YEAR..now
//   CSV_GOLD=./seed/gold.csv node backfill-history.mjs   # import deep history from CSV
//
// Writes, per metal:
//   public/history/<metal>.json          (full daily master archive)
//   public/history/<metal>-<range>.json  (1w,1m,1y,5y,10y,20y,50y for the chart)
// After this, run update-history.mjs daily to append new days.
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { backfillFromApi, deriveTimeframes, emptyMaster, mergeIncremental, METALS } from '../buildHistory.mjs';
import { parseCsv } from '../history-sources.mjs';

const OUT = (process.env.OUT_DIR || './public') + '/history';
const START_YEAR = Number(process.env.START_YEAR || 2006);   // API daily history is usually shallow; use CSV for older
const FORCE = process.argv.includes('--force');

const env = {
  METALPRICEAPI_KEY: process.env.METALPRICEAPI_KEY,
  METALS_API_KEY: process.env.METALS_API_KEY,
};

async function readJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }

await mkdir(OUT, { recursive: true });

for (const metal of METALS) {
  const masterPath = `${OUT}/${metal}.json`;
  let master = FORCE ? null : await readJSON(masterPath);
  if (master) { console.log(`skip ${metal}: master exists (${master.points.length} pts). Use --force to rebuild.`); }
  else {
    master = emptyMaster(metal);

    // (a) optional CSV seed for deep history (e.g. LBMA fixes you downloaded once)
    const csvPath = process.env[`CSV_${metal.toUpperCase()}`];
    if (csvPath) {
      try {
        const map = parseCsv(await readFile(csvPath, 'utf8'), { dateCol: 'date', closeCol: 'close' });
        const n = mergeIncremental(master, map);
        console.log(`${metal}: imported ${n} rows from CSV ${csvPath}`);
      } catch (e) { console.warn(`${metal}: CSV import failed — ${e.message}`); }
    }

    // (b) API backfill to fill/extend recent years (skips days already seeded)
    if (env.METALPRICEAPI_KEY || env.METALS_API_KEY) {
      try {
        const apiMaster = await backfillFromApi(env, metal, START_YEAR);
        const n = mergeIncremental(master, new Map(apiMaster.points));
        console.log(`${metal}: API backfill added ${n} days (${START_YEAR}–now)`);
      } catch (e) { console.warn(`${metal}: API backfill failed — ${e.message}`); }
    } else if (!csvPath) {
      console.warn(`${metal}: no CSV and no API key — nothing to backfill.`);
    }
  }

  if (!master.points.length) { console.warn(`${metal}: empty, skipping write.`); continue; }
  await writeFile(masterPath, JSON.stringify(master));
  const frames = deriveTimeframes(master);
  for (const [range, file] of Object.entries(frames)) {
    await writeFile(`${OUT}/${metal}-${range}.json`, JSON.stringify(file));
  }
  console.log(`${metal}: wrote master (${master.points.length} pts) + ${Object.keys(frames).length} timeframe files.`);
}

console.log('Backfill complete.');
