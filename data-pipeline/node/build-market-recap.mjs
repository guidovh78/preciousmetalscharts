// build-market-recap.mjs — generate a server-rendered "Metals market recap" page.
// ---------------------------------------------------------------------------------------
// Reads the static price snapshot + history archive and writes a fully-rendered, site-styled
// market-recap.html: the recap text + numbers are baked into the HTML (good for SEO/GEO),
// not loaded by JS. A GitHub Action runs this daily and uploads the page. This only DISPLAYS
// our own data on our own site — no third-party data is redistributed. Factual only, no advice.
//
//   DATA_DIR=./public OUT=market-recap.html node build-market-recap.mjs
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
const DAYS = { daily: 1, weekly: 7, monthly: 30 };
const PNOUN = { daily: 'day', weekly: 'week', monthly: 'month' };
const periodDays = DAYS[PERIOD] || 7;
const pnoun = PNOUN[PERIOD] || 'week';

async function tryJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }

const snap = await tryJSON(`${DATA}/prices.json`);
if (!snap || !snap.metals) { console.error('No prices.json in ' + DATA); process.exit(1); }
const refDate = new Date(snap.updatedAt && !isNaN(Date.parse(snap.updatedAt)) ? snap.updatedAt : Date.now());

const hist = {};
for (const m of ALL) {
  hist[m] = {
    daily: (await tryJSON(`${DATA}/history/${m}-1y.json`))?.points || null,
    monthly: (await tryJSON(`${DATA}/history/${m}-50y.json`))?.points || null,
  };
}

const isoDaysAgo = (n) => { const d = new Date(refDate); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const closeAtOrBefore = (pts, iso) => { if (!pts) return null; let v = pts.length ? pts[0][1] : null; for (const p of pts) { if (p[0] <= iso) v = p[1]; else break; } return v; };
const cutISO = isoDaysAgo(periodDays);

const data = {};
for (const m of ALL) {
  const price = snap.metals[m]?.price;
  if (price == null) continue;
  const daily = hist[m].daily, monthly = hist[m].monthly;
  const past = daily ? closeAtOrBefore(daily, cutISO) : null;
  const periodPct = (past && past > 0) ? (price - past) / past * 100 : (snap.metals[m].changePct ?? null);
  const yrAgo = daily && daily.length ? daily[0][1] : (monthly ? closeAtOrBefore(monthly, isoDaysAgo(365)) : null);
  const yrPct = (yrAgo && yrAgo > 0) ? (price - yrAgo) / yrAgo * 100 : null;
  const recordHigh = Math.max(price, ...(monthly || []).map((p) => p[1]), ...(daily || []).map((p) => p[1]));
  data[m] = { price, periodPct, yrPct, recordHigh, past };
}

const rNow = (data.gold && data.silver) ? data.gold.price / data.silver.price : null;
const rPast = (data.gold?.past && data.silver?.past) ? data.gold.past / data.silver.past : null;
let rAvg = null;
if (hist.gold.monthly && hist.silver.monthly) {
  const sm = new Map(hist.silver.monthly.map((p) => [p[0], p[1]])); let sum = 0, n = 0;
  for (const [d, gp] of hist.gold.monthly) { const sp = sm.get(d); if (sp) { sum += gp / sp; n++; } }
  rAvg = n ? sum / n : null;
}

const fmtP = (v) => v == null ? '—' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctTxt = (n) => n == null ? '—' : (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1) + '%';
const arrow = (n) => n == null ? '' : (n >= 0 ? '▲ ' : '▼ ');
const colcls = (n) => n == null ? '' : (n >= 0 ? 'up' : 'down');

const ranked = ALL.filter((m) => data[m]?.yrPct != null).sort((a, b) => data[b].yrPct - data[a].yrPct);
const leader = ranked[0], laggard = ranked[ranked.length - 1];

const sel = ALL.filter((m) => data[m]?.periodPct != null);
const ups = sel.filter((m) => data[m].periodPct >= 0).length;
const tone = sel.length === 0 ? 'mixed' : ups === sel.length ? 'broadly firmer' : ups === 0 ? 'softer' : 'mixed';
const byMove = [...sel].sort((a, b) => data[b].periodPct - data[a].periodPct);
const top = byMove[0], bottom = byMove[byMove.length - 1];
let narrative = '';
if (top) narrative += `${META[top].name} ${data[top].periodPct >= 0 ? 'led' : 'fell least in'} a ${tone} ${pnoun}`;
if (bottom && bottom !== top) narrative += `, while ${META[bottom].name.toLowerCase()} ${data[bottom].periodPct >= 0 ? 'lagged' : 'slipped'}`;
if (rNow != null) { const dir = (rPast != null) ? (rNow < rPast - 0.2 ? 'compressed' : rNow > rPast + 0.2 ? 'widened' : 'held') : 'stood'; narrative += `. The gold-to-silver ratio ${dir} to ${rNow.toFixed(1)}`; }
narrative += '.';

const bullets = [];
if (data.gold) { const d = (data.gold.recordHigh - data.gold.price) / data.gold.recordHigh * 100; bullets.push(d < 0.5 ? 'Gold is trading at or near a record high.' : `Gold sits about ${d < 10 ? d.toFixed(1) : Math.round(d)}% below its record high.`); }
if (leader && data[leader].yrPct != null) bullets.push(`${META[leader].name} is the 12-month leader, ${data[leader].yrPct >= 0 ? 'up' : 'down'} ~${Math.abs(data[leader].yrPct).toFixed(0)}%.`);
if (laggard && laggard !== leader && data[laggard].yrPct != null) bullets.push(`${META[laggard].name} is the laggard, ${data[laggard].yrPct >= 0 ? 'up' : 'down'} ~${Math.abs(data[laggard].yrPct).toFixed(0)}% on the year.`);
if (rNow != null && rAvg != null) bullets.push(`The gold-to-silver ratio (${rNow.toFixed(1)}) is ${rNow < rAvg ? 'below' : 'above'} its long-run average (~${rAvg.toFixed(0)}).`);

const end = new Date(refDate); const start = new Date(refDate); start.setDate(start.getDate() - periodDays);
const opt = { day: 'numeric', month: 'short' };
const dateRange = `${start.toLocaleDateString('en-GB', opt)} – ${end.toLocaleDateString('en-GB', { ...opt, year: 'numeric' })}`;
const isoDate = refDate.toISOString().slice(0, 10);
const longDate = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const rows = ALL.filter((m) => data[m]).map((m) => {
  const d = data[m];
  return `<tr><td><span class="dot" style="background:${META[m].color}"></span>${META[m].name} <span class="sym">${META[m].sym}</span></td><td class="num">${fmtP(d.price)}</td><td class="num ${colcls(d.periodPct)}">${arrow(d.periodPct)}${pctTxt(d.periodPct)}</td><td class="num ${colcls(d.yrPct)}">${pctTxt(d.yrPct)}</td></tr>`;
}).join('');

const faqText = `${narrative} ${bullets.join(' ')}`.replace(/"/g, '\\"');
const schema = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Article',
  headline: `Metals market recap — ${dateRange}`,
  description: narrative,
  datePublished: refDate.toISOString(), dateModified: refDate.toISOString(),
  author: { '@type': 'Organization', name: 'preciousmetalscharts', url: SITE + '/' },
  publisher: { '@id': SITE + '/#org' },
  isAccessibleForFree: true, inLanguage: 'en',
});
const crumb = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Market recap', item: SITE + '/market-recap' }] });

const html = `<!DOCTYPE html>
<html lang="en" data-theme="light" data-currency="usd">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Metals Market Recap (${dateRange}) — Gold, Silver, Platinum, Palladium | preciousmetalscharts</title>
<meta name="description" content="${(narrative + ' Spot prices, the gold-to-silver ratio and where things stand. Updated ' + longDate + '.').replace(/"/g, '&quot;')}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${SITE}/market-recap">
<meta name="author" content="preciousmetalscharts">
<meta property="og:type" content="article"><meta property="og:site_name" content="preciousmetalscharts">
<meta property="og:title" content="Metals market recap — ${dateRange}"><meta property="og:description" content="${narrative.replace(/"/g, '&quot;')}"><meta property="og:url" content="${SITE}/market-recap">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"${SITE}/#org","name":"preciousmetalscharts","url":"${SITE}/","logo":"${SITE}/logo.png"}]}</script>
<script type="application/ld+json">${schema}</script>
<script type="application/ld+json">${crumb}</script>
<link rel="stylesheet" href="/assets/site.css?v=10">
<style>
  .rc-table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 6px;}
  .rc-table th,.rc-table td{text-align:left;padding:11px 10px;border-bottom:1px solid var(--line);}
  .rc-table th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600;}
  .rc-table td.num{font-family:var(--font-mono);text-align:right;white-space:nowrap;}
  .rc-table .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px;}
  .rc-table .sym{font-family:var(--font-mono);font-size:11px;color:var(--faint);}
  .rc-table .up{color:var(--up);} .rc-table .down{color:var(--down);}
  .rc-lead{font-size:16px;line-height:1.6;margin:6px 0 14px;}
  .rc-ratio{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:12px 14px;margin:6px 0 14px;}
  .rc-ratio .v{font-family:var(--font-mono);font-size:20px;font-weight:600;}
  .rc-updated{font-family:var(--font-mono);font-size:12px;color:var(--muted);}
</style>
</head>
<body>
<header class="topbar"><div class="wrap topbar-inner">
  <a class="logo" href="/" aria-label="preciousmetalscharts home"><svg class="logo-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="none" stroke="var(--line-strong)"/><path d="M8 22.5 L14 16 L18.5 19.5 L26 10" fill="none" stroke="var(--accent)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><rect x="23.4" y="7.4" width="5.2" height="5.2" rx="1.3" fill="var(--accent)"/><line x1="8" y1="26.4" x2="26" y2="26.4" stroke="var(--faint)" stroke-width="1.4" stroke-linecap="round" opacity=".55"/></svg><span class="wordmark"><span class="a">preciousmetals</span><span class="b">charts</span></span></a>
  <nav class="sitenav" aria-label="Primary"><a href="/">Charts</a><a href="/ratio">Ratio</a><a href="/calculators">Calculator</a><a href="/buy">Buy</a><a href="gold-ira.html" data-region-only="us">Gold&nbsp;IRA</a></nav>
  <div class="spacer"></div><div class="controls"><a class="livelink" href="${LIVE}/" title="Live prices"><span class="livedot"></span>Live</a><button class="iconbtn" id="themeBtn" aria-label="Toggle dark mode"><svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button></div>
</div></header>
<main class="wrap">
  <section class="hero">
    <div class="trustline"><span class="ttag">Independent</span><span>Not a dealer — we sell no metals</span><span class="sep"></span><span>Spot data · ~10 min delayed</span></div>
    <h1 class="lede">Metals market recap</h1>
    <div class="rc-updated">${dateRange} · spot, USD per troy oz · updated ${longDate}</div>
    <p class="rc-lead">${narrative}</p>
    <div class="related"><a href="${LIVE}/">Live prices</a><a href="/gold-price">Gold</a><a href="/silver-price">Silver</a><a href="/ratio">Ratio</a><a href="/calculators">Calculators</a></div>
  </section>

  <section class="sec">
    <div class="sec-head"><span class="sec-num">01</span><h2>This ${pnoun} at a glance</h2></div>
    <table class="rc-table"><thead><tr><th>Metal</th><th style="text-align:right">Price</th><th style="text-align:right">${pnoun === 'week' ? '1-week' : pnoun === 'day' ? '1-day' : '1-month'}</th><th style="text-align:right">1-year</th></tr></thead><tbody>${rows}</tbody></table>
    ${rNow != null ? `<div class="rc-ratio"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Gold-to-silver ratio</div><div class="v">${rNow.toFixed(1)}</div><div style="font-size:12.5px;color:var(--muted);margin-top:3px">${rAvg != null ? `${rNow < rAvg ? 'Below' : 'Above'} its long-run average of ~${rAvg.toFixed(0)} — the ounces of silver it takes to buy one ounce of gold.` : ''}</div></div>` : ''}
  </section>

  <section class="sec">
    <div class="sec-head"><span class="sec-num">02</span><h2>Where it stands</h2></div>
    <ul style="font-size:14px;line-height:1.8;color:var(--ink);padding-left:18px;margin:4px 0">${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
    <p class="faq-meta">Figures are spot, ~10 minutes delayed, from our own price archive (deep history from World Bank commodity data, CC BY 4.0). Educational information only — not investment advice. Auto-generated ${longDate}.</p>
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
console.error(`OK market-recap → ${OUT} · ${dateRange} · ratio ${rNow ? rNow.toFixed(1) : 'n/a'} · ${bullets.length} context lines`);
