// build-comparison-page.mjs — "Gold vs stocks vs bitcoin" comparison engine (content cluster 3).
// ---------------------------------------------------------------------------------------
// From our own gold archive + two FRED series (same free, public, no-key pattern already
// used for macro data on this site) this builds one citeable, self-updating comparison page
// + a downloadable dataset:
//
//   gold-vs-stocks-bitcoin.html — what $1,000 became over several time windows, annualised
//                                 returns, a calendar-year "who won" table, and a volatility
//                                 note. Pure returns math — no advice, no recommendation.
//   gold-vs-stocks-bitcoin.csv  — downloadable monthly series (gold, NASDAQ, bitcoin).
//
// Data sources (all monthly closing/latest-of-month values):
//   Gold      — our own archive (public/history/gold.json)
//   Stocks    — NASDAQ Composite, FRED series NASDAQCOM (daily since 5 Feb 1971)
//   Bitcoin   — Coinbase Bitcoin, FRED series CBBTCUSD (daily since ~2014)
// FRED discontinued Wilshire 5000 (WILL5000IND) in June 2024, so NASDAQ Composite is used
// as the long-history US stock proxy — labelled explicitly as such throughout (it is a
// tech-weighted index, not the broad market). None of the three series include
// dividends/yield, so this is a consistent, honest price-only comparison across all three.
//
// Rebuilt daily by the market-recap Action. Factual only — historical returns, no forecasts.
//
//   DATA_DIR=./data HIST_FILE=./public/history/gold.json OUT_DIR=. node build-comparison-page.mjs
// ---------------------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';

const DATA = process.env.DATA_DIR || './data';
const HIST = process.env.HIST_FILE || './public/history/gold.json';
const OUT = process.env.OUT_DIR || '.';
const SITE = 'https://preciousmetalscharts.com';
const LIVE = 'https://live.preciousmetalscharts.com';

async function tryJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }
async function fredCSV(id) {
  try {
    const out = [];
    for (const line of (await readFile(`${DATA}/macro/${id}.csv`, 'utf8')).split('\n').slice(1)) {
      const [d, v] = line.split(','); if (!d) continue;
      const n = Number(v); if (Number.isFinite(n) && n > 0) out.push([d.trim(), n]);
    }
    return out.length ? out : null;
  } catch { return null; }
}

const snap = await tryJSON(`${DATA}/prices.json`);
const histRaw = await tryJSON(HIST);
const goldDaily = (histRaw?.points || histRaw || []).filter((p) => Array.isArray(p) && p[1] > 0);
const nasdaqDaily = await fredCSV('NASDAQCOM');
const btcDaily = await fredCSV('CBBTCUSD');
if (goldDaily.length < 100) { console.error('gold archive missing/short: ' + HIST); process.exit(1); }
if (!nasdaqDaily) { console.error('NASDAQCOM.csv missing — skipping comparison page'); process.exit(1); }
if (!btcDaily) { console.error('CBBTCUSD.csv missing — skipping comparison page'); process.exit(1); }

const refDate = new Date(snap && !isNaN(Date.parse(snap.updatedAt)) ? snap.updatedAt : Date.now());
if (Date.now() - refDate.getTime() > 36 * 3600 * 1000) console.error(`WARNING: prices.json is stale (updatedAt=${refDate.toISOString()}) — 'today' framing on this page may be misleading until the server cron recovers.`);
const todayISO = refDate.toISOString().slice(0, 10);
const niceToday = refDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const fmtUSD = (v, dp = 0) => v == null ? '—' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const sp = (n, dp = 1) => n == null ? '—' : (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(dp) + '%';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const niceM = (ym) => new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

// ---- resample any daily/mixed series to "last value seen in each calendar month" ----
function toMonthly(points) {
  const map = new Map(); // 'YYYY-MM' -> latest value seen for that month (points assumed ascending)
  for (const [d, v] of points) map.set(d.slice(0, 7), v);
  return map;
}
const goldM = toMonthly(goldDaily);
const nasdaqM = toMonthly(nasdaqDaily);
const btcM = toMonthly(btcDaily);
if (snap?.metals?.gold?.price) goldM.set(todayISO.slice(0, 7), snap.metals.gold.price); // keep gold current between archive refreshes

function monthsBack(n) {
  const d = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - n, 1));
  return d.toISOString().slice(0, 7);
}
function nearestKey(map, ym, maxBackMonths = 3) {
  for (let i = 0; i <= maxBackMonths; i++) {
    const d = new Date(ym + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - i);
    const k = d.toISOString().slice(0, 7);
    if (map.has(k)) return k;
  }
  return null;
}
const nowKey = { gold: nearestKey(goldM, todayISO.slice(0, 7)), nasdaq: nearestKey(nasdaqM, todayISO.slice(0, 7)), btc: nearestKey(btcM, todayISO.slice(0, 7)) };
const now = { gold: goldM.get(nowKey.gold), nasdaq: nasdaqM.get(nowKey.nasdaq), btc: btcM.get(nowKey.btc) };

// earliest common month for gold+nasdaq (~1971), and earliest bitcoin month
const goldNasdaqStart = [...goldM.keys()].filter((k) => nasdaqM.has(k)).sort()[0];
const btcStart = [...btcM.keys()].sort()[0];

const yearsBetween = (a, b) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return ((yb - ya) * 12 + (mb - ma)) / 12; };

function bucket(label, startKey) {
  if (!startKey) return null;
  const g0 = nearestKey(goldM, startKey), n0 = nearestKey(nasdaqM, startKey), b0 = nearestKey(btcM, startKey);
  const years = yearsBetween(startKey, nowKey.gold);
  const row = { label, startKey, years };
  if (g0) { const v = goldM.get(g0); row.gold = { ret: (now.gold - v) / v * 100, cagr: (Math.pow(now.gold / v, 1 / years) - 1) * 100, x: now.gold / v }; }
  if (n0) { const v = nasdaqM.get(n0); row.nasdaq = { ret: (now.nasdaq - v) / v * 100, cagr: (Math.pow(now.nasdaq / v, 1 / years) - 1) * 100, x: now.nasdaq / v }; }
  if (b0) { const v = btcM.get(b0); row.btc = { ret: (now.btc - v) / v * 100, cagr: (Math.pow(now.btc / v, 1 / years) - 1) * 100, x: now.btc / v }; }
  return row;
}

const buckets = [
  bucket('5 years', monthsBack(60)),
  bucket('10 years', monthsBack(120)),
  bucket('20 years', monthsBack(240)),
  bucket(`Since bitcoin's price history began (${niceM(btcStart)})`, btcStart),
  bucket(`Since ${goldNasdaqStart.slice(0, 4)} (as far back as our data + NASDAQ go)`, goldNasdaqStart),
].filter(Boolean);

// ---- calendar-year "who won" table (years where all three have data) ----
const years = [];
for (let y = Number(btcStart.slice(0, 4)); y <= refDate.getUTCFullYear(); y++) {
  // Calendar-year convention: prior-December close → December close. Using
  // `${y}-01` here would take the END-of-January value (toMonthly keeps the
  // last value per month), silently dropping January from every year's return.
  const prevDec = `${y - 1}-12`;
  const startK = nearestKey(goldM, prevDec) && nearestKey(nasdaqM, prevDec) && nearestKey(btcM, prevDec) ? prevDec : null;
  if (!startK) continue;
  const isCurrentYear = y === refDate.getUTCFullYear();
  const endK = isCurrentYear ? todayISO.slice(0, 7) : `${y}-12`;
  const g0 = nearestKey(goldM, startK), n0 = nearestKey(nasdaqM, startK), b0 = nearestKey(btcM, startK);
  const g1 = nearestKey(goldM, endK), n1 = nearestKey(nasdaqM, endK), b1 = nearestKey(btcM, endK);
  if (!(g0 && n0 && b0 && g1 && n1 && b1)) continue;
  const gr = (goldM.get(g1) - goldM.get(g0)) / goldM.get(g0) * 100;
  const nr = (nasdaqM.get(n1) - nasdaqM.get(n0)) / nasdaqM.get(n0) * 100;
  const br = (btcM.get(b1) - btcM.get(b0)) / btcM.get(b0) * 100;
  const best = Math.max(gr, nr, br);
  years.push({ y, ytd: isCurrentYear, gold: gr, nasdaq: nr, btc: br, winner: best === gr ? 'gold' : (best === nr ? 'nasdaq' : 'btc') });
}
const recentYears = years.slice(-12);

// ---- annualised volatility (stdev of monthly log returns * sqrt12), since bitcoin data began ----
function volatility(map, fromKey) {
  const keys = [...map.keys()].filter((k) => k >= fromKey && k <= nowKey.gold).sort();
  const rets = [];
  for (let i = 1; i < keys.length; i++) rets.push(Math.log(map.get(keys[i]) / map.get(keys[i - 1])));
  if (rets.length < 6) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(12) * 100;
}
const vol = { gold: volatility(goldM, btcStart), nasdaq: volatility(nasdaqM, btcStart), btc: volatility(btcM, btcStart) };

// ---- headline (10y bucket if available, else the longest common one) ----
const headline = buckets.find((b) => b.label === '10 years' && b.gold && b.nasdaq && b.btc) || buckets.find((b) => b.gold && b.nasdaq && b.btc) || buckets[0];
const hlYears = Math.round(headline.years);
const answer = `Over the past ${hlYears} years, $1,000 in gold would now be worth about ${fmtUSD(1000 * headline.gold.x)}` +
  (headline.nasdaq ? `; the same in the NASDAQ Composite would be about ${fmtUSD(1000 * headline.nasdaq.x)}` : '') +
  (headline.btc ? `; and in Bitcoin, about ${fmtUSD(1000 * headline.btc.x)}` : '') +
  `. All three are pure price returns — none include dividends or yield.`;

// ---- render ----
const url = `${SITE}/gold-vs-stocks-bitcoin`;
const title = 'Gold vs. Stocks vs. Bitcoin: How They’ve Actually Performed';
const descr = `What $1,000 in gold, the NASDAQ Composite and Bitcoin actually became over 5, 10, 20 and ${Math.round(buckets[buckets.length - 1].years)} years — annualised returns, a year-by-year comparison and volatility, updated daily from our own archive and FRED.`;

const bucketRows = buckets.map((b) => `<tr>
  <td>${esc(b.label)}</td>
  <td class="n">${b.gold ? fmtUSD(1000 * b.gold.x) + ` <span class="mut">(${sp(b.gold.ret, 0)})</span>` : '—'}</td>
  <td class="n">${b.nasdaq ? fmtUSD(1000 * b.nasdaq.x) + ` <span class="mut">(${sp(b.nasdaq.ret, 0)})</span>` : '—'}</td>
  <td class="n">${b.btc ? fmtUSD(1000 * b.btc.x) + ` <span class="mut">(${sp(b.btc.ret, 0)})</span>` : '—'}</td>
</tr>`).join('\n    ');

const cagrRows = buckets.map((b) => `<tr>
  <td>${esc(b.label)} <span class="mut">(${b.years.toFixed(1)} yr)</span></td>
  <td class="n">${b.gold ? sp(b.gold.cagr) : '—'}</td>
  <td class="n">${b.nasdaq ? sp(b.nasdaq.cagr) : '—'}</td>
  <td class="n">${b.btc ? sp(b.btc.cagr) : '—'}</td>
</tr>`).join('\n    ');

const yearRows = recentYears.map((r) => {
  const cell = (v, isWinner) => `<td class="n">${isWinner ? '<b>' : ''}${sp(v, 0)}${isWinner ? '</b>' : ''}</td>`;
  return `<tr><td>${r.y}${r.ytd ? ' <span class="mut">(YTD)</span>' : ''}</td>${cell(r.gold, r.winner === 'gold')}${cell(r.nasdaq, r.winner === 'nasdaq')}${cell(r.btc, r.winner === 'btc')}</tr>`;
}).join('\n    ');
const winCounts = recentYears.reduce((a, r) => { a[r.winner]++; return a; }, { gold: 0, nasdaq: 0, btc: 0 });

const faq = [
  ['Has gold outperformed the stock market?', `It depends entirely on the period you pick. Over the past ${hlYears} years, gold turned $1,000 into about ${fmtUSD(1000 * headline.gold.x)} versus about ${fmtUSD(1000 * headline.nasdaq.x)} in the NASDAQ Composite. Over other windows the ranking flips — see the full table above and the year-by-year comparison below. Past performance is not a guide to future results.`],
  ['Is gold or Bitcoin more volatile?', vol.btc && vol.gold ? `In this data, Bitcoin's annualised volatility (${vol.btc.toFixed(0)}%) has run several times higher than gold's (${vol.gold.toFixed(0)}%). Higher volatility means larger swings in both directions, not a judgement on either asset.` : `Bitcoin has historically shown substantially higher price volatility than gold. This page shows the measured figures above.`],
  ['Does this include dividends?', `No. All three series here — gold spot, the NASDAQ Composite, and Bitcoin — are price-only. Gold and Bitcoin pay no yield at all, so comparing price-only stock returns keeps the comparison consistent, though it means the stock figures here understate total return (dividends reinvested typically add some return over long periods).`],
  ['Why the NASDAQ Composite and not the S&P 500?', 'The Federal Reserve’s free FRED database — our source for all macro data on this site — discontinued Wilshire 5000 data in June 2024 and only carries S&P 500 data back to 2015, too short for a multi-decade comparison. The NASDAQ Composite has free, public daily data back to February 1971, matching the period since gold was freed from a fixed price. It is a tech-weighted index, not the broad market — worth keeping in mind.'],
];
const faqLD = { '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
const datasetLD = {
  '@type': 'Dataset', name: 'Gold, NASDAQ Composite and Bitcoin — monthly price series', description: `Monthly closing/latest values for gold (USD/oz), the NASDAQ Composite, and Bitcoin (Coinbase, USD), ${goldNasdaqStart}–present.`,
  url, license: 'https://creativecommons.org/licenses/by/4.0/', creator: { '@id': `${SITE}/#org` },
  distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${SITE}/gold-vs-stocks-bitcoin.csv` }],
};

const ld = JSON.stringify({
  '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'preciousmetalscharts', url: `${SITE}/`, logo: `${SITE}/logo.png` },
    { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'preciousmetalscharts', publisher: { '@id': `${SITE}/#org` }, inLanguage: 'en' },
    { '@type': 'Article', '@id': `${url}#article`, headline: title, description: descr, datePublished: '2026-07-03', dateModified: todayISO, author: { '@id': `${SITE}/#org` }, publisher: { '@id': `${SITE}/#org` }, mainEntityOfPage: url },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Gold price', item: `${SITE}/gold-price` },
      { '@type': 'ListItem', position: 3, name: 'Gold vs. stocks vs. Bitcoin', item: url }] },
    faqLD, datasetLD,
  ],
});

const body = `<main class="wrap">
  <article class="doc">
    <h1>Gold vs. stocks vs. Bitcoin: how they've actually performed</h1>
    <p class="answer">${answer}</p>
    <p class="upd">Updated daily · ${niceToday} · gold ~10 min delayed · NASDAQ &amp; Bitcoin from FRED (as of ${niceM(nowKey.nasdaq)} / ${niceM(nowKey.btc)}) · <a href="${LIVE}/" style="color:var(--accent)">live gold price</a></p>

    <h2>What $1,000 became</h2>
    <table class="rec-table"><thead><tr><th>Invested&hellip;</th><th>Gold</th><th>NASDAQ Composite</th><th>Bitcoin</th></tr></thead><tbody>
    ${bucketRows}
    </tbody></table>
    <p class="note"><b>How to read this:</b> figures in parentheses are the total price return over the period. None of the three include dividends or yield — see the methodology note below.</p>

    <h2>Annualised return</h2>
    <table class="rec-table"><thead><tr><th>Period</th><th>Gold</th><th>NASDAQ Composite</th><th>Bitcoin</th></tr></thead><tbody>
    ${cagrRows}
    </tbody></table>

    <h2>Year by year, since Bitcoin has price history</h2>
    <table class="rec-table"><thead><tr><th>Year</th><th>Gold</th><th>NASDAQ Composite</th><th>Bitcoin</th></tr></thead><tbody>
    ${yearRows}
    </tbody></table>
    <p class="rec-table mut" style="border:0;padding:0">Best performer of the year, ${recentYears[0]?.y}&ndash;${recentYears[recentYears.length - 1]?.y}: gold ${winCounts.gold}&times; · NASDAQ Composite ${winCounts.nasdaq}&times; · Bitcoin ${winCounts.btc}&times;.</p>

    <h2>Volatility</h2>
    <p>Annualised volatility since ${niceM(btcStart)} (how much monthly returns have swung, not a forecast): gold <b>${vol.gold ? vol.gold.toFixed(0) + '%': '—'}</b> · NASDAQ Composite <b>${vol.nasdaq ? vol.nasdaq.toFixed(0) + '%' : '—'}</b> · Bitcoin <b>${vol.btc ? vol.btc.toFixed(0) + '%' : '—'}</b>. Higher volatility means larger price swings in both directions.</p>

    <p class="note"><b>Methodology:</b> gold is our own daily/monthly spot archive; the NASDAQ Composite and Bitcoin (Coinbase) series come from the Federal Reserve's public FRED database. All three are price-only — gold and Bitcoin pay no yield, and this comparison does not reinvest NASDAQ dividends, so figures are directly comparable to each other but understate total stock-market return. Precious metals and Bitcoin both carry risk, including loss of principal; Bitcoin in particular has no intrinsic yield and a much shorter price history. This is historical data, not a forecast or a recommendation.</p>
    <a class="dl" href="/gold-vs-stocks-bitcoin.csv" download><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>Download the monthly dataset (CSV)</a>

    <h2>Common questions</h2>
    <div class="faq-grid">
    ${faq.map(([q, a]) => `<article class="qa-card"><h3>${esc(q)}</h3><p>${esc(a)}</p></article>`).join('\n    ')}
    </div>
    <p class="faq-meta">Reviewed by the preciousmetalscharts desk · Updated ${niceToday} · Educational information only — not investment advice.</p>

    <div class="related">
      <a href="/gold-price">Live gold price</a>
      <a href="/gold-all-time-high">Gold all-time highs</a>
      <a href="/gold-price-inflation-adjusted">Gold adjusted for inflation</a>
      <a href="/why-is-gold-moving">Why is gold moving?</a>
      <a href="/ratio">Gold-to-silver ratio</a>
      <a href="/newsletter">Get the recap by email</a>
    </div>
  </article>
</main>`;

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
  <div class="legal"><b>Independent and not affiliated with any dealer or mint.</b> Educational information only — not investment advice. Gold: our own archive. NASDAQ Composite &amp; Bitcoin (Coinbase): FRED (Federal Reserve Bank of St. Louis), public domain.</div>
</div></footer>
<script src="/assets/site.js?v=8" defer></script>
<script>(function(){var sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',moon='<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';var b=document.getElementById("themeBtn");if(b)b.addEventListener("click",function(){var c=document.documentElement.getAttribute("data-theme"),n=c==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",n);document.getElementById("themeIcon").innerHTML=n==="dark"?moon:sun;});})();</script>
</body></html>`;

const html = `<!DOCTYPE html>
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

await writeFile(`${OUT}/gold-vs-stocks-bitcoin.html`, html);

let csv = 'month,gold_usd,nasdaq_composite,bitcoin_usd\n';
const allKeys = [...new Set([...goldM.keys(), ...nasdaqM.keys(), ...btcM.keys()])].sort();
for (const k of allKeys) {
  if (k < goldNasdaqStart) continue;
  csv += `${k},${goldM.has(k) ? goldM.get(k).toFixed(2) : ''},${nasdaqM.has(k) ? nasdaqM.get(k).toFixed(2) : ''},${btcM.has(k) ? btcM.get(k).toFixed(2) : ''}\n`;
}
await writeFile(`${OUT}/gold-vs-stocks-bitcoin.csv`, csv);

console.log(`comparison page: headline ${hlYears}y · gold x${headline.gold.x.toFixed(1)} · nasdaq x${headline.nasdaq ? headline.nasdaq.x.toFixed(1) : '—'} · btc x${headline.btc ? headline.btc.x.toFixed(1) : '—'} · ${recentYears.length} calendar years · vol g/${vol.gold?.toFixed(0)} n/${vol.nasdaq?.toFixed(0)} b/${vol.btc?.toFixed(0)}`);
