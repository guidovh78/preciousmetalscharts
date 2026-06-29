// build-year-pages.mjs — generate server-rendered "<Metal> price in <Year>" long-tail pages.
// ---------------------------------------------------------------------------------------
// Each page stands on its own with REAL, unique data from our own archive: that year's
// open/close/high/low/average, % change, the gold-silver ratio that year, a build-time
// static SVG chart, and how the year compares to today. No thin number-swaps — the numbers,
// the answer block and the comparisons are genuinely different per (metal, year). All
// citeable content is baked into the HTML (no JS needed). Factual only — no advice.
//
//   DATA_DIR=./data OUT_DIR=./out METALS=gold,silver YEARS=2000-2026 node build-year-pages.mjs
//   (YEARS accepts "2008", "2000-2026", or a comma list; default = 2000..currentYear)
// ---------------------------------------------------------------------------------------

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const DATA = process.env.DATA_DIR || './data';
const OUT = process.env.OUT_DIR || './out';
const SITE = 'https://preciousmetalscharts.com';
const LIVE = 'https://live.preciousmetalscharts.com';

const META = {
  gold: { name: 'Gold', sym: 'XAU', color: '#C19A2E' },
  silver: { name: 'Silver', sym: 'XAG', color: '#8C9298' },
  platinum: { name: 'Platinum', sym: 'XPT', color: '#9FB1BB' },
  palladium: { name: 'Palladium', sym: 'XPD', color: '#B8997A' },
};
const ALL = ['gold', 'silver', 'platinum', 'palladium'];

async function tryJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }

// merge several history files into one date-sorted, unique-by-date series (finer files win)
async function mergedSeries(metal) {
  const map = new Map();
  for (const tf of ['50y', '20y', '10y', '5y', '1y']) {
    const j = await tryJSON(`${DATA}/history/${metal}-${tf}.json`);
    for (const [d, v] of (j?.points || [])) if (Number.isFinite(v)) map.set(d, v); // later (finer) overwrites
  }
  return [...map.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
}

const snap = await tryJSON(`${DATA}/prices.json`);
if (!snap || !snap.metals) { console.error('No prices.json in ' + DATA); process.exit(1); }
const refDate = new Date(snap.updatedAt && !isNaN(Date.parse(snap.updatedAt)) ? snap.updatedAt : Date.now());
const todayISO = refDate.toISOString().slice(0, 10);
const curYear = refDate.getUTCFullYear();

// ---- load + compute per-metal yearly stats ----
const series = {};
for (const m of ALL) series[m] = await mergedSeries(m);

function yearStats(metal, year) {
  const ys = String(year);
  const pts = series[metal].filter(([d]) => d.slice(0, 4) === ys);
  if (pts.length < 2) return null;
  const vals = pts.map((p) => p[1]);
  let hi = pts[0], lo = pts[0];
  for (const p of pts) { if (p[1] > hi[1]) hi = p; if (p[1] < lo[1]) lo = p; }
  const open = pts[0][1], close = pts[pts.length - 1][1];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { pts, open, close, hi, lo, avg, change: (close - open) / open * 100, n: pts.length };
}

// precompute yearly average for every metal+year (for the ratio)
const yearlyAvg = {};
for (const m of ALL) { yearlyAvg[m] = {}; for (const [d, v] of series[m]) { const y = d.slice(0, 4); (yearlyAvg[m][y] ||= []).push(v); } for (const y in yearlyAvg[m]) yearlyAvg[m][y] = yearlyAvg[m][y].reduce((a, b) => a + b, 0) / yearlyAvg[m][y].length; }

// ---- format helpers ----
const fmt0 = (n) => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');
const fmt2 = (n) => n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = (n) => n == null ? '—' : (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1) + '%';
const niceDate = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// build-time static SVG line chart for one year
function yearChart(pts, color) {
  if (!pts || pts.length < 2) return '';
  const w = 720, h = 260, padX = 8, padT = 14, padB = 22;
  const v = pts.map((p) => p[1]); const mn = Math.min(...v), mx = Math.max(...v), rg = (mx - mn) || 1;
  const n = v.length;
  const X = (i) => (padX + i / (n - 1) * (w - 2 * padX));
  const Y = (val) => (h - padB - (val - mn) / rg * (h - padT - padB));
  let line = '', area = '';
  for (let i = 0; i < n; i++) { const x = X(i).toFixed(1), y = Y(v[i]).toFixed(1); line += (i ? ' L' : 'M') + x + ' ' + y; }
  area = line + ` L${X(n - 1).toFixed(1)} ${h - padB} L${X(0).toFixed(1)} ${h - padB} Z`;
  const hiI = v.indexOf(mx), loI = v.indexOf(mn);
  const lbl = (i, val, place) => `<text x="${X(i).toFixed(1)}" y="${(Y(val) + (place === 'up' ? -6 : 14)).toFixed(1)}" font-size="11" font-family="ui-monospace,Menlo,monospace" fill="var(--muted)" text-anchor="middle">${fmt0(val)}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Price chart for the year"><defs><linearGradient id="yg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.18"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#yg)"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${lbl(hiI, mx, 'up')}${lbl(loI, mn, 'down')}</svg>`;
}

const head = (m, year, s, descr, faq, dataset) => {
  const Name = META[m].name, url = `${SITE}/${m}-price-${year}`;
  return `<!DOCTYPE html>
<html lang="en" data-theme="light" data-currency="usd">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${Name} Price in ${year} — High, Low, Average &amp; Chart | preciousmetalscharts</title>
<meta name="description" content="${esc(descr)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${url}">
<meta name="author" content="preciousmetalscharts">
<meta property="og:type" content="article"><meta property="og:site_name" content="preciousmetalscharts">
<meta property="og:title" content="${Name} price in ${year}"><meta property="og:description" content="${esc(descr)}"><meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"${SITE}/#org","name":"preciousmetalscharts","url":"${SITE}/","logo":"${SITE}/logo.png"},{"@type":"WebSite","@id":"${SITE}/#website","url":"${SITE}/","name":"preciousmetalscharts","publisher":{"@id":"${SITE}/#org"},"inLanguage":"en"},{"@type":"WebPage","@id":"${url}#webpage","url":"${url}","name":"${Name} price in ${year}","isPartOf":{"@id":"${SITE}/#website"},"dateModified":"${todayISO}","about":"${m} price ${year}"},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},{"@type":"ListItem","position":2,"name":"${Name} price","item":"${SITE}/${m}-price"},{"@type":"ListItem","position":3,"name":"${year}","item":"${url}"}]}]}</script>
<script type="application/ld+json">${faq}</script>
<script type="application/ld+json">${dataset}</script>
<link rel="stylesheet" href="/assets/site.css?v=10">
<style>.yr-table{width:100%;border-collapse:collapse;margin:6px 0 4px;font-size:14.5px;}.yr-table th,.yr-table td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);}.yr-table td.n,.yr-table th.n{text-align:right;font-family:var(--font-mono);}.yr-table tr:last-child td{border-bottom:0;}.answer{font-size:16px;line-height:1.65;background:var(--surface-2);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--radius-sm);padding:13px 16px;margin:4px 0 14px;}.yr-prevnext{display:flex;justify-content:space-between;gap:10px;margin:8px 0;}.yr-prevnext a{font-family:var(--font-mono);font-size:13px;color:var(--accent);text-decoration:none;}</style>
</head>
<body>`;
};

const header = (m) => `<header class="topbar"><div class="wrap topbar-inner">
  <a class="logo" href="/" aria-label="preciousmetalscharts home"><svg class="logo-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="none" stroke="var(--line-strong)"/><path d="M8 22.5 L14 16 L18.5 19.5 L26 10" fill="none" stroke="var(--accent)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><rect x="23.4" y="7.4" width="5.2" height="5.2" rx="1.3" fill="var(--accent)"/><line x1="8" y1="26.4" x2="26" y2="26.4" stroke="var(--faint)" stroke-width="1.4" stroke-linecap="round" opacity=".55"/></svg><span class="wordmark"><span class="a">preciousmetals</span><span class="b">charts</span></span></a>
  <nav class="sitenav" aria-label="Primary"><a href="/">Charts</a><a href="/ratio">Ratio</a><a href="/market-recap">Recap</a><a href="/calculators">Calculator</a><a href="/buy">Buy</a><a href="gold-ira.html" data-region-only="us">Gold&nbsp;IRA</a></nav>
  <div class="spacer"></div><div class="controls"><a class="livelink" href="${LIVE}/" title="Live prices"><span class="livedot"></span>Live</a><button class="iconbtn" id="themeBtn" aria-label="Toggle dark mode"><svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button></div>
</div></header>`;

const footer = () => `<footer><div class="wrap foot">
  <div class="brandline"><svg class="logo-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="none" stroke="var(--line-strong)"/><path d="M8 22.5 L14 16 L18.5 19.5 L26 10" stroke="var(--accent)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><rect x="23.4" y="7.4" width="5.2" height="5.2" rx="1.3" fill="var(--accent)"/></svg><span class="wordmark"><span class="a">preciousmetals</span><span class="b">charts</span></span></div>
  <nav class="foot-links" aria-label="Site information"><a href="/about">About</a><a href="/methodology">Methodology</a><a href="/disclaimer">Disclaimer</a><a href="/affiliate-disclosure">Affiliate disclosure</a></nav>
  <div class="legal"><b>Independent and not affiliated with any dealer or mint.</b> Educational information only — not investment advice. Prices are spot in US dollars; verify before transacting.</div>
</div></footer>
<script src="/assets/site.js?v=8" defer></script>
<script>(function(){var sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',moon='<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';var b=document.getElementById("themeBtn");if(b)b.addEventListener("click",function(){var c=document.documentElement.getAttribute("data-theme"),n=c==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",n);document.getElementById("themeIcon").innerHTML=n==="dark"?moon:sun;});})();</script>
</body></html>`;

function renderPage(m, year) {
  const s = yearStats(m, year); if (!s) return null;
  const Name = META[m].name, ys = String(year);
  const rose = s.change >= 0;
  const today = snap.metals[m]?.price ?? null;
  const vsAvg = (today != null) ? (today - s.avg) / s.avg * 100 : null;
  const worth = (today != null) ? 1000 / s.avg * today : null;
  // ratio that year (yearly averages)
  const ga = yearlyAvg.gold?.[ys], sa = yearlyAvg.silver?.[ys];
  const ratioYr = (ga && sa) ? ga / sa : null;

  const descr = `${Name} averaged ${fmt0(s.avg)} per troy ounce in ${ys}, ranging from ${fmt0(s.lo[1])} to ${fmt0(s.hi[1])}. It opened at ${fmt0(s.open)} and ended at ${fmt0(s.close)} (${fmtP(s.change)}). See the full ${ys} ${m} price chart and how it compares to today.`;

  // front-loaded answer block (~50-70 words)
  const answer = `In ${ys}, ${m} ${rose ? 'rose' : 'fell'} ${fmtP(s.change)}, opening the year around ${fmt0(s.open)} per troy ounce and ending near ${fmt0(s.close)}. It averaged ${fmt0(s.avg)}, with a high of ${fmt2(s.hi[1])} on ${niceDate(s.hi[0])} and a low of ${fmt2(s.lo[1])} on ${niceDate(s.lo[0])}.${today != null ? ` Today ${m} trades around ${fmt0(today)} — ${vsAvg >= 0 ? 'about ' + Math.abs(vsAvg).toFixed(0) + '% above' : 'about ' + Math.abs(vsAvg).toFixed(0) + '% below'} its ${ys} average.` : ''}`;

  const statsTable = `<table class="yr-table"><tbody>
    <tr><th>Opening price (Jan ${ys})</th><td class="n">${fmt2(s.open)}</td></tr>
    <tr><th>Closing price (Dec ${ys})</th><td class="n">${fmt2(s.close)}</td></tr>
    <tr><th>Change over ${ys}</th><td class="n" style="color:${rose ? 'var(--up)' : 'var(--down)'}">${fmtP(s.change)}</td></tr>
    <tr><th>${ys} high</th><td class="n">${fmt2(s.hi[1])} <span style="color:var(--faint)">· ${niceDate(s.hi[0])}</span></td></tr>
    <tr><th>${ys} low</th><td class="n">${fmt2(s.lo[1])} <span style="color:var(--faint)">· ${niceDate(s.lo[0])}</span></td></tr>
    <tr><th>${ys} average</th><td class="n">${fmt2(s.avg)}</td></tr>
  </tbody></table>`;

  const compareBullets = [];
  if (today != null) compareBullets.push(`${Name} today trades around <strong>${fmt0(today)}</strong> — ${vsAvg >= 0 ? `<strong>${Math.abs(vsAvg).toFixed(0)}% higher</strong> than` : `<strong>${Math.abs(vsAvg).toFixed(0)}% lower</strong> than`} its ${ys} average of ${fmt0(s.avg)}.`);
  if (worth != null) compareBullets.push(`$1,000 of ${m} bought at the ${ys} average would be worth about <strong>${fmt0(worth)}</strong> today (at spot, before premiums, fees and taxes).`);
  if (ratioYr != null) compareBullets.push(`The gold-to-silver ratio averaged about <strong>${ratioYr.toFixed(0)}</strong> in ${ys}.`);

  const faqObj = {
    '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: `What was the highest ${m} price in ${ys}?`, acceptedAnswer: { '@type': 'Answer', text: `The highest ${m} spot price in ${ys} was about ${fmt2(s.hi[1])} per troy ounce, on ${niceDate(s.hi[0])}. The low was about ${fmt2(s.lo[1])} on ${niceDate(s.lo[0])}.` } },
      { '@type': 'Question', name: `Did ${m} go up or down in ${ys}?`, acceptedAnswer: { '@type': 'Answer', text: `${Name} ${rose ? 'rose' : 'fell'} ${fmtP(s.change)} over ${ys}, opening near ${fmt0(s.open)} and ending near ${fmt0(s.close)} per troy ounce. It averaged ${fmt0(s.avg)} for the year.` } },
      ...(worth != null ? [{ '@type': 'Question', name: `What would ${m} bought in ${ys} be worth today?`, acceptedAnswer: { '@type': 'Answer', text: `At the ${ys} average price, $1,000 of ${m} would be worth roughly ${fmt0(worth)} today at the spot price, before any premiums, fees or taxes.` } }] : []),
    ],
  };
  const datasetObj = {
    '@context': 'https://schema.org', '@type': 'Dataset', name: `${Name} price ${ys}`, description: `Spot price of ${m} per troy ounce in US dollars during ${ys}, from the preciousmetalscharts price archive (deep history from World Bank Commodity Price Data, CC BY 4.0).`,
    temporalCoverage: `${ys}-01-01/${ys}-12-31`, license: 'https://creativecommons.org/licenses/by/4.0/', creditText: 'World Bank Commodity Price Data (Pink Sheet), CC BY 4.0', isAccessibleForFree: true,
    variableMeasured: { '@type': 'PropertyValue', name: `${Name} spot price`, unitText: 'USD per troy ounce' }, creator: { '@id': `${SITE}/#org` }, url: `${SITE}/${m}-price-${ys}`,
  };

  const prev = year - 1, next = year + 1;
  const prevLink = yearStats(m, prev) ? `<a href="/${m}-price-${prev}">← ${Name} in ${prev}</a>` : '<span></span>';
  const nextLink = (next <= curYear && yearStats(m, next)) ? `<a href="/${m}-price-${next}">${Name} in ${next} →</a>` : '<span></span>';
  const otherMetals = ALL.filter((x) => x !== m && yearStats(x, year)).map((x) => `<a href="/${x}-price-${year}">${META[x].name} in ${year}</a>`).join('');

  const body = `<main class="wrap">
  <section class="hero">
    <div class="trustline"><span class="ttag">Independent</span><span>Not a dealer — we sell no metals</span><span class="sep"></span><span>From our own price archive</span></div>
    <h1 class="lede">${Name} price in ${year}</h1>
    <p class="answer">${answer}</p>
    ${statsTable}
    <p class="sub" style="font-size:12px;color:var(--faint)">Spot price, US dollars per troy ounce. ${s.n} data points from our archive${s.n < 20 ? ' (monthly)' : ''}.</p>
    <div class="related"><a href="/${m}-price">Live ${m} price</a><a href="/${m}-price-history">${Name} history</a><a href="/dca-calculator">DCA backtest</a><a href="/ratio">Gold-to-silver ratio</a></div>
  </section>

  <section class="sec">
    <article class="panel" aria-label="${Name} ${year} price chart">
      <div class="panel-head"><div><div class="panel-title">${Name} price chart — ${year}</div><div class="panel-sub">${META[m].sym} · USD / troy oz · our own archive</div></div></div>
      <div style="padding:10px 4px 2px">${yearChart(s.pts, META[m].color)}</div>
    </article>
  </section>

  <section class="sec">
    <div class="sec-head"><span class="sec-num">01</span><h2>How ${year} compares to today</h2></div>
    <ul style="font-size:14.5px;line-height:1.8;padding-left:18px;margin:4px 0;">${compareBullets.map((b) => `<li>${b}</li>`).join('')}</ul>
  </section>

  <section class="sec">
    <div class="sec-head"><span class="sec-num">02</span><h2>Common questions</h2></div>
    <div class="faq-grid">
      <article class="qa-card"><h3>What was the highest ${m} price in ${year}?</h3><p>The highest ${m} spot price in ${year} was about ${fmt2(s.hi[1])} per troy ounce, reached on ${niceDate(s.hi[0])}. The year's low was about ${fmt2(s.lo[1])} on ${niceDate(s.lo[0])}.</p></article>
      <article class="qa-card"><h3>Did ${m} go up or down in ${year}?</h3><p>${Name} ${rose ? 'rose' : 'fell'} ${fmtP(s.change)} over ${year}, opening near ${fmt0(s.open)} and ending near ${fmt0(s.close)}. The average for the year was ${fmt0(s.avg)}.</p></article>
      ${worth != null ? `<article class="qa-card"><h3>What would ${m} bought in ${year} be worth today?</h3><p>At the ${year} average price, $1,000 of ${m} would be worth roughly ${fmt0(worth)} today at spot — before premiums, fees and taxes. Try our <a href="/dca-calculator">DCA backtest</a> for a fuller picture.</p></article>` : ''}
    </div>
    <p class="faq-meta">Reviewed by the preciousmetalscharts editorial team · Updated ${niceDate(todayISO)} · Figures are spot in USD from our archive (deep history: World Bank Pink Sheet, CC BY 4.0). See our <a href="/methodology">methodology</a>.</p>
    <div class="yr-prevnext">${prevLink}${nextLink}</div>
    ${otherMetals ? `<div class="related">${otherMetals}</div>` : ''}
  </section>
</main>`;

  const faqJSON = JSON.stringify(faqObj), datasetJSON = JSON.stringify(datasetObj);
  return head(m, year, s, descr, faqJSON, datasetJSON) + header(m) + body + footer();
}

// ---- main ----
function parseYears(spec) {
  if (!spec) { const a = []; for (let y = 2000; y <= curYear; y++) a.push(y); return a; }
  const out = new Set();
  for (const part of spec.split(',').map((x) => x.trim()).filter(Boolean)) {
    const mrange = part.match(/^(\d{4})-(\d{4})$/);
    if (mrange) { for (let y = +mrange[1]; y <= +mrange[2]; y++) out.add(y); }
    else if (/^\d{4}$/.test(part)) out.add(+part);
  }
  return [...out].sort((a, b) => a - b);
}

const metals = (process.env.METALS || 'gold,silver').split(',').map((s) => s.trim()).filter((m) => ALL.includes(m));
const years = parseYears(process.env.YEARS);
await mkdir(OUT, { recursive: true });

let written = 0, skipped = 0;
const index = {};
for (const m of metals) {
  index[m] = [];
  for (const y of years) {
    const html = renderPage(m, y);
    if (!html) { skipped++; continue; }
    await writeFile(`${OUT}/${m}-price-${y}.html`, html);
    index[m].push(y); written++;
  }
}
// emit a small manifest so the deploy step knows what to upload + the hub can be built
await writeFile(`${OUT}/_year-index.json`, JSON.stringify({ generatedAt: todayISO, metals: index }, null, 2));
console.error(`OK year-pages → ${written} written, ${skipped} skipped (no data). metals=${metals.join(',')} years=${years[0]}..${years[years.length - 1]}`);
for (const m of metals) console.error(`  ${m}: ${index[m].length} years (${index[m][0]}..${index[m][index[m].length - 1]})`);
