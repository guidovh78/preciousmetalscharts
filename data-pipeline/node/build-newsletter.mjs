// build-newsletter.mjs — compose a data-driven metals newsletter edition.
// ---------------------------------------------------------------------------
// Reads the static price snapshot + history archive (the same files the site
// serves) and produces a factual recap email: per-metal change over the period,
// the gold-to-silver ratio, and "where it stands" context. NO predictions and
// NO advice — only real numbers from our own data.
//
//   DATA_DIR=./public PERIOD=weekly METALS=gold,silver node build-newsletter.mjs > edition.html
//
// PERIOD = daily | weekly | monthly   (default weekly)
// METALS = comma list (default all four)
// Emits the HTML edition to stdout; set OUT=path to also write a file, and
// TEXT=path for the plain-text version.
// ---------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';

const DATA = process.env.DATA_DIR || './public';
const PERIOD = (process.env.PERIOD || 'weekly').toLowerCase();
const SEL = (process.env.METALS || 'gold,silver,platinum,palladium').split(',').map((s) => s.trim()).filter(Boolean);

const META = {
  gold: { name: 'Gold', sym: 'XAU', color: '#C19A2E' },
  silver: { name: 'Silver', sym: 'XAG', color: '#8C9298' },
  platinum: { name: 'Platinum', sym: 'XPT', color: '#9FB1BB' },
  palladium: { name: 'Palladium', sym: 'XPD', color: '#B8997A' },
};
const ALL = ['gold', 'silver', 'platinum', 'palladium'];
const DAYS = { daily: 1, weekly: 7, monthly: 30 };
const PLABEL = { daily: 'today', weekly: 'this week', monthly: 'this month' };
const PNOUN = { daily: 'day', weekly: 'week', monthly: 'month' };
const PWORD = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const pnoun = PNOUN[PERIOD] || 'week';
const periodDays = DAYS[PERIOD] || 7;

async function tryJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }

const snap = await tryJSON(`${DATA}/prices.json`);
if (!snap || !snap.metals) { console.error('No prices.json'); process.exit(1); }
const refDate = new Date(snap.updatedAt && !isNaN(Date.parse(snap.updatedAt)) ? snap.updatedAt : Date.now());

const hist = {};
for (const m of ALL) {
  hist[m] = {
    daily: (await tryJSON(`${DATA}/history/${m}-1y.json`))?.points || null,
    monthly: (await tryJSON(`${DATA}/history/${m}-50y.json`))?.points || null,
  };
}

function isoDaysAgo(days) { const d = new Date(refDate); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }
function closeAtOrBefore(points, iso) { let v = points && points.length ? points[0][1] : null; if (!points) return null; for (const p of points) { if (p[0] <= iso) v = p[1]; else break; } return v; }
function windowExtent(points, cutISO, current) { const vals = (points || []).filter((p) => p[0] >= cutISO).map((p) => p[1]); if (current != null) vals.push(current); return vals.length ? { hi: Math.max(...vals), lo: Math.min(...vals) } : null; }

const cutISO = isoDaysAgo(periodDays);

const data = {};
for (const m of ALL) {
  const price = snap.metals[m]?.price;
  if (price == null) continue;
  const daily = hist[m].daily, monthly = hist[m].monthly;
  const past = daily ? closeAtOrBefore(daily, cutISO) : null;
  const periodPct = (past && past > 0) ? (price - past) / past * 100 : (PERIOD === 'daily' ? (snap.metals[m].changePct ?? null) : null);
  const yrAgo = daily && daily.length ? daily[0][1] : (monthly ? closeAtOrBefore(monthly, isoDaysAgo(365)) : null);
  const yrPct = (yrAgo && yrAgo > 0) ? (price - yrAgo) / yrAgo * 100 : null;
  const ext = windowExtent(daily, cutISO, price);
  const recordHigh = Math.max(price, ...(monthly || []).map((p) => p[1]), ...(daily || []).map((p) => p[1]));
  data[m] = { price, periodPct, yrPct, ext, recordHigh, pastPeriod: past };
}

// gold-to-silver ratio
function ratioNow() { const g = data.gold?.price, s = data.silver?.price; return (g && s) ? g / s : null; }
function ratioPeriodAgo() { const g = data.gold?.pastPeriod, s = data.silver?.pastPeriod; return (g && s) ? g / s : null; }
function ratioLongRunAvg() {
  const g = hist.gold.monthly, s = hist.silver.monthly; if (!g || !s) return null;
  const sm = new Map(s.map((p) => [p[0], p[1]])); let sum = 0, n = 0;
  for (const [d, gp] of g) { const sp = sm.get(d); if (sp) { sum += gp / sp; n++; } }
  return n ? sum / n : null;
}
const rNow = ratioNow(), rPast = ratioPeriodAgo(), rAvg = ratioLongRunAvg();

// formatting
const fmtP = (n) => n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n) => n == null ? '—' : (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1) + '%';
const arrow = (n) => n == null ? '' : (n >= 0 ? '▲ ' : '▼ ');
const upcol = '#1A7F5A', downcol = '#C2453A';
const col = (n) => n == null ? '#6B7177' : (n >= 0 ? upcol : downcol);

// leader / laggard over 12 months among selected (fall back to all if needed)
const ranked = SEL.filter((m) => data[m]?.yrPct != null).sort((a, b) => data[b].yrPct - data[a].yrPct);
const leader = ranked[0], laggard = ranked[ranked.length - 1];

// narrative
function narrative() {
  const sel = SEL.filter((m) => data[m]?.periodPct != null);
  const ups = sel.filter((m) => data[m].periodPct >= 0).length;
  const tone = sel.length === 0 ? 'mixed' : ups === sel.length ? 'broadly firmer' : ups === 0 ? 'softer' : 'mixed';
  const byMove = [...sel].sort((a, b) => data[b].periodPct - data[a].periodPct);
  const top = byMove[0], bottom = byMove[byMove.length - 1];
  let s = '';
  if (top) s += `${META[top].name} ${data[top].periodPct >= 0 ? 'led' : 'fell least in'} a ${tone} ${pnoun}`;
  if (bottom && bottom !== top) s += `, while ${META[bottom].name.toLowerCase()} ${data[bottom].periodPct >= 0 ? 'lagged' : 'slipped'}`;
  if (rNow != null) {
    const dir = (rPast != null) ? (rNow < rPast - 0.2 ? 'compressed' : rNow > rPast + 0.2 ? 'widened' : 'held') : 'stood';
    s += `. The gold-to-silver ratio ${dir} to ${rNow.toFixed(1)}`;
  }
  return s + '.';
}

// "where it stands" bullets
function standsBullets() {
  const out = [];
  if (data.gold && SEL.includes('gold')) {
    const d = (data.gold.recordHigh - data.gold.price) / data.gold.recordHigh * 100;
    out.push(d < 0.5 ? 'Gold is trading at or near a record high.' : `Gold sits about ${d.toFixed(d < 10 ? 1 : 0)}% below its record high.`);
  }
  if (leader && data[leader].yrPct != null) out.push(`${META[leader].name} is the 12-month leader, ${data[leader].yrPct >= 0 ? 'up' : 'down'} ~${Math.abs(data[leader].yrPct).toFixed(0)}%.`);
  if (laggard && laggard !== leader && data[laggard].yrPct != null) out.push(`${META[laggard].name} is the laggard, ${data[laggard].yrPct >= 0 ? 'up' : 'down'} ~${Math.abs(data[laggard].yrPct).toFixed(0)}% on the year.`);
  if (rNow != null && rAvg != null) out.push(`The gold-to-silver ratio (${rNow.toFixed(1)}) is ${rNow < rAvg ? 'below' : 'above'} its long-run average (~${rAvg.toFixed(0)}).`);
  return out;
}

// date range label
function dateRange() {
  const end = new Date(refDate); const start = new Date(refDate); start.setDate(start.getDate() - periodDays);
  const opt = { day: 'numeric', month: 'short' };
  if (PERIOD === 'daily') return end.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  return `${start.toLocaleDateString('en-GB', opt)} – ${end.toLocaleDateString('en-GB', { ...opt, year: 'numeric' })}`;
}

const SITE = 'https://preciousmetalscharts.com';
const LIVE = 'https://live.preciousmetalscharts.com';

function rowsHTML() {
  return SEL.filter((m) => data[m]).map((m, i, arr) => {
    const d = data[m], c = col(d.periodPct);
    const border = i < arr.length - 1 ? 'border-bottom:1px solid #F1F1ED;' : '';
    return `<tr style="${border}"><td style="padding:11px 0;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${META[m].color};margin-right:8px;"></span>${META[m].name} <span style="font-family:ui-monospace,Menlo,monospace;color:#9AA0A6;font-size:11px;">${META[m].sym}</span></td><td style="text-align:right;font-family:ui-monospace,Menlo,monospace;">${fmtP(d.price)}</td><td style="text-align:right;font-family:ui-monospace,Menlo,monospace;color:${c};width:80px;">${arrow(d.periodPct)}${fmtPct(d.periodPct)}</td></tr>`;
  }).join('');
}

const ratioCard = (rNow == null) ? '' : `<div style="margin:0 20px 14px;background:#FAFAF8;border:1px solid #EEEEEA;border-radius:10px;padding:12px 14px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9AA0A6;">Gold-to-silver ratio</div><div style="font-family:ui-monospace,Menlo,monospace;font-size:20px;font-weight:600;margin:2px 0 4px;">${rNow.toFixed(1)}</div><div style="font-size:12.5px;color:#6B7177;line-height:1.5;">${rPast != null ? `${rNow < rPast ? 'Down' : rNow > rPast ? 'Up' : 'Flat'} from ${rPast.toFixed(1)} a ${PERIOD === 'monthly' ? 'month' : PERIOD === 'daily' ? 'day' : 'week'} ago — ` : ''}${rAvg != null ? `${rNow < rAvg ? 'below' : 'above'} its long-run average of ~${rAvg.toFixed(0)}, where silver is historically ${rNow < rAvg ? 'less' : 'more'} "cheap" versus gold.` : 'the ounces of silver it takes to buy one ounce of gold.'}</div></div>`;

const bullets = standsBullets();
const standsHTML = bullets.length ? `<div style="padding:0 20px 14px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9AA0A6;margin-bottom:6px;">Where it stands</div><ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.7;color:#2A2D33;">${bullets.map((b) => `<li>${b}</li>`).join('')}</ul></div>` : '';

const selNames = SEL.filter((m) => META[m]).map((m) => META[m].name).join(', ');

const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${PWORD[PERIOD]} Metals Recap — preciousmetalscharts</title></head>
<body style="margin:0;background:#ECEBE6;padding:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#17191E;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E6E2;border-radius:12px;overflow:hidden;">
    <div style="padding:18px 20px 14px;border-bottom:1px solid #EEEEEA;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:14px;font-weight:600;">preciousmetals<span style="color:#9A7322;">charts</span></span>
        <span style="margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#9A7322;border:1px solid #E7DBBE;background:#F6EFDD;border-radius:5px;padding:2px 7px;">${PWORD[PERIOD]} recap</span>
      </div>
      <div style="font-size:18px;font-weight:600;margin-top:12px;letter-spacing:-.01em;">This ${PERIOD === 'daily' ? 'day' : PERIOD === 'monthly' ? 'month' : 'week'} in metals</div>
      <div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#6B7177;margin-top:2px;">${dateRange()} · spot, ~10 min delayed</div>
    </div>
    <div style="padding:14px 20px;border-bottom:1px solid #EEEEEA;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9AA0A6;margin-bottom:5px;">The ${PERIOD === 'daily' ? 'day' : PERIOD === 'monthly' ? 'month' : 'week'} in one line</div>
      <div style="font-size:14px;line-height:1.55;">${narrative()}</div>
    </div>
    <div style="padding:6px 20px 10px;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${rowsHTML()}</tbody></table></div>
    ${ratioCard}
    ${standsHTML}
    <div style="padding:13px 20px;background:#FAFAF8;border-top:1px solid #EEEEEA;font-size:12px;color:#6B7177;">
      <div style="margin-bottom:6px;"><b style="color:#17191E;">Your newsletter:</b> ${PWORD[PERIOD]} · ${selNames}</div>
      <div><a href="{{PREFS_URL}}" style="color:#9A7322;text-decoration:none;">Change frequency or metals</a> · <a href="${LIVE}/" style="color:#9A7322;text-decoration:none;">Live prices</a> · <a href="{{UNSUB_URL}}" style="color:#6B7177;text-decoration:none;">Unsubscribe</a></div>
      <div style="margin-top:9px;font-size:11px;color:#9AA0A6;line-height:1.5;">Independent — not a dealer. Figures are spot, ~10 minutes delayed, from our own price archive. Educational information only, not investment advice.</div>
    </div>
  </div>
</body></html>`;

// plain-text version
const text = [
  `${PWORD[PERIOD]} metals recap — ${dateRange()}`,
  '',
  narrative(),
  '',
  ...SEL.filter((m) => data[m]).map((m) => `${META[m].name} (${META[m].sym}): ${fmtP(data[m].price)}  ${arrow(data[m].periodPct)}${fmtPct(data[m].periodPct)}`),
  rNow != null ? `\nGold-to-silver ratio: ${rNow.toFixed(1)}` : '',
  bullets.length ? '\nWhere it stands:\n' + bullets.map((b) => `- ${b}`).join('\n') : '',
  '',
  'Independent — not a dealer. Spot, ~10 min delayed. Educational only, not investment advice.',
  'Change preferences: {{PREFS_URL}}   Unsubscribe: {{UNSUB_URL}}',
].join('\n');

if (process.env.OUT) await writeFile(process.env.OUT, html);
if (process.env.TEXT) await writeFile(process.env.TEXT, text);
if (!process.env.OUT) process.stdout.write(html);
console.error(`OK ${PWORD[PERIOD]} edition · ${SEL.join(',')} · ratio ${rNow ? rNow.toFixed(1) : 'n/a'} · ${bullets.length} context lines`);
