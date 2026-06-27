// update-history.mjs — run DAILY. Appends only the missing recent days
// (one small API call per metal) and regenerates the timeframe files locally.
// ---------------------------------------------------------------------------
//   node update-history.mjs
// ---------------------------------------------------------------------------

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { updateFromApi, deriveTimeframes, emptyMaster, METALS } from '../buildHistory.mjs';

const OUT = (process.env.OUT_DIR || './public') + '/history';
const env = {
  METALPRICEAPI_KEY: process.env.METALPRICEAPI_KEY,
  METALS_API_KEY: process.env.METALS_API_KEY,
};

async function readJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }

await mkdir(OUT, { recursive: true });
let totalAdded = 0;

for (const metal of METALS) {
  const masterPath = `${OUT}/${metal}.json`;
  const master = (await readJSON(masterPath)) || emptyMaster(metal);
  let added = 0;
  try { added = await updateFromApi(env, master); }
  catch (e) { console.warn(`${metal}: update failed — ${e.message} (keeping existing archive)`); }

  if (added > 0) {
    await writeFile(masterPath, JSON.stringify(master));
    const frames = deriveTimeframes(master);
    for (const [range, file] of Object.entries(frames)) {
      await writeFile(`${OUT}/${metal}-${range}.json`, JSON.stringify(file));
    }
  }
  totalAdded += added;
  console.log(`${metal}: +${added} day(s)  (archive now ${master.points.length} pts)`);
}

console.log(`Update complete. ${totalAdded} new point(s) total.`);
