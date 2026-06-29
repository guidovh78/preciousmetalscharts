// build-newsletter.mjs — compose a data-driven metals newsletter edition.
// ---------------------------------------------------------------------------
// Reads the static price snapshot + history archive (the same files the site
// serves) and produces a factual recap whose DEPTH is tailored to the cadence:
//   • daily   → fast, scannable: what moved since yesterday. Minimal noise.
//   • weekly  → the week per metal + ratio + where prices stand (flagship).
//   • monthly → big picture: month vs YTD/1Y/5Y, ratio percentile, macro backdrop.
// NO predictions, NO advice — only real numbers from our own data (+ public-domain
// FRED macro for the monthly edition, used as context).
//
//   import { buildEdition } from './build-newsletter.mjs'
//   const { subject, html, text } = await buildEdition({ dataDir:'./public', period:'weekly', metals:['gold','silver'] })
//
// CLI (writes HTML to OUT or stdout):
//   DATA_DIR=./public PERIOD=monthly METALS=gold,silver node build-newsletter.mjs > edition.html
// ---------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';

const META = {
  gold: { name: 'Gold', sym: 'XAU', color: '#C19A2E' },
  silver: { name: 'Silver', sym: 'XAG', color: '#8C9298' },
  platinum: { name: 'Platinum', sym: 'XPT', color: '#9FB1BB' },
  palladium: { name: 'Palladium', sym: 'XPD', color: '#B8997A' },
};
const ALL = ['gold', 'silver', 'platinum', 'palladium'];
const DAYS = { daily: 1, weekly: 7, monthly: 30 };
const PNOUN = { daily: 'day', weekly: 'week', monthly: 'month' };
const PWORD = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const SITE = 'https://preciousmetalscharts.com';
const LIVE = 'https://live.preciousmetalscharts.com';

async function tryJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }
async function tryCSV(p) {
  try {
    const raw = await readFile(p, 'utf8'); const out = [];
    for (const line of raw.split('\n').slice(1)) { const [d, v] = line.split(','); if (!d) continue; const n = Number(v); if (Number.isFinite(n)) out.push([d.trim(), n]); }
    return out;
  } catch { return null; }
}

export async function buildEdition({ dataDir, period = 'weekly', metals } = {}) {
  period = ['daily', 'weekly', 'monthly'].includes(period) ? period : 'weekly';
  const SEL = (Array.isArray(metals) && metals.length ? metals : ALL).filter((m) => ALL.includes(m));
  const periodDays = DAYS[period];
  const pword = PWORD[period];
  const pnoun = PNOUN[period];

  const snap = await tryJSON(`${dataDir}/prices.json`);
  if (!snap || !snap.metals) throw new Error('no prices.json in ' + dataDir);
  const refDate = new Date(snap.updatedAt && !isNaN(Date.parse(snap.updatedAt)) ? snap.updatedAt : Date.now());

  const hist = {};
  for (const m of ALL) {
    hist[m] = {
      daily: (await tryJSON(`${dataDir}/history/${m}-1y.json`))?.points || null,
      monthly: (await tryJSON(`${dataDir}/history/${m}-50y.json`))?.points || null,
    };
  }
  // macro is only consulted for the monthly edition; absent files degrade gracefully
  const macro = period === 'monthly' ? {
    dxy: await tryCSV(`${dataDir}/macro/DTWEXBGS.csv`),
    real10: await tryCSV(`${dataDir}/macro/DFII10.csv`),
    cpi: await tryCSV(`${dataDir}/macro/CPIAUCSL.csv`),
  } : {};

  // ---- helpers ----
  const isoDaysAgo = (n) => { const d = new Date(refDate); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const atOrBefore = (pts, iso) => { if (!pts || !pts.length) return null; let v = pts[0][1]; for (const p of pts) { if (p[0] <= iso) v = p[1]; else break; } return v; };
  const atOrAfter = (pts, iso) => { if (!pts) return null; for (const p of pts) if (p[0] >= iso) return p[1]; return null; };
  const pct = (now, then) => (now != null && then) ? (now - then) / then * 100 : null;
  const fmtP = (n) => n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (n, dp = 1) => n == null ? '—' : (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(dp) + '%';
  const arrow = (n) => n == null ? '' : (n >= 0 ? '▲ ' : '▼ ');
  const col = (n) => n == null ? '#6B7177' : (n >= 0 ? '#1A7F5A' : '#C2453A');

  // ---- per-metal data (compute everything once) ----
  const yearStart = refDate.getUTCFullYear() + '-01-01';
  const data = {};
  for (const m of ALL) {
    const price = snap.metals[m]?.price; if (price == null) continue;
    const dy = hist[m].daily, mo = hist[m].monthly;
    const recordHigh = Math.max(price, ...(mo || []).map((p) => p[1]), ...(dy || []).map((p) => p[1]));
    const dvals = (dy || []).map((p) => p[1]);
    const hi52 = dvals.length ? Math.max(...dvals, price) : null, lo52 = dvals.length ? Math.min(...dvals, price) : null;
    const periodAgo = atOrBefore(dy, isoDaysAgo(periodDays));
    data[m] = {
      price,
      day: snap.metals[m].changePct ?? null,
      week: pct(price, atOrBefore(dy, isoDaysAgo(7))),
      month: pct(price, atOrBefore(dy, isoDaysAgo(30))),
      ytd: pct(price, atOrAfter(dy, yearStart)),
      yr: pct(price, (dy && dy.length) ? dy[0][1] : atOrBefore(mo, isoDaysAgo(365))),
      y5: pct(price, atOrBefore(mo, isoDaysAgo(365 * 5))),
      recordHigh, fromAth: pct(price, recordHigh),
      hi52, lo52,
      periodAgo,
      periodPct: period === 'daily' ? (snap.metals[m].changePct ?? pct(price, periodAgo)) : pct(price, periodAgo),
    };
  }

  // ---- gold/silver ratio ----
  const rNow = (data.gold && data.silver) ? data.gold.price / data.silver.price : null;
  const rPast = (data.gold?.periodAgo && data.silver?.periodAgo) ? data.gold.periodAgo / data.silver.periodAgo : null;
  let rAvg = null, rMin = null, rMax = null, rPctile = null;
  if (hist.gold.monthly && hist.silver.monthly) {
    const sm = new Map(hist.silver.monthly.map((p) => [p[0], p[1]])); const series = [];
    for (const [d, gp] of hist.gold.monthly) { const sp = sm.get(d); if (sp) series.push(gp / sp); }
    if (series.length) { rAvg = series.reduce((a, b) => a + b, 0) / series.length; rMin = Math.min(...series); rMax = Math.max(...series); if (rNow != null) rPctile = Math.round(series.filter((x) => x <= rNow).length / series.length * 100); }
  }

  const ranked = SEL.filter((m) => data[m]?.yr != null).sort((a, b) => data[b].yr - data[a].yr);
  const leader = ranked[0], laggard = ranked[ranked.length - 1];
  const sel = SEL.filter((m) => data[m]?.periodPct != null);
  const ups = sel.filter((m) => data[m].periodPct >= 0).length;
  const tone = sel.length === 0 ? 'mixed' : ups === sel.length ? 'broadly firmer' : ups === 0 ? 'softer' : 'mixed';
  const byMove = [...sel].sort((a, b) => data[b].periodPct - data[a].periodPct);
  const top = byMove[0], bottom = byMove[byMove.length - 1];

  // ---- narrative (shared) ----
  let narrative = '';
  if (top) narrative += `${META[top].name} ${data[top].periodPct >= 0 ? 'led' : 'fell least in'} a ${tone} ${pnoun}`;
  if (bottom && bottom !== top) narrative += `, while ${META[bottom].name.toLowerCase()} ${data[bottom].periodPct >= 0 ? 'lagged' : 'slipped'}`;
  if (rNow != null) { const dir = (rPast != null) ? (rNow < rPast - 0.2 ? 'compressed' : rNow > rPast + 0.2 ? 'widened' : 'held') : 'stood'; narrative += `. The gold-to-silver ratio ${dir} to ${rNow.toFixed(1)}`; }
  narrative += '.';

  // ---- dates ----
  const end = new Date(refDate); const start = new Date(refDate); start.setDate(start.getDate() - periodDays);
  const opt = { day: 'numeric', month: 'short' };
  const dateRange = period === 'daily'
    ? end.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
    : period === 'monthly'
      ? end.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : `${start.toLocaleDateString('en-GB', opt)} – ${end.toLocaleDateString('en-GB', { ...opt, year: 'numeric' })}`;

  // ---- shared partials ----
  const mono = 'font-family:ui-monospace,Menlo,monospace;';
  const dot = (m) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${META[m].color};margin-right:8px;"></span>`;
  const label = (t) => `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9AA0A6;margin-bottom:6px;">${t}</div>`;

  const priceRows = (changeKey, changeLabel) => SEL.filter((m) => data[m]).map((m, i, arr) => {
    const d = data[m], v = d[changeKey], border = i < arr.length - 1 ? 'border-bottom:1px solid #F1F1ED;' : '';
    return `<tr style="${border}"><td style="padding:11px 0;">${dot(m)}${META[m].name} <span style="${mono}color:#9AA0A6;font-size:11px;">${META[m].sym}</span></td><td style="text-align:right;${mono}">${fmtP(d.price)}</td><td style="text-align:right;${mono}color:${col(v)};width:84px;">${arrow(v)}${fmtPct(v)}</td></tr>`;
  }).join('');

  const ratioCard = (rNow == null) ? '' : `<div style="margin:0 20px 14px;background:#FAFAF8;border:1px solid #EEEEEA;border-radius:10px;padding:12px 14px;">${label('Gold-to-silver ratio')}<div style="${mono}font-size:20px;font-weight:600;margin:2px 0 4px;">${rNow.toFixed(1)}</div><div style="font-size:12.5px;color:#6B7177;line-height:1.5;">${rPast != null ? `${rNow < rPast ? 'Down' : rNow > rPast ? 'Up' : 'Flat'} from ${rPast.toFixed(1)} a ${pnoun} ago — ` : ''}${period === 'monthly' && rPctile != null ? `${rPctile}th percentile of the last 50 years (range ${rMin.toFixed(0)}–${rMax.toFixed(0)}). ` : ''}${rAvg != null ? `${rNow < rAvg ? 'Below' : 'Above'} its long-run average of ~${rAvg.toFixed(0)}, where silver is historically ${rNow < rAvg ? 'less' : 'more'} "cheap" versus gold.` : ''}</div></div>`;

  // ---- "where it stands" bullets (weekly + monthly) ----
  const bullets = [];
  if (data.gold && SEL.includes('gold')) { const dd = -data.gold.fromAth; bullets.push(dd < 0.5 ? 'Gold is trading at or near a record high.' : `Gold sits about ${dd < 10 ? dd.toFixed(1) : Math.round(dd)}% below its record high.`); }
  if (leader && data[leader].yr != null) bullets.push(`${META[leader].name} is the 12-month leader, ${data[leader].yr >= 0 ? 'up' : 'down'} ~${Math.abs(data[leader].yr).toFixed(0)}%.`);
  if (laggard && laggard !== leader && data[laggard].yr != null) bullets.push(`${META[laggard].name} is the laggard, ${data[laggard].yr >= 0 ? 'up' : 'down'} ~${Math.abs(data[laggard].yr).toFixed(0)}% on the year.`);
  if (rNow != null && rPctile != null && period === 'monthly') bullets.push(`The gold-to-silver ratio sits in the ${rPctile}th percentile of its 50-year history${rPctile >= 75 ? ' — historically a level at which silver has looked cheap versus gold' : rPctile <= 25 ? ' — historically a level at which silver has looked rich versus gold' : ''}.`);
  else if (rNow != null && rAvg != null) bullets.push(`The gold-to-silver ratio (${rNow.toFixed(1)}) is ${rNow < rAvg ? 'below' : 'above'} its long-run average (~${rAvg.toFixed(0)}).`);
  const standsHTML = (b) => b.length ? `<div style="padding:0 20px 14px;">${label('Where it stands')}<ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.7;color:#2A2D33;">${b.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : '';

  // ---- monthly extras: zoom-out multi-timeframe + macro ----
  const zoomRows = SEL.filter((m) => data[m]).map((m) => {
    const d = data[m];
    const cell = (v) => `<span style="${mono}color:${col(v)};">${fmtPct(v, 0)}</span>`;
    return `<tr><td style="padding:7px 0;font-size:13px;">${dot(m)}${META[m].name}</td><td style="text-align:right;font-size:12.5px;">YTD ${cell(d.ytd)}</td><td style="text-align:right;font-size:12.5px;">1Y ${cell(d.yr)}</td><td style="text-align:right;font-size:12.5px;">5Y ${cell(d.y5)}</td></tr>`;
  }).join('');
  const zoomHTML = (period === 'monthly') ? `<div style="padding:4px 20px 12px;">${label('Zoom out')}<table style="width:100%;border-collapse:collapse;">${zoomRows}</table></div>` : '';

  const mLatest = (s) => (s && s.length) ? s[s.length - 1][1] : null;
  const mWeekAgo = (s) => atOrBefore(s, isoDaysAgo(7));
  let macroHTML = '';
  if (period === 'monthly') {
    const bits = [];
    const dxy = mLatest(macro.dxy);
    if (dxy != null) { const ch = pct(dxy, mWeekAgo(macro.dxy)); bits.push(`<tr><td style="padding:6px 0;font-size:13px;color:#2A2D33;">US dollar index (broad)</td><td style="text-align:right;${mono}">${dxy.toFixed(1)}${ch != null ? ` <span style="color:${col(ch)};font-size:12px;">${fmtPct(ch)}</span>` : ''}</td></tr>`); }
    const real = mLatest(macro.real10);
    if (real != null) bits.push(`<tr><td style="padding:6px 0;font-size:13px;color:#2A2D33;">10-yr real yield</td><td style="text-align:right;${mono}">${real.toFixed(2)}%</td></tr>`);
    if (macro.cpi && macro.cpi.length) { const cy = pct(mLatest(macro.cpi), atOrBefore(macro.cpi, isoDaysAgo(365))); if (cy != null) bits.push(`<tr><td style="padding:6px 0;font-size:13px;color:#2A2D33;">Inflation (CPI, YoY)</td><td style="text-align:right;${mono}">${cy.toFixed(1)}%</td></tr>`); }
    if (bits.length) macroHTML = `<div style="padding:4px 20px 14px;">${label('Macro backdrop')}<table style="width:100%;border-collapse:collapse;">${bits.join('')}</table><div style="font-size:11px;color:#9AA0A6;line-height:1.5;margin-top:7px;">The long-run forces behind metals (gold tends to move inversely to the dollar and real yields). Context, not a forecast. Source: U.S. Federal Reserve (FRED), public domain.</div></div>`;
  }

  // ---- daily extra: notable-only block ----
  let notableHTML = '';
  if (period === 'daily') {
    const n = [];
    for (const m of SEL) { if (data[m] && data[m].fromAth > -0.5) n.push(`${META[m].name} is at or near a record high.`); }
    if (top && data[top] && Math.abs(data[top].periodPct ?? 0) >= 1.5) n.push(`${META[top].name} was the biggest mover, ${arrow(data[top].periodPct)}${fmtPct(data[top].periodPct)}.`);
    if (n.length) notableHTML = `<div style="padding:0 20px 14px;">${label('Notable today')}<ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.7;color:#2A2D33;">${n.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
  }

  // ---- assemble body per cadence ----
  const headline = period === 'daily' ? 'Today in metals' : period === 'monthly' ? 'This month in metals' : 'This week in metals';
  const oneLineLabel = period === 'daily' ? 'Today in one line' : `The ${pnoun} in one line`;
  const changeLabel = period === 'daily' ? 'today' : `${pnoun}`;

  let body = '';
  if (period === 'daily') {
    // compact: one-liner → table → ratio → notable (only if any)
    body = `<div style="padding:14px 20px;border-bottom:1px solid #EEEEEA;">${label(oneLineLabel)}<div style="font-size:14px;line-height:1.55;">${narrative}</div></div>
      <div style="padding:6px 20px 4px;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${priceRows('day')}</tbody></table></div>
      ${ratioCard}${notableHTML}`;
  } else if (period === 'monthly') {
    // big picture: one-liner → table (month) → zoom-out → ratio (with percentile) → macro → where it stands
    body = `<div style="padding:14px 20px;border-bottom:1px solid #EEEEEA;">${label(oneLineLabel)}<div style="font-size:14px;line-height:1.55;">${narrative}</div></div>
      <div style="padding:6px 20px 6px;">${label('This month')}<table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${priceRows('month')}</tbody></table></div>
      ${zoomHTML}${ratioCard}${macroHTML}${standsHTML(bullets)}`;
  } else {
    // weekly flagship: one-liner → table (week) → ratio → where it stands
    body = `<div style="padding:14px 20px;border-bottom:1px solid #EEEEEA;">${label(oneLineLabel)}<div style="font-size:14px;line-height:1.55;">${narrative}</div></div>
      <div style="padding:6px 20px 10px;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${priceRows('week')}</tbody></table></div>
      ${ratioCard}${standsHTML(bullets)}`;
  }

  const selNames = SEL.filter((m) => META[m]).map((m) => META[m].name).join(', ');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${pword} Metals Recap</title></head>
<body style="margin:0;background:#ECEBE6;padding:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#17191E;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E6E2;border-radius:12px;overflow:hidden;">
    <div style="padding:18px 20px 14px;border-bottom:1px solid #EEEEEA;"><div style="display:flex;align-items:center;gap:8px;"><span style="font-size:14px;font-weight:600;">preciousmetals<span style="color:#9A7322;">charts</span></span><span style="margin-left:auto;${mono}font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#9A7322;border:1px solid #E7DBBE;background:#F6EFDD;border-radius:5px;padding:2px 7px;">${pword} recap</span></div>
      <div style="font-size:18px;font-weight:600;margin-top:12px;letter-spacing:-.01em;">${headline}</div>
      <div style="${mono}font-size:12px;color:#6B7177;margin-top:2px;">${dateRange} · spot, ~10 min delayed</div></div>
    ${body}
    <div style="padding:13px 20px;background:#FAFAF8;border-top:1px solid #EEEEEA;font-size:12px;color:#6B7177;"><div style="margin-bottom:6px;"><b style="color:#17191E;">Your newsletter:</b> ${pword} · ${selNames}</div><div><a href="{{PREFS_URL}}" style="color:#9A7322;text-decoration:none;">Change frequency or metals</a> · <a href="${LIVE}/" style="color:#9A7322;text-decoration:none;">Live prices</a> · <a href="{{UNSUB_URL}}" style="color:#6B7177;text-decoration:none;">Unsubscribe</a></div><div style="margin-top:9px;font-size:11px;color:#9AA0A6;line-height:1.5;">Independent — not a dealer. Figures are spot, ~10 minutes delayed, from our own price archive${period === 'monthly' ? '; macro data from the U.S. Federal Reserve (FRED), public domain' : ''}. Educational information only, not investment advice.</div></div>
  </div>
</body></html>`;

  // ---- plain-text version (cadence-aware) ----
  const changeKey = period === 'daily' ? 'day' : period === 'monthly' ? 'month' : 'week';
  const lines = [
    `${pword} metals recap — ${dateRange}`, '', narrative, '',
    ...SEL.filter((m) => data[m]).map((m) => `${META[m].name} (${META[m].sym}): ${fmtP(data[m].price)}  ${arrow(data[m][changeKey])}${fmtPct(data[m][changeKey])}`),
  ];
  if (period === 'monthly') {
    lines.push('', 'Zoom out (YTD / 1Y / 5Y):', ...SEL.filter((m) => data[m]).map((m) => `- ${META[m].name}: ${fmtPct(data[m].ytd, 0)} / ${fmtPct(data[m].yr, 0)} / ${fmtPct(data[m].y5, 0)}`));
  }
  if (rNow != null) lines.push('', `Gold-to-silver ratio: ${rNow.toFixed(1)}${period === 'monthly' && rPctile != null ? ` (${rPctile}th percentile, 50y)` : ''}`);
  if (period === 'monthly' && macroHTML) {
    const dxy = mLatest(macro.dxy), real = mLatest(macro.real10);
    const cy = (macro.cpi && macro.cpi.length) ? pct(mLatest(macro.cpi), atOrBefore(macro.cpi, isoDaysAgo(365))) : null;
    lines.push('', 'Macro backdrop (context, not advice):', ...[dxy != null ? `- US dollar index (broad): ${dxy.toFixed(1)}` : '', real != null ? `- 10-yr real yield: ${real.toFixed(2)}%` : '', cy != null ? `- Inflation (CPI, YoY): ${cy.toFixed(1)}%` : ''].filter(Boolean));
  }
  if ((period === 'weekly' || period === 'monthly') && bullets.length) lines.push('', 'Where it stands:', ...bullets.map((b) => `- ${b}`));
  lines.push('', 'Independent — not a dealer. Spot, ~10 min delayed. Educational only, not investment advice.', 'Change preferences: {{PREFS_URL}}   Unsubscribe: {{UNSUB_URL}}');
  const text = lines.join('\n');

  const subject = period === 'daily' ? `Metals today — ${dateRange}` : period === 'monthly' ? `Metals this month — ${dateRange}` : `Metals this week — ${dateRange}`;
  return { subject, html, text };
}

// ---- CLI ------------------------------------------------------------------
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const ed = await buildEdition({
    dataDir: process.env.DATA_DIR || './public',
    period: (process.env.PERIOD || 'weekly').toLowerCase(),
    metals: (process.env.METALS || 'gold,silver,platinum,palladium').split(',').map((s) => s.trim()).filter(Boolean),
  });
  if (process.env.OUT) await writeFile(process.env.OUT, ed.html);
  if (process.env.TEXT) await writeFile(process.env.TEXT, ed.text);
  if (!process.env.OUT) process.stdout.write(ed.html);
  console.error('OK · ' + ed.subject);
}
