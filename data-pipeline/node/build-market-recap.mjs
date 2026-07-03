// build-market-recap.mjs — generate an in-depth, server-rendered "Metals market recap".
// ---------------------------------------------------------------------------------------
// Reads our own snapshot + history archive (+ optional FRED macro CSVs) and writes a fully
// rendered, site-styled market-recap.html. All text/numbers are baked into the HTML (SEO/GEO).
// Only DISPLAYS our own data; FRED macro data is public domain. Factual only — "what to watch"
// is reference levels + historical tendencies, never advice or a price forecast.
//
//   DATA_DIR=./data OUT=market-recap.html node build-market-recap.mjs
// ---------------------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';

const DATA = process.env.DATA_DIR || './public';
const OUT = process.env.OUT || 'market-recap.html';
const PERIOD = (process.env.PERIOD || 'weekly').toLowerCase();
const SITE = 'https://preciousmetalscharts.com';
const LIVE = 'https://live.preciousmetalscharts.com';

const META = {
  gold: { name: 'Gold', sym: 'XAU', color: '#C19A2E' },
  silver: { name: 'Silver', sym: 'XAG', color: '#8C9298' },
  platinum: { name: 'Platinum', sym: 'XPT', color: '#9FB1BB' },
  palladium: { name: 'Palladium', sym: 'XPD', color: '#B8997A' },
};
const ALL = ['gold', 'silver', 'platinum', 'palladium'];
const periodDays = { daily: 1, weekly: 7, monthly: 30 }[PERIOD] || 7;
const pnoun = { daily: 'day', weekly: 'week', monthly: 'month' }[PERIOD] || 'week';

async function tryJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }
async function tryCSV(p) {
  try {
    const raw = await readFile(p, 'utf8');
    const out = [];
    for (const line of raw.split('\n').slice(1)) {
      const [d, v] = line.split(',');
      if (!d) continue; const n = Number(v);
      if (Number.isFinite(n)) out.push([d.trim(), n]);
    }
    return out;
  } catch { return null; }
}

const snap = await tryJSON(`${DATA}/prices.json`);
if (!snap || !snap.metals) { console.error('No prices.json in ' + DATA); process.exit(1); }
const refDate = new Date(snap.updatedAt && !isNaN(Date.parse(snap.updatedAt)) ? snap.updatedAt : Date.now());
const rates = (snap.fx && snap.fx.rates) || { USD: 1 };

const hist = {};
for (const m of ALL) {
  hist[m] = {
    daily: (await tryJSON(`${DATA}/history/${m}-1y.json`))?.points || null,
    monthly: (await tryJSON(`${DATA}/history/${m}-50y.json`))?.points || null,
  };
}
const macro = {
  dxy: await tryCSV(`${DATA}/macro/DTWEXBGS.csv`),
  real10: await tryCSV(`${DATA}/macro/DFII10.csv`),
  cpi: await tryCSV(`${DATA}/macro/CPIAUCSL.csv`),
  nom10: await tryCSV(`${DATA}/macro/DGS10.csv`),
};

const isoDaysAgo = (n) => { const d = new Date(refDate); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const atOrBefore = (pts, iso) => { if (!pts || !pts.length) return null; let v = pts[0][1]; for (const p of pts) { if (p[0] <= iso) v = p[1]; else break; } return v; };
const atOrAfter = (pts, iso) => { if (!pts) return null; for (const p of pts) if (p[0] >= iso) return p[1]; return null; };
const lastVal = (pts) => (pts && pts.length) ? pts[pts.length - 1][1] : null;
const pct = (now, then) => (now != null && then) ? (now - then) / then * 100 : null;

const fmtP = (v) => v == null ? '—' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCur = (v, code) => { if (v == null) return '—'; try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, maximumFractionDigits: code === 'JPY' ? 0 : 2 }).format(v); } catch { return v.toFixed(2); } };
const sp = (n, dp = 1) => n == null ? '—' : (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(dp) + '%';
const arr = (n) => n == null ? '' : (n >= 0 ? '▲ ' : '▼ ');
const cc = (n) => n == null ? '' : (n >= 0 ? 'up' : 'down');

function downsample(pts, n) { if (!pts || pts.length <= n) return pts || []; const out = [], step = (pts.length - 1) / (n - 1); for (let i = 0; i < n; i++) out.push(pts[Math.round(i * step)]); return out; }
function spark(pts, color) {
  const d0 = downsample(pts, 56); if (!d0 || d0.length < 2) return '';
  const v = d0.map((p) => p[1]), mn = Math.min(...v), mx = Math.max(...v), rg = (mx - mn) || 1, w = 150, h = 38, pad = 3, n = v.length;
  let path = '';
  for (let i = 0; i < n; i++) { const x = (pad + i / (n - 1) * (w - 2 * pad)).toFixed(1), y = (h - pad - (v[i] - mn) / rg * (h - 2 * pad)).toFixed(1); path += (i ? ' L' : 'M') + x + ' ' + y; }
  const up = v[n - 1] >= v[0];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
}

// ---- per-metal data ----
const yearStart = refDate.getUTCFullYear() + '-01-01';
const d = {};
for (const m of ALL) {
  const price = snap.metals[m]?.price; if (price == null) continue;
  const dy = hist[m].daily, mo = hist[m].monthly;
  const all = [...(mo || []), ...(dy || [])];
  const ath = Math.max(price, ...all.map((p) => p[1]));
  const yr = dy && dy.length ? dy[0][1] : atOrBefore(mo, isoDaysAgo(365));
  const dvals = (dy || []).map((p) => p[1]);
  const hi52 = dvals.length ? Math.max(...dvals, price) : null, lo52 = dvals.length ? Math.min(...dvals, price) : null;
  const last7 = (dy || []).slice(-7).map((p) => p[1]); if (last7.length) last7.push(price);
  d[m] = {
    price,
    day: snap.metals[m].changePct ?? null,
    week: pct(price, atOrBefore(dy, isoDaysAgo(7))),
    month: pct(price, atOrBefore(dy, isoDaysAgo(30))),
    ytd: pct(price, atOrAfter(dy, yearStart)),
    yr: pct(price, yr),
    y5: pct(price, atOrBefore(mo, isoDaysAgo(365 * 5))),
    hi52, lo52, posIn52: (hi52 != null && hi52 > lo52) ? (price - lo52) / (hi52 - lo52) * 100 : null,
    ath, fromAth: pct(price, ath),
    wkHi: last7.length ? Math.max(...last7) : null, wkLo: last7.length ? Math.min(...last7) : null,
    spark: spark(dy, META[m].color),
    period: pct(price, atOrBefore(dy, isoDaysAgo(periodDays))),
  };
}

// ---- ratio (gold/silver) + percentile vs 50y ----
const rNow = (d.gold && d.silver) ? d.gold.price / d.silver.price : null;
const rPast = (atOrBefore(hist.gold.daily, isoDaysAgo(periodDays)) && atOrBefore(hist.silver.daily, isoDaysAgo(periodDays))) ? atOrBefore(hist.gold.daily, isoDaysAgo(periodDays)) / atOrBefore(hist.silver.daily, isoDaysAgo(periodDays)) : null;
let rAvg = null, rMin = null, rMax = null, rPctile = null;
if (hist.gold.monthly && hist.silver.monthly) {
  const sm = new Map(hist.silver.monthly.map((p) => [p[0], p[1]])); const series = [];
  for (const [dt, gp] of hist.gold.monthly) { const spv = sm.get(dt); if (spv) series.push(gp / spv); }
  if (series.length) { rAvg = series.reduce((a, b) => a + b, 0) / series.length; rMin = Math.min(...series); rMax = Math.max(...series); if (rNow != null) rPctile = Math.round(series.filter((x) => x <= rNow).length / series.length * 100); }
}
const gpRatio = (d.gold && d.platinum) ? d.gold.price / d.platinum.price : null;

// ---- leaders ----
const byYr = ALL.filter((m) => d[m]?.yr != null).sort((a, b) => d[b].yr - d[a].yr);
const leaderY = byYr[0], laggardY = byYr[byYr.length - 1];
const byWk = ALL.filter((m) => d[m]?.period != null).sort((a, b) => d[b].period - d[a].period);
const topW = byWk[0], botW = byWk[byWk.length - 1];

// ---- macro (FRED) ----
function macroPoint(series, code) {
  if (!series || !series.length) return null;
  const latest = lastVal(series), latestDate = series[series.length - 1][0];
  const wk = atOrBefore(series, isoDaysAgo(7));
  return { latest, wk, latestDate };
}
const mDxy = macroPoint(macro.dxy), mReal = macroPoint(macro.real10), mNom = macroPoint(macro.nom10);
let cpiYoY = null, cpiDate = null;
if (macro.cpi && macro.cpi.length) {
  // CPI publishes ~2 months behind. Base the YoY window on the LATEST CPI row's
  // own date minus 12 months — anchoring on today-minus-365 quietly produced a
  // ~10-month change mislabelled as "YoY".
  const latest = lastVal(macro.cpi); cpiDate = macro.cpi[macro.cpi.length - 1][0];
  const base = new Date(cpiDate + 'T00:00:00Z'); base.setUTCFullYear(base.getUTCFullYear() - 1);
  const yrAgo = atOrBefore(macro.cpi, base.toISOString().slice(0, 10));
  cpiYoY = pct(latest, yrAgo);
}

// ---- narrative ----
const sel = ALL.filter((m) => d[m]?.period != null);
const ups = sel.filter((m) => d[m].period >= 0).length;
const tone = sel.length === 0 ? 'mixed' : ups === sel.length ? 'broadly firmer' : ups === 0 ? 'softer' : 'mixed';
let narrative = '';
if (topW) narrative += `${META[topW].name} ${d[topW].period >= 0 ? 'led' : 'fell least in'} a ${tone} ${pnoun}`;
if (botW && botW !== topW) narrative += `, while ${META[botW].name.toLowerCase()} ${d[botW].period >= 0 ? 'lagged' : 'slipped'}`;
if (rNow != null) { const dir = rPast != null ? (rNow < rPast - 0.2 ? 'compressed' : rNow > rPast + 0.2 ? 'widened' : 'held') : 'stood'; narrative += `. The gold-to-silver ratio ${dir} to ${rNow.toFixed(1)}`; }
narrative += '.';

const end = new Date(refDate), start = new Date(refDate); start.setDate(start.getDate() - periodDays);
const opt = { day: 'numeric', month: 'short' };
const dateRange = `${start.toLocaleDateString('en-GB', opt)} – ${end.toLocaleDateString('en-GB', { ...opt, year: 'numeric' })}`;
const longDate = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// ---- per-metal cards ----
const tf = (label, v) => `<span class="tf"><span class="k">${label}</span><span class="val ${cc(v)}">${sp(v)}</span></span>`;
const cards = ALL.filter((m) => d[m]).map((m) => {
  const x = d[m];
  const bar = (x.posIn52 != null) ? `<div class="r52"><div class="r52-track"><span class="r52-dot" style="left:${x.posIn52.toFixed(0)}%"></span></div><div class="r52-lab"><span>52-wk low ${fmtP(x.lo52)}</span><span>high ${fmtP(x.hi52)}</span></div></div>` : '';
  return `<article class="mcard">
    <div class="mc-top"><span class="mc-name"><span class="dot" style="background:${META[m].color}"></span>${META[m].name} <span class="sym">${META[m].sym}</span></span><span class="mc-price">${fmtP(x.price)}</span></div>
    <div class="mc-day ${cc(x.day)}">${arr(x.day)}${sp(x.day, 2)} <span class="mc-daylab">today</span></div>
    ${x.spark}
    <div class="tfrow">${tf('1W', x.week)}${tf('1M', x.month)}${tf('YTD', x.ytd)}${tf('1Y', x.yr)}${tf('5Y', x.y5)}</div>
    ${bar}
    <div class="mc-foot">${x.fromAth != null && x.fromAth > -0.5 ? 'At/near its record high.' : 'About ' + Math.abs(x.fromAth).toFixed(0) + '% below its record high.'} <a href="${SITE}/${m}-price">full chart →</a></div>
  </article>`;
}).join('');

// ---- currencies row (gold in other currencies) ----
const curRow = (d.gold && rates) ? ['EUR', 'GBP', 'JPY', 'CNY'].filter((c) => rates[c]).map((c) => `<span>${fmtCur(d.gold.price * rates[c], c)}</span>`).join('') : '';

// ---- "what to watch" (factual reference points) ----
const watch = [];
if (d.gold) watch.push(`<b>Gold:</b> record high near ${fmtP(d.gold.ath)} (about ${Math.abs(d.gold.fromAth).toFixed(0)}% away); 52-week range ${fmtP(d.gold.lo52)}–${fmtP(d.gold.hi52)}.`);
if (rNow != null && rMin != null) watch.push(`<b>Gold-to-silver ratio:</b> ${rNow.toFixed(1)} now${rPctile != null ? ` (${rPctile}th percentile of the last 50 years)` : ''}; historical range ${rMin.toFixed(0)}–${rMax.toFixed(0)}. Readings above ~80 have historically marked silver as cheap versus gold.`);
if (mDxy && mDxy.latest != null) watch.push(`<b>US dollar &amp; real yields:</b> gold has historically moved inversely to the dollar and to real interest rates — the broad dollar index and the 10-year real yield are the macro levels to watch (below).`);

// ---- notable ----
const notable = [];
if (topW && d[topW]) notable.push(`${META[topW].name} was the biggest mover this ${pnoun} (${arr(d[topW].period)}${sp(d[topW].period)}).`);
for (const m of ALL) { if (d[m] && d[m].hi52 != null && d[m].price >= d[m].hi52 - 1e-6) notable.push(`${META[m].name} is at a fresh 52-week high.`); }
if (d.gold && d.gold.fromAth > -0.5) notable.push('Gold is at or near an all-time high.');

// ---- macro section ----
let macroHTML = '';
const macroBits = [];
if (mDxy && mDxy.latest != null) macroBits.push(`<div class="mb"><div class="mb-k">US dollar index (broad)</div><div class="mb-v">${mDxy.latest.toFixed(1)} <small class="${cc(pct(mDxy.latest, mDxy.wk))}">${sp(pct(mDxy.latest, mDxy.wk))} wk</small></div><div class="mb-n">Gold has historically moved inversely to the dollar.</div></div>`);
if (mReal && mReal.latest != null) { const ch = (mReal.wk != null) ? (mReal.latest - mReal.wk) * 100 : null; macroBits.push(`<div class="mb"><div class="mb-k">10-yr real yield</div><div class="mb-v">${mReal.latest.toFixed(2)}% <small class="${ch == null ? '' : (ch <= 0 ? 'up' : 'down')}">${ch == null ? '' : (ch >= 0 ? '+' : '−') + Math.abs(ch).toFixed(0) + 'bp wk'}</small></div><div class="mb-n">Gold tends to move inversely to real yields.</div></div>`); }
if (cpiYoY != null) macroBits.push(`<div class="mb"><div class="mb-k">Inflation (CPI, YoY)</div><div class="mb-v">${cpiYoY.toFixed(1)}%</div><div class="mb-n">Gold is often discussed as an inflation hedge — see our <a href="${SITE}/purchasing-power-calculator">purchasing-power tool</a>.</div></div>`);
if (mNom && mNom.latest != null) macroBits.push(`<div class="mb"><div class="mb-k">10-yr Treasury yield</div><div class="mb-v">${mNom.latest.toFixed(2)}%</div><div class="mb-n">The nominal benchmark rate.</div></div>`);
if (macroBits.length) macroHTML = `<section class="sec"><div class="sec-head"><span class="sec-num">04</span><h2>Macro backdrop</h2></div><p class="sub" style="margin-top:0">The forces that historically drive metals. These are <b>historical tendencies, shown as context — not predictions or advice.</b></p><div class="mb-grid">${macroBits.join('')}</div><p class="faq-meta">Macro data: U.S. Federal Reserve (FRED), public domain. Relationships are long-run tendencies, not rules.</p></section>`;

const schema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: `Metals market recap — ${dateRange}`, description: narrative, datePublished: refDate.toISOString(), dateModified: refDate.toISOString(), author: { '@type': 'Organization', name: 'preciousmetalscharts', url: SITE + '/' }, publisher: { '@id': SITE + '/#org' }, isAccessibleForFree: true, inLanguage: 'en' });
const crumb = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Market recap', item: SITE + '/market-recap' }] });

const html = `<!DOCTYPE html>
<html lang="en" data-theme="light" data-currency="usd">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Metals Market Recap (${dateRange}) — Gold, Silver, Platinum, Palladium | preciousmetalscharts</title>
<meta name="description" content="${(narrative + ' Multi-timeframe performance, the gold-to-silver ratio, the macro backdrop and key levels to watch. Updated ' + longDate + '.').replace(/"/g, '&quot;')}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${SITE}/market-recap">
<meta name="author" content="preciousmetalscharts">
<meta property="og:type" content="article"><meta property="og:site_name" content="preciousmetalscharts">
<meta property="og:title" content="Metals market recap — ${dateRange}"><meta property="og:description" content="${narrative.replace(/"/g, '&quot;')}"><meta property="og:url" content="${SITE}/market-recap"><meta property="og:image" content="https://preciousmetalscharts.com/og-cover.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"${SITE}/#org","name":"preciousmetalscharts","url":"${SITE}/","logo":"${SITE}/logo.png"}]}</script>
<script type="application/ld+json">${schema}</script>
<script type="application/ld+json">${crumb}</script>
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/assets/site.css?v=11">
<style>
  .rc-updated{font-family:var(--font-mono);font-size:12px;color:var(--muted);}
  .rc-lead{font-size:16px;line-height:1.6;margin:6px 0 14px;}
  .mcards{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  @media(max-width:640px){.mcards{grid-template-columns:1fr;}}
  .mcard{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;}
  .mc-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}
  .mc-name{font-size:15px;font-weight:500;} .mc-name .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px;} .mc-name .sym{font-family:var(--font-mono);font-size:11px;color:var(--faint);}
  .mc-price{font-family:var(--font-mono);font-size:18px;font-weight:600;}
  .mc-day{font-family:var(--font-mono);font-size:12.5px;font-weight:600;margin-top:2px;} .mc-day.up{color:var(--up);} .mc-day.down{color:var(--down);} .mc-daylab{color:var(--muted);font-weight:400;}
  .spark{display:block;width:100%;height:38px;margin:8px 0 4px;}
  .tfrow{display:flex;flex-wrap:wrap;gap:6px 14px;margin:4px 0 8px;}
  .tf{display:flex;flex-direction:column;} .tf .k{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);} .tf .val{font-family:var(--font-mono);font-size:12.5px;font-weight:600;} .tf .val.up{color:var(--up);} .tf .val.down{color:var(--down);}
  .r52{margin:4px 0 8px;} .r52-track{position:relative;height:6px;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;} .r52-dot{position:absolute;top:-3px;width:10px;height:10px;border-radius:50%;background:var(--accent);transform:translateX(-50%);} .r52-lab{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10.5px;color:var(--faint);margin-top:4px;}
  .mc-foot{font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:8px;} .mc-foot a{color:var(--accent);text-decoration:none;}
  .meso{display:flex;flex-wrap:wrap;gap:14px;}
  .meso .card{flex:1;min-width:200px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:13px 15px;}
  .meso .k{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);} .meso .v{font-family:var(--font-mono);font-size:20px;font-weight:600;margin:3px 0;} .meso .n{font-size:12.5px;color:var(--muted);line-height:1.5;}
  .curline{font-family:var(--font-mono);font-size:13px;display:flex;gap:14px;flex-wrap:wrap;margin-top:4px;}
  .mb-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;} @media(max-width:560px){.mb-grid{grid-template-columns:1fr;}}
  .mb{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:12px 14px;} .mb-k{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);} .mb-v{font-family:var(--font-mono);font-size:19px;font-weight:600;margin:3px 0;} .mb-v small{font-size:12px;font-weight:500;} .mb-v .up{color:var(--up);} .mb-v .down{color:var(--down);} .mb-n{font-size:12px;color:var(--muted);line-height:1.5;} .mb-n a{color:var(--accent);text-decoration:none;}
  ul.watch{font-size:14px;line-height:1.75;padding-left:18px;margin:4px 0;} ul.watch li{margin:5px 0;}
</style>
</head>
<body>
<header class="topbar"><div class="wrap topbar-inner">
  <a class="logo" href="/" aria-label="preciousmetalscharts home"><svg class="logo-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="none" stroke="var(--line-strong)"/><path d="M8 22.5 L14 16 L18.5 19.5 L26 10" fill="none" stroke="var(--accent)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><rect x="23.4" y="7.4" width="5.2" height="5.2" rx="1.3" fill="var(--accent)"/><line x1="8" y1="26.4" x2="26" y2="26.4" stroke="var(--faint)" stroke-width="1.4" stroke-linecap="round" opacity=".55"/></svg><span class="wordmark"><span class="a">preciousmetals</span><span class="b">charts</span></span></a>
  <nav class="sitenav" aria-label="Primary"><a href="/">Charts</a><a href="/ratio">Ratio</a><a href="/market-recap" class="current" aria-current="page">Recap</a><a href="/calculators">Calculator</a><a href="/buy">Buy</a><a href="gold-ira.html" data-region-only="us">Gold&nbsp;IRA</a></nav>
  <div class="spacer"></div><div class="controls"><a class="livelink" href="${LIVE}/" title="Live prices"><span class="livedot"></span>Live</a><button class="iconbtn" id="themeBtn" aria-label="Toggle dark mode"><svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button></div>
</div></header>
<main class="wrap">
  <section class="hero">
    <div class="trustline"><span class="ttag">Independent</span><span>Not a dealer — we sell no metals</span><span class="sep"></span><span>Spot data · ~10 min delayed</span></div>
    <h1 class="lede">Metals market recap</h1>
    <div class="rc-updated">${dateRange} · spot, USD per troy oz · updated ${longDate}</div>
    <p class="rc-lead">${narrative}</p>
    <div class="related"><a href="${LIVE}/">Live prices</a><a href="/ratio">Ratio</a><a href="/calculators">Calculators</a><a href="/dca-calculator">DCA backtest</a></div>
  </section>

  <section class="sec">
    <div class="sec-head"><span class="sec-num">01</span><h2>The metals now</h2></div>
    <div class="mcards">${cards}</div>
  </section>

  <section class="sec">
    <div class="sec-head"><span class="sec-num">02</span><h2>The precious complex</h2></div>
    <div class="meso">
      ${rNow != null ? `<div class="card"><div class="k">Gold-to-silver ratio</div><div class="v">${rNow.toFixed(1)}</div><div class="n">${rPctile != null ? `${rPctile}th percentile of the last 50 years · ` : ''}${rAvg != null ? `long-run avg ~${rAvg.toFixed(0)}` : ''}${rMin != null ? ` (range ${rMin.toFixed(0)}–${rMax.toFixed(0)})` : ''}.</div></div>` : ''}
      ${gpRatio != null ? `<div class="card"><div class="k">Gold-to-platinum ratio</div><div class="v">${gpRatio.toFixed(2)}</div><div class="n">Ounces of platinum per ounce of gold.</div></div>` : ''}
      ${leaderY ? `<div class="card"><div class="k">12-month leader / laggard</div><div class="v" style="font-size:15px">${META[leaderY].name} ${sp(d[leaderY].yr, 0)} · ${META[laggardY].name} ${sp(d[laggardY].yr, 0)}</div><div class="n">Best and worst of the four over the past year.</div></div>` : ''}
    </div>
    ${curRow ? `<p class="sub" style="margin:12px 0 2px">Gold in other currencies</p><div class="curline">${curRow}</div>` : ''}
  </section>

  ${macroHTML}

  <section class="sec">
    <div class="sec-head"><span class="sec-num">05</span><h2>What to watch</h2></div>
    <p class="sub" style="margin-top:0">Reference levels and historical tendencies — <b>not predictions or advice.</b></p>
    <ul class="watch">${watch.map((w) => `<li>${w}</li>`).join('')}</ul>
  </section>

  ${notable.length ? `<section class="sec"><div class="sec-head"><span class="sec-num">06</span><h2>Notable this ${pnoun}</h2></div><ul class="watch">${notable.map((x) => `<li>${x}</li>`).join('')}</ul></section>` : ''}

  <section class="sec">
    <p class="faq-meta">Figures are spot, ~10 minutes delayed, from our own price archive (deep history from World Bank commodity data, CC BY 4.0); macro data from the U.S. Federal Reserve (FRED), public domain. Educational information only — not investment advice. Auto-generated ${longDate}.</p>
  </section>
</main>
<footer><div class="wrap foot">
  <div class="brandline"><svg class="logo-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="none" stroke="var(--line-strong)"/><path d="M8 22.5 L14 16 L18.5 19.5 L26 10" stroke="var(--accent)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><rect x="23.4" y="7.4" width="5.2" height="5.2" rx="1.3" fill="var(--accent)"/></svg><span class="wordmark"><span class="a">preciousmetals</span><span class="b">charts</span></span></div>
  <nav class="foot-links" aria-label="Site information"><a href="/about">About</a><a href="/methodology">Methodology</a><a href="/disclaimer">Disclaimer</a><a href="/affiliate-disclosure">Affiliate disclosure</a></nav>
  <div class="legal"><b>Independent and not affiliated with any dealer or mint.</b> Educational information only — not investment advice. Prices are live spot, ~10 minutes delayed; verify before transacting.</div>
</div></footer>
<script src="/assets/site.js?v=7" defer></script>
<script>(function(){var sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',moon='<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';var b=document.getElementById("themeBtn");if(b)b.addEventListener("click",function(){var c=document.documentElement.getAttribute("data-theme"),n=c==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",n);document.getElementById("themeIcon").innerHTML=n==="dark"?moon:sun;});})();</script>
</body></html>`;

await writeFile(OUT, html);
console.error(`OK recap → ${OUT} · ${dateRange} · ratio ${rNow ? rNow.toFixed(1) : 'n/a'} (pctile ${rPctile}) · macro[dxy=${mDxy?.latest ?? 'n/a'} real=${mReal?.latest ?? 'n/a'} cpi=${cpiYoY != null ? cpiYoY.toFixed(1) : 'n/a'}] · ${cards ? ALL.filter((m) => d[m]).length : 0} metals`);
