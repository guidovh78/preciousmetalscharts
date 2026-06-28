// send-newsletter.mjs — send due newsletter editions to confirmed subscribers via Brevo.
// ---------------------------------------------------------------------------------------
// Run daily. Decides per subscriber whether they are due (daily every day, weekly on
// Mondays, monthly on the 1st), builds one edition per unique (frequency, metals) combo,
// personalises the unsubscribe link, sends via the Brevo transactional API, and stamps
// lastSent. Reads/writes a local subscribers.json (the workflow FTP-syncs it).
//
//   BREVO_API_KEY=... DATA_DIR=./nl-data SUBS_FILE=./subscribers.json node send-newsletter.mjs
//   DRY_RUN=true ...  → build + log only, send nothing, don't stamp lastSent.
// ---------------------------------------------------------------------------------------

import { buildEdition } from './build-newsletter.mjs';
import { readFile, writeFile } from 'node:fs/promises';

const KEY          = process.env.BREVO_API_KEY || '';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'newsletter@preciousmetalscharts.com';
const SENDER_NAME  = process.env.SENDER_NAME || 'preciousmetalscharts';
const SITE         = 'https://preciousmetalscharts.com';
const DATA_DIR     = process.env.DATA_DIR || './nl-data';
const SUBS_FILE    = process.env.SUBS_FILE || './subscribers.json';
const DRY          = process.env.DRY_RUN === 'true';
const MAX_SEND     = Number(process.env.MAX_SEND || 280); // stay under Brevo free 300/day

const now = new Date();
const dow = now.getUTCDay();   // 0 = Sunday, 1 = Monday
const dom = now.getUTCDate();

function due(sub) {
  if (!sub || sub.status !== 'active') return false;
  const f = sub.frequency || 'weekly';
  const last = sub.lastSent && sub.lastSent[f];
  const daysSince = last ? (now - new Date(last)) / 86400000 : Infinity;
  if (f === 'daily')   return daysSince >= 0.9;
  if (f === 'weekly')  return dow === 1 && daysSince >= 6;   // Mondays
  if (f === 'monthly') return dom === 1 && daysSince >= 25;  // 1st of month
  return false;
}

async function brevoSend(to, subject, html, text) {
  if (DRY) return true;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': KEY, 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({ sender: { name: SENDER_NAME, email: SENDER_EMAIL }, to: [{ email: to }], subject, htmlContent: html, textContent: text, tags: ['newsletter'] }),
    });
    if (!r.ok) console.warn(`Brevo ${r.status} for ${to}: ${(await r.text()).slice(0, 160)}`);
    return r.ok;
  } catch (e) { console.warn(`Brevo error for ${to}: ${e.message}`); return false; }
}

const subs = JSON.parse(await readFile(SUBS_FILE, 'utf8').catch(() => '[]'));
if (!Array.isArray(subs) || subs.length === 0) { console.log('No subscribers — nothing to do.'); process.exit(0); }

const dueSubs = subs.filter(due);
console.log(`${dueSubs.length} due of ${subs.length} subscribers (UTC dow=${dow}, dom=${dom}, dry=${DRY}).`);
if (dueSubs.length === 0) process.exit(0);
if (!KEY && !DRY) { console.log('BREVO_API_KEY not set — exiting without sending.'); process.exit(0); }

const cache = new Map();
async function editionFor(freq, metals) {
  const key = freq + '|' + [...(metals || [])].sort().join(',');
  if (cache.has(key)) return cache.get(key);
  const ed = await buildEdition({ dataDir: DATA_DIR, period: freq, metals });
  cache.set(key, ed);
  return ed;
}

let sent = 0, failed = 0;
for (const s of dueSubs) {
  if (sent >= MAX_SEND) { console.log(`Reached MAX_SEND (${MAX_SEND}); the rest go next run.`); break; }
  let ed;
  try { ed = await editionFor(s.frequency || 'weekly', s.metals || []); }
  catch (e) { console.warn(`Build failed for ${s.email}: ${e.message}`); failed++; continue; }
  const prefs = `${SITE}/newsletter`;
  const unsub = `${SITE}/newsletter.php?u=${encodeURIComponent(s.unsubToken || '')}`;
  const html = ed.html.split('{{PREFS_URL}}').join(prefs).split('{{UNSUB_URL}}').join(unsub);
  const text = ed.text.split('{{PREFS_URL}}').join(prefs).split('{{UNSUB_URL}}').join(unsub);
  const ok = await brevoSend(s.email, ed.subject, html, text);
  if (ok && !DRY) { s.lastSent = s.lastSent || {}; s.lastSent[s.frequency || 'weekly'] = now.toISOString(); }
  if (ok) sent++; else failed++;
  await new Promise((r) => setTimeout(r, 250));
}

if (!DRY) await writeFile(SUBS_FILE, JSON.stringify(subs, null, 2));
console.log(`Done. sent=${sent} failed=${failed}`);
