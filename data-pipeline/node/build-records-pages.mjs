// build-records-pages.mjs — the "records & valuation" cluster (content cluster 2).
// ---------------------------------------------------------------------------------------
// From our own gold archive (monthly averages 1960→mid-2016, daily closes after) + US CPI
// (FRED CPIAUCSL, public domain) this builds two citeable, self-updating pages + a dataset:
//
//   gold-all-time-high.html            — every record close, current drawdown gauge,
//                                        milestone first-crossings, major bear markets.
//   gold-price-inflation-adjusted.html — the real (today's-dollars) gold price since 1970,
//                                        SSR chart, era table, methodology.
//   gold-price-inflation-adjusted.csv  — downloadable monthly nominal + real series.
//
// Rebuilt daily by the market-recap Action. Factual only — data and history, no forecasts.
//
//   DATA_DIR=./data HIST_FILE=./public/history/gold.json OUT_DIR=. node build-records-pages.mjs
// ---------------------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';

const DATA = process.env.DATA_DIR || './data';
const HIST = process.env.HIST_FILE || './public/history/gold.json';
const OUT = process.env.OUT_DIR || '.';
const SITE = 'https://preciousmetalscharts.com';
const LIVE = 'https://live.preciousmetalscharts.com';

async function tryJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }

const snap = await tryJSON(`${DATA}/prices.json`);
const histRaw = await tryJSON(HIST);
const pts = (histRaw?.points || histRaw || []).filter((p) => Array.isArray(p) && p[1] > 0);
if (pts.length < 100) { console.error('gold archive missing/short: ' + HIST); process.exit(1); }

// CPI: FRED CSV "DATE,CPIAUCSL"
const cpi = new Map();
try {
  for (const line of (await readFile(`${DATA}/macro/CPIAUCSL.csv`, 'utf8')).split('\n').slice(1)) {
    const [d, v] = line.split(','); const n = Number(v);
    if (d && Number.isFinite(n)) cpi.set(d.trim().slice(0, 7), n);
  }
} catch { }
if (!cpi.size) { console.error('CPIAUCSL.csv missing'); process.exit(1); }
const cpiMonths = [...cpi.keys()].sort();
const cpiNowKey = cpiMonths[cpiMonths.length - 1];
const cpiNow = cpi.get(cpiNowKey);

const refDate = new Date(snap && !isNaN(Date.parse(snap.updatedAt)) ? snap.updatedAt : Date.now());
if (Date.now() - refDate.getTime() > 36 * 3600 * 1000) console.error(`WARNING: prices.json is stale (updatedAt=${refDate.toISOString()}) — 'today' framing on this page may be misleading until the server cron recovers.`);
const todayISO = refDate.toISOString().slice(0, 10);
const niceToday = refDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const curPrice = snap?.metals?.gold?.price ?? pts[pts.length - 1][1];

const fmt0 = (v) => v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US');
const fmt2 = (v) => v == null ? '—' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nice = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const niceM = (ym) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

// ---- daily era boundary (first non-month-start date) ----
let dailyStartIdx = pts.findIndex((p) => p[0].slice(8, 10) !== '01');
if (dailyStartIdx < 0) dailyStartIdx = pts.length;
const dailyStart = pts[dailyStartIdx]?.[0] ?? null;

// ---- monthly series (archive months + daily aggregated to monthly averages) ----
const monthly = []; // [ 'YYYY-MM', avg ]
for (let i = 0; i < dailyStartIdx; i++) monthly.push([pts[i][0].slice(0, 7), pts[i][1]]);
{
  let curM = null, sum = 0, n = 0;
  for (let i = dailyStartIdx; i < pts.length; i++) {
    const m = pts[i][0].slice(0, 7);
    if (m !== curM) { if (curM) monthly.push([curM, sum / n]); curM = m; sum = 0; n = 0; }
    sum += pts[i][1]; n++;
  }
  if (curM) monthly.push([curM, sum / n]);
}

// ---- real (today's dollars) monthly series, from 1970 ----
const real = []; // [ym, nominalAvg, realAvg]
for (const [ym, v] of monthly) {
  if (ym < '1970-01') continue;
  const c = cpi.get(ym) ?? (ym >= cpiNowKey ? cpiNow : null);
  if (!c) continue;
  real.push([ym, v, v * cpiNow / c]);
}
const realPeak = real.reduce((a, b) => (b[2] > a[2] ? b : a));
const jan80cpi = cpi.get('1980-01');
const real850 = jan80cpi ? 850 * cpiNow / jan80cpi : null; // famous 21 Jan 1980 London PM fix
const vs850 = real850 ? (curPrice - real850) / real850 * 100 : null;

// ---- all-time-high bookkeeping over the full series ----
let runMax = -Infinity, runMaxDate = null;
const dailyRecords = []; // records set during the daily era: {date, price, gapDays}
const recordsPerYear = new Map();
let prevRecordDate = null;
for (let i = 0; i < pts.length; i++) {
  const [d, v] = pts[i];
  if (v > runMax) {
    runMax = v; runMaxDate = d;
    if (i >= dailyStartIdx) {
      const gap = prevRecordDate ? Math.round((Date.parse(d) - Date.parse(prevRecordDate)) / 86400000) : null;
      dailyRecords.push({ date: d, price: v, gap });
      const y = d.slice(0, 4);
      recordsPerYear.set(y, (recordsPerYear.get(y) || 0) + 1);
    }
    prevRecordDate = d;
  }
}
const ath = { date: runMaxDate, price: runMax };
const atRecord = curPrice >= ath.price;
const ddPct = (curPrice - ath.price) / ath.price * 100;              // ≤ 0
const daysSincePeak = Math.round((refDate - Date.parse(ath.date)) / 86400000);

// ---- milestone first-crossings ($500 steps up to the max) ----
const milestones = [];
for (let t = 500; t <= runMax; t += 500) {
  const hit = pts.find((p) => p[1] >= t);
  if (hit) milestones.push({ level: t, date: hit[0], price: hit[1], daily: dailyStart != null && hit[0] >= dailyStart });
}

// ---- major drawdown episodes (>=15%) over the whole series ----
const episodes = [];
{
  let peakV = pts[0][1], peakD = pts[0][0], troughV = pts[0][1], troughD = pts[0][0], open = false;
  for (const [d, v] of pts) {
    if (v >= peakV) {
      if (open && (peakV - troughV) / peakV >= 0.15) episodes.push({ peakD, peakV, troughD, troughV, depth: (troughV - peakV) / peakV * 100, recoveredD: d });
      peakV = v; peakD = d; troughV = v; troughD = d; open = false;
    } else if (v < troughV) { troughV = v; troughD = d; open = true; }
    else if (!open && v < peakV) open = true;
  }
  if (open && (peakV - troughV) / peakV >= 0.15) episodes.push({ peakD, peakV, troughD, troughV, depth: (troughV - peakV) / peakV * 100, recoveredD: null });
}
episodes.sort((a, b) => a.depth - b.depth); // deepest (most negative) first
const topEpisodes = episodes.slice(0, 6).sort((a, b) => a.peakD < b.peakD ? -1 : 1);

// ---- SSR chart for the real-price page (nominal faint + real accent) ----
function chart(series) {
  const N = 260;
  const ds = series.length <= N ? series : Array.from({ length: N }, (_, i) => series[Math.round(i * (series.length - 1) / (N - 1))]);
  const W = 760, H = 320, P = 34, PB = 26;
  const vals = ds.flatMap((r) => [r[1], r[2]]);
  const mn = 0, mx = Math.max(...vals) * 1.04;
  const X = (i) => P + i / (ds.length - 1) * (W - 2 * P);
  const Y = (v) => (H - PB) - (v - mn) / (mx - mn) * (H - PB - 12);
  const path = (k) => ds.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(r[k]).toFixed(1)}`).join(' ');
  let grid = '', labels = '';
  const step = mx > 4000 ? 1000 : 500;
  for (let g = step; g < mx; g += step) {
    grid += `<line x1="${P}" x2="${W - P}" y1="${Y(g).toFixed(1)}" y2="${Y(g).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`;
    labels += `<text x="${P - 5}" y="${(Y(g) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--faint)" font-family="var(--font-mono)">${g >= 1000 ? (g / 1000) + 'k' : g}</text>`;
  }
  let xlab = '';
  for (const yr of ['1980', '1990', '2000', '2010', '2020']) {
    const i = ds.findIndex((r) => r[0] >= yr);
    if (i > 0) xlab += `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--faint)" font-family="var(--font-mono)">${yr}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gold price since 1970, nominal and adjusted for inflation" style="width:100%;height:auto">${grid}${labels}${xlab}
<path d="${path(1)}" fill="none" stroke="var(--faint)" stroke-width="1.3" opacity=".55"/>
<path d="${path(2)}" fill="none" stroke="var(--accent)" stroke-width="2.1" stroke-linejoin="round"/>
<circle cx="${X(ds.length - 1).toFixed(1)}" cy="${Y(ds[ds.length - 1][2]).toFixed(1)}" r="3.4" fill="var(--accent)"/></svg>
<p style="font-size:11.5px;color:var(--faint);margin:4px 0 0"><span style="color:var(--accent)">━</span> in today's dollars (real) &nbsp; <span>━</span> nominal (as quoted at the time) · monthly averages</p>`;
}

// ---- shared page chrome ----
const headEnd = `<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/assets/site.css?v=11">
<style>
.answer{font-size:16px;line-height:1.65;background:var(--surface-2);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--radius-sm);padding:14px 17px;margin:4px 0 6px;}
.upd{font-size:12px;color:var(--faint);margin:0 0 18px;}
.rec-table{width:100%;border-collapse:collapse;margin:4px 0 8px;font-size:14px;}
.rec-table th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line-strong);font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600;}
.rec-table td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);}
.rec-table td.n{font-family:var(--font-mono);}
.rec-table tr:last-child td{border-bottom:0;}
.rec-table .mut{color:var(--muted);font-size:12px;}
.gauge{display:flex;gap:18px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:18px 20px;margin:8px 0 10px;}
.gauge .g{min-width:130px;}
.gauge .gk{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:4px;}
.gauge .gv{font-family:var(--font-mono);font-size:22px;font-weight:600;}
.gauge .gs{font-size:12px;color:var(--muted);margin-top:2px;}
.note{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-sm);padding:13px 16px;font-size:13.5px;color:var(--muted);line-height:1.6;margin:14px 0;}
.note b{color:var(--ink);}
.dl{display:inline-flex;align-items:center;gap:7px;margin:6px 0 0;font-size:13.5px;font-weight:600;color:var(--accent);text-decoration:none;}
.dl:hover{text-decoration:underline;}
</style>
</head>
<body>
<header class="topbar"><div class="wrap topbar-inner">
  <a class="logo" href="/" aria-label="preciousmetalscharts home"><svg class="logo-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="none" stroke="var(--line-strong)"/><path d="M8 22.5 L14 16 L18.5 19.5 L26 10" fill="none" stroke="var(--accent)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><rect x="23.4" y="7.4" width="5.2" height="5.2" rx="1.3" fill="var(--accent)"/><line x1="8" y1="26.4" x2="26" y2="26.4" stroke="var(--faint)" stroke-width="1.4" stroke-linecap="round" opacity=".55"/></svg><span class="wordmark"><span class="a">preciousmetals</span><span class="b">charts</span></span></a>
  <nav class="sitenav" aria-label="Primary"><a href="/">Charts</a><a href="/ratio">Ratio</a><a href="/market-recap">Recap</a><a href="/calculators">Calculator</a><a href="/buy">Buy</a><a href="gold-ira.html" data-region-only="us">Gold&nbsp;IRA</a></nav>
  <div class="spacer"></div><div class="controls"><a class="livelink" href="${LIVE}/" title="Live prices"><span class="livedot"></span>Live</a><button class="iconbtn" id="themeBtn" aria-label="Toggle dark mode"><svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button></div>
</div></header>`;

const pageFoot = `<footer><div class="wrap foot">
  <div class="brandline"><svg class="logo-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="none" stroke="var(--line-strong)"/><path d="M8 22.5 L14 16 L18.5 19.5 L26 10" stroke="var(--accent)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><rect x="23.4" y="7.4" width="5.2" height="5.2" rx="1.3" fill="var(--accent)"/></svg><span class="wordmark"><span class="a">preciousmetals</span><span class="b">charts</span></span></div>
  <nav class="foot-links" aria-label="Site information"><a href="/about">About</a><a href="/methodology">Methodology</a><a href="/privacy">Privacy</a><a href="/disclaimer">Disclaimer</a><a href="/affiliate-disclosure">Affiliate disclosure</a></nav>
  <div class="legal"><b>Independent and not affiliated with any dealer or mint.</b> Educational information only — not investment advice. Historical price data: World Bank Commodity Price Data (The Pink Sheet), CC&nbsp;BY&nbsp;4.0, plus our own daily archive. Inflation data: US CPI (FRED, CPIAUCSL), public domain.</div>
</div></footer>
<script src="/assets/site.js?v=8" defer></script>
<script>(function(){var sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',moon='<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';var b=document.getElementById("themeBtn");if(b)b.addEventListener("click",function(){var c=document.documentElement.getAttribute("data-theme"),n=c==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",n);document.getElementById("themeIcon").innerHTML=n==="dark"?moon:sun;});})();</script>
</body></html>`;

function shell(url, title, descr, ldExtra, body) {
  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'preciousmetalscharts', url: `${SITE}/`, logo: `${SITE}/logo.png` },
      { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'preciousmetalscharts', publisher: { '@id': `${SITE}/#org` }, inLanguage: 'en' },
      { '@type': 'Article', '@id': `${url}#article`, headline: title, description: descr, datePublished: '2026-07-03', dateModified: todayISO, author: { '@id': `${SITE}/#org` }, publisher: { '@id': `${SITE}/#org` }, mainEntityOfPage: url },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Gold price', item: `${SITE}/gold-price` },
        { '@type': 'ListItem', position: 3, name: title, item: url }] },
      ...ldExtra,
    ],
  });
  return `<!DOCTYPE html>
<html lang="en" data-theme="light" data-currency="usd">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | preciousmetalscharts</title>
<meta name="description" content="${esc(descr)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${url}">
<meta name="author" content="preciousmetalscharts">
<meta property="og:type" content="article"><meta property="og:site_name" content="preciousmetalscharts">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(descr)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/og-cover.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${ld}</script>
${headEnd}
${body}
${pageFoot}`;
}

// =========================================================================================
// PAGE 1 — /gold-all-time-high
// =========================================================================================
{
  const url = `${SITE}/gold-all-time-high`;
  const recentRecords = dailyRecords.slice(-10).reverse();
  const yearRows = [...recordsPerYear.entries()].filter(([y]) => Number(y) >= 2019).sort((a, b) => b[0] - a[0]);

  const answer = atRecord
    ? `Gold's all-time high in our archive is ${fmt2(ath.price)}, set on ${nice(ath.date)} — and the price is at that record territory now, trading around ${fmt2(curPrice)}. In real, inflation-adjusted terms gold is ${vs850 != null ? (vs850 >= 0 ? `about ${vs850.toFixed(0)}% above` : `about ${Math.abs(vs850).toFixed(0)}% below`) : 'near'} the famous January 1980 peak.`
    : `Gold's all-time high is ${fmt2(ath.price)}, set on ${nice(ath.date)} (${daysSincePeak} days ago). It currently trades around ${fmt2(curPrice)} — ${Math.abs(ddPct).toFixed(1)}% below that record. In real, inflation-adjusted terms gold is ${vs850 != null ? (vs850 >= 0 ? `still about ${vs850.toFixed(0)}% above` : `about ${Math.abs(vs850).toFixed(0)}% below`) : 'near'} the famous January 1980 peak.`;

  const faq = [
    ['What is gold’s all-time high?', `In our daily archive, gold’s record close is ${fmt2(ath.price)}, set on ${nice(ath.date)}. Intraday prices briefly trade above closing records; the most-quoted historical benchmark before the modern era was the $850 London fix of 21 January 1980.`],
    ['How far is gold below its record right now?', atRecord ? `It isn’t — gold is currently trading at record territory, around ${fmt2(curPrice)}.` : `Gold trades around ${fmt2(curPrice)}, which is ${Math.abs(ddPct).toFixed(1)}% below the ${fmt2(ath.price)} record of ${nice(ath.date)}. This page updates daily.`],
    ['Is a pullback after a record normal?', `Historically, yes. Even within long bull markets gold has repeatedly pulled back 15–45% from a peak before setting new records — sometimes quickly, sometimes over years. The table of major drawdowns on this page shows every episode of 15% or more in our archive, with recovery dates.`],
  ];
  const faqLD = { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };

  const body = `<main class="wrap">
  <article class="doc">
    <h1>Gold all-time high: every record, and how far we are from it</h1>
    <p class="answer">${answer}</p>
    <p class="upd">Updated daily · ${niceToday} · spot ~10 min delayed · <a href="${LIVE}/" style="color:var(--accent)">live price</a></p>

    <div class="gauge">
      <div class="g"><div class="gk">Record close</div><div class="gv">${fmt0(ath.price)}</div><div class="gs">${nice(ath.date)}</div></div>
      <div class="g"><div class="gk">Price now</div><div class="gv">${fmt0(curPrice)}</div><div class="gs">~10 min delayed</div></div>
      <div class="g"><div class="gk">Below the record</div><div class="gv">${atRecord ? '0.0%' : Math.abs(ddPct).toFixed(1) + '%'}</div><div class="gs">${atRecord ? 'at record territory' : daysSincePeak + ' days since the peak'}</div></div>
      ${real850 ? `<div class="g"><div class="gk">1980 peak, today's $</div><div class="gv">${fmt0(real850)}</div><div class="gs">$850 fix of 21 Jan 1980, CPI-adjusted</div></div>` : ''}
    </div>

    <h2>The most recent record closes</h2>
    <table class="rec-table"><thead><tr><th>Date</th><th>Record close</th><th>Days since previous record</th></tr></thead><tbody>
    ${recentRecords.map((r) => `<tr><td>${nice(r.date)}</td><td class="n">${fmt2(r.price)}</td><td class="n">${r.gap == null ? '—' : r.gap}</td></tr>`).join('\n    ')}
    </tbody></table>
    <p class="rec-table mut" style="border:0;padding:0">New record closes per year (daily archive): ${yearRows.map(([y, n]) => `<b>${y}:</b> ${n}`).join(' · ')}.</p>

    <h2>When gold first crossed each $500 level</h2>
    <table class="rec-table"><thead><tr><th>Level</th><th>First reached</th><th>Price that day</th></tr></thead><tbody>
    ${milestones.map((m) => `<tr><td class="n">$${m.level.toLocaleString('en-US')}</td><td>${m.daily ? nice(m.date) : niceM(m.date.slice(0, 7)) + ' <span class="mut">(monthly avg)</span>'}</td><td class="n">${fmt2(m.price)}</td></tr>`).join('\n    ')}
    </tbody></table>

    <h2>Major drawdowns in the archive (15% or deeper)</h2>
    <table class="rec-table"><thead><tr><th>Peak</th><th>Trough</th><th>Depth</th><th>Regained the peak</th></tr></thead><tbody>
    ${topEpisodes.map((e) => `<tr><td>${e.peakD >= dailyStart ? nice(e.peakD) : niceM(e.peakD.slice(0, 7))} <span class="mut">${fmt0(e.peakV)}</span></td><td>${e.troughD >= dailyStart ? nice(e.troughD) : niceM(e.troughD.slice(0, 7))} <span class="mut">${fmt0(e.troughV)}</span></td><td class="n">${e.depth.toFixed(0)}%</td><td>${e.recoveredD ? (e.recoveredD >= dailyStart ? nice(e.recoveredD) : niceM(e.recoveredD.slice(0, 7))) : 'not yet'}</td></tr>`).join('\n    ')}
    </tbody></table>
    <p class="note"><b>How to read this:</b> deep drawdowns are a normal feature of gold's history — including inside long bull markets. This table is context, not a prediction: past patterns say nothing certain about the current move. Our archive holds monthly averages before ${nice(dailyStart)} and daily closes after, so older peaks and troughs are month-level.</p>

    <h2>Common questions</h2>
    <div class="faq-grid">
    ${faq.map(([q, a]) => `<article class="qa-card"><h3>${esc(q)}</h3><p>${esc(a)}</p></article>`).join('\n    ')}
    </div>
    <p class="faq-meta">Reviewed by the preciousmetalscharts desk · Updated ${niceToday} · Educational information only — not investment advice.</p>

    <div class="related">
      <a href="/gold-price">Live gold price</a>
      <a href="/gold-price-inflation-adjusted">Gold adjusted for inflation</a>
      <a href="/why-is-gold-moving">Why is gold moving?</a>
      <a href="/gold-price-history">Gold price by year</a>
      <a href="/gold-vs-stocks-bitcoin">Gold vs stocks vs bitcoin</a>
      <a href="/ratio">Gold-to-silver ratio</a>
      <a href="/newsletter">Get the recap by email</a>
    </div>
  </article>
</main>`;

  const descr = atRecord
    ? `Gold's all-time high is ${fmt0(ath.price)} (${nice(ath.date)}) — and it trades at record territory now. Every record close, milestone crossings and every major drawdown since 1960, updated daily.`
    : `Gold's all-time high is ${fmt0(ath.price)} (${nice(ath.date)}); it now trades ${Math.abs(ddPct).toFixed(1)}% below that. Every record close, milestone crossings and every major drawdown since 1960, updated daily.`;
  await writeFile(`${OUT}/gold-all-time-high.html`, shell(url, 'Gold All-Time High: Records & Drawdowns', descr, [faqLD], body));
}

// =========================================================================================
// PAGE 2 — /gold-price-inflation-adjusted (+ CSV)
// =========================================================================================
{
  const url = `${SITE}/gold-price-inflation-adjusted`;
  const startYear = real[0][0].slice(0, 4);

  // era table rows: notable monthly extremes in real terms
  const eras = [];
  const inWindow = (a, b) => real.filter((r) => r[0] >= a && r[0] <= b);
  const maxIn = (a, b) => inWindow(a, b).reduce((x, y) => (y[2] > x[2] ? y : x));
  const minIn = (a, b) => inWindow(a, b).reduce((x, y) => (y[2] < x[2] ? y : x));
  eras.push(['1980 peak (monthly avg)', maxIn('1979-01', '1981-12')]);
  eras.push(['1999–2001 low', minIn('1999-01', '2001-12')]);
  eras.push(['2011 peak', maxIn('2011-01', '2012-12')]);
  eras.push(['2015 low', minIn('2015-01', '2016-06')]);
  eras.push(['2020 peak', maxIn('2020-01', '2020-12')]);
  eras.push(['Latest month', real[real.length - 1]]);

  const vsRealPeak = (curPrice - realPeak[2]) / realPeak[2] * 100;
  const answer = `Adjusted for US inflation, gold's famous January 1980 peak — the $850 London fix — equals about ${fmt0(real850)} in today's dollars. Gold currently trades around ${fmt0(curPrice)}, ${vs850 >= 0 ? `roughly ${vs850.toFixed(0)}% above` : `roughly ${Math.abs(vs850).toFixed(0)}% below`} that real record. On monthly averages, the highest real price in our ${startYear}–${todayISO.slice(0, 4)} archive is ${fmt0(realPeak[2])} (${niceM(realPeak[0])}).`;

  const faq = [
    ['What was gold’s 1980 peak worth in today’s money?', `The $850 London PM fix of 21 January 1980 equals about ${fmt0(real850)} in today's dollars (US CPI). On a calmer monthly-average basis, January 1980 averaged about ${fmt0(maxIn('1979-12', '1980-02')[2])} in today's dollars.`],
    ['Is gold at an all-time high in real terms?', `${vsRealPeak >= 0 ? `By our monthly data, yes — the current price is at or above every inflation-adjusted monthly average since ${startYear}.` : `Not on the latest reading: the real monthly record is ${fmt0(realPeak[2])} (${niceM(realPeak[0])}); gold currently trades about ${Math.abs(vsRealPeak).toFixed(0)}% below it.`} Versus the famous 1980 daily fix (~${fmt0(real850)} in today's dollars), gold is ${vs850 >= 0 ? 'above' : 'below'} it.`],
    ['How is the inflation-adjusted price calculated?', 'Each month’s average gold price is multiplied by the ratio of the latest US Consumer Price Index (CPI-U, FRED series CPIAUCSL) to that month’s CPI. This restates every historical price in today’s purchasing power. Other deflators (PPI, wages) give somewhat different levels — CPI is the convention.'],
  ];
  const faqLD = { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const datasetLD = {
    '@type': 'Dataset', name: 'Gold price, nominal and inflation-adjusted (monthly)', description: `Monthly average gold price in US dollars, ${startYear}–present, with US CPI and the price restated in today's dollars.`,
    url, license: 'https://creativecommons.org/licenses/by/4.0/', creator: { '@id': `${SITE}/#org` },
    distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${SITE}/gold-price-inflation-adjusted.csv` }],
  };

  const body = `<main class="wrap">
  <article class="doc">
    <h1>Gold price adjusted for inflation: the real gold price since ${startYear}</h1>
    <p class="answer">${answer}</p>
    <p class="upd">Updated daily · ${niceToday} · CPI through ${niceM(cpiNowKey)} · <a href="${LIVE}/" style="color:var(--accent)">live price</a></p>

    ${chart(real)}

    <h2>Key moments, in today's dollars</h2>
    <table class="rec-table"><thead><tr><th>Moment</th><th>Nominal then</th><th>In today's dollars</th></tr></thead><tbody>
    ${eras.map(([label, r]) => `<tr><td>${label} <span class="mut">${niceM(r[0])}</span></td><td class="n">${fmt0(r[1])}</td><td class="n">${fmt0(r[2])}</td></tr>`).join('\n    ')}
    </tbody></table>
    <p class="note"><b>Method:</b> monthly average prices (World Bank Pink Sheet to ${nice(dailyStart)}, our daily archive after), deflated with US CPI-U (FRED: CPIAUCSL) to ${niceM(cpiNowKey)} dollars. The famous $850 daily fix of 21 January 1980 sits above that month's average — both are shown so the comparison is honest.</p>
    <a class="dl" href="/gold-price-inflation-adjusted.csv" download><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>Download the full monthly dataset (CSV)</a>

    <h2>Common questions</h2>
    <div class="faq-grid">
    ${faq.map(([q, a]) => `<article class="qa-card"><h3>${esc(q)}</h3><p>${esc(a)}</p></article>`).join('\n    ')}
    </div>
    <p class="faq-meta">Reviewed by the preciousmetalscharts desk · Updated ${niceToday} · Educational information only — not investment advice.</p>

    <div class="related">
      <a href="/gold-price">Live gold price</a>
      <a href="/gold-all-time-high">Gold all-time highs</a>
      <a href="/why-is-gold-moving">Why is gold moving?</a>
      <a href="/gold-price-history">Gold price by year</a>
      <a href="/gold-vs-stocks-bitcoin">Gold vs stocks vs bitcoin</a>
      <a href="/purchasing-power-calculator">Purchasing-power calculator</a>
      <a href="/newsletter">Get the recap by email</a>
    </div>
  </article>
</main>`;

  const descr = `Gold's 1980 peak equals about ${fmt0(real850)} in today's dollars; gold now trades ${vs850 >= 0 ? Math.round(vs850) + '% above' : Math.abs(vs850).toFixed(0) + '% below'} that real record. Full inflation-adjusted chart and dataset, ${startYear}–present, updated daily.`;
  await writeFile(`${OUT}/gold-price-inflation-adjusted.html`, shell(url, `Gold Price Adjusted for Inflation (${startYear}–${todayISO.slice(0, 4)})`, descr, [faqLD, datasetLD], body));

  let csv = 'month,gold_usd_nominal_avg,us_cpi,gold_usd_in_todays_dollars\n';
  for (const [ym, nom, re] of real) csv += `${ym},${nom.toFixed(2)},${(cpi.get(ym) ?? cpiNow).toFixed(1)},${re.toFixed(2)}\n`;
  await writeFile(`${OUT}/gold-price-inflation-adjusted.csv`, csv);
}

console.log(`records pages: ATH ${fmt2(ath.price)} (${ath.date}) · dd ${ddPct.toFixed(1)}% · real 1980 fix ${fmt0(real850)} · ${dailyRecords.length} daily-era records · ${topEpisodes.length} drawdown episodes`);
