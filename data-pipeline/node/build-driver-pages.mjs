// build-driver-pages.mjs — "Why is <metal> moving today?" driver pages (content cluster 1).
// ---------------------------------------------------------------------------------------
// One evergreen-plus-live page per metal: a server-rendered answer with TODAY's numbers
// (our own prices + FRED macro), a fresh context table, and hand-written factual driver
// education. Rebuilt daily by the market-recap Action, so the page always matches the
// market. Factual only — tendencies and context, never advice or forecasts.
//
//   DATA_DIR=./data OUT_DIR=. node build-driver-pages.mjs
// Reads: prices.json, history/<m>-1y.json, macro/DTWEXBGS.csv, macro/DFII10.csv
// Writes: why-is-<metal>-moving.html (x4)
// ---------------------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';

const DATA = process.env.DATA_DIR || './public';
const OUT = process.env.OUT_DIR || '.';
const SITE = 'https://preciousmetalscharts.com';
const LIVE = 'https://live.preciousmetalscharts.com';

const META = {
  gold: { name: 'Gold', slug: 'gold' },
  silver: { name: 'Silver', slug: 'silver' },
  platinum: { name: 'Platinum', slug: 'platinum' },
  palladium: { name: 'Palladium', slug: 'palladium' },
};
const ALL = ['gold', 'silver', 'platinum', 'palladium'];

async function tryJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }
async function tryCSV(p) {
  try {
    const out = [];
    for (const line of (await readFile(p, 'utf8')).split('\n').slice(1)) {
      const [d, v] = line.split(','); if (!d) continue;
      const n = Number(v); if (Number.isFinite(n)) out.push([d.trim(), n]);
    }
    return out.length ? out : null;
  } catch { return null; }
}

const snap = await tryJSON(`${DATA}/prices.json`);
if (!snap || !snap.metals) { console.error('No prices.json in ' + DATA); process.exit(1); }
const refDate = new Date(!isNaN(Date.parse(snap.updatedAt)) ? snap.updatedAt : Date.now());
if (Date.now() - refDate.getTime() > 36 * 3600 * 1000) console.error(`WARNING: prices.json is stale (updatedAt=${refDate.toISOString()}) — 'today' framing on this page may be misleading until the server cron recovers.`);
const todayISO = refDate.toISOString().slice(0, 10);
const niceToday = refDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const hist = {};
for (const m of ALL) hist[m] = (await tryJSON(`${DATA}/history/${m}-1y.json`))?.points || null;
const dxy = await tryCSV(`${DATA}/macro/DTWEXBGS.csv`);
const real10 = await tryCSV(`${DATA}/macro/DFII10.csv`);

const isoDaysAgo = (n) => { const d = new Date(refDate); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const atOrBefore = (pts, iso) => { if (!pts || !pts.length) return null; let v = null; for (const p of pts) { if (p[0] <= iso) v = p[1]; else break; } return v ?? pts[0][1]; };
const lastVal = (pts) => (pts && pts.length) ? pts[pts.length - 1][1] : null;
const pct = (now, then) => (now != null && then) ? (now - then) / then * 100 : null;

const fmt0 = (v) => v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US');
const fmt2 = (v) => v == null ? '—' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sp = (n, dp = 1) => n == null ? '—' : (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(dp) + '%';
const dirWord = (n, up = 'up', dn = 'down', flat = 'little changed') => n == null ? '' : (Math.abs(n) < 0.05 ? flat : (n > 0 ? up : dn));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- macro context (shared across pages) ----
function macroCtx(series) {
  if (!series) return null;
  const latest = lastVal(series);
  const wkAgo = atOrBefore(series, isoDaysAgo(7));
  return { latest, wkAgo };
}
const dxyC = macroCtx(dxy);
const realC = macroCtx(real10);
const dxyWk = dxyC ? pct(dxyC.latest, dxyC.wkAgo) : null;                       // % change
const realWkPP = (realC && realC.latest != null && realC.wkAgo != null) ? (realC.latest - realC.wkAgo) : null; // percentage points

// gold/silver ratio
const gP = snap.metals.gold?.price, sP = snap.metals.silver?.price;
const ratioNow = (gP && sP) ? gP / sP : null;

// ---- per-metal computed stats ----
function stats(m) {
  const price = snap.metals[m]?.price; if (price == null) return null;
  const dy = hist[m];
  const week = pct(price, atOrBefore(dy, isoDaysAgo(7)));
  const month = pct(price, atOrBefore(dy, isoDaysAgo(30)));
  const yearStart = refDate.getUTCFullYear() + '-01-01';
  const ytdBase = dy ? (dy.find((p) => p[0] >= yearStart)?.[1] ?? null) : null;
  const ytd = pct(price, ytdBase);
  const vals = (dy || []).map((p) => p[1]);
  const hi52 = vals.length ? Math.max(...vals, price) : null;
  const lo52 = vals.length ? Math.min(...vals, price) : null;
  const pos52 = (hi52 != null && hi52 > lo52) ? (price - lo52) / (hi52 - lo52) * 100 : null;
  return { price, day: snap.metals[m].changePct ?? null, week, month, ytd, hi52, lo52, pos52 };
}

// ---- evergreen driver copy (factual, per metal) ----
const DRIVERS = {
  gold: [
    ['Real interest rates', 'Gold pays no interest, so its biggest structural competitor is the yield on safe government bonds after inflation — the “real yield”. When real yields fall, the cost of holding gold instead of bonds shrinks, and gold has historically tended to strengthen; when real yields rise, the opposite has tended to happen. The 10-year US real yield (TIPS) is the reference most analysts watch.'],
    ['The US dollar', 'Gold is priced in dollars worldwide. When the dollar weakens, gold becomes cheaper for buyers in other currencies and the dollar price often firms; a stronger dollar tends to weigh on it. The broad dollar index shown above is the quickest gauge of this force on any given day.'],
    ['Central-bank buying', 'Central banks have been large net buyers of gold since 2010, and purchases accelerated sharply after 2022 as reserve managers diversified away from currency assets. This demand is slow-moving but persistent — it shows up over quarters, not hours, and has been one of the defining forces of the current bull market.'],
    ['Safe-haven demand', 'Geopolitical shocks, banking stress and equity-market turmoil push investors toward assets with no counterparty risk. These flows can move gold several percent in a day, but they also fade when calm returns — which is why news-driven spikes often partially retrace.'],
    ['Investment flows and physical demand', 'Gold ETFs let large investors move in and out quickly, amplifying trends in both directions. Underneath sits steadier physical demand — jewellery (led by India and China), bars and coins — which tends to respond to price levels rather than drive them day to day.'],
  ],
  silver: [
    ['Gold sets the direction', 'Silver trades first and foremost as a precious metal: its daily direction usually follows gold’s. But silver is a far smaller market, so the same flows move it further — it commonly rises and falls roughly 1.5–2× as much as gold in the same session. The gold-to-silver ratio above shows how the two are currently priced against each other.'],
    ['Industrial demand', 'Unlike gold, more than half of silver demand is industrial: solar panels (the fastest-growing use), electronics, EVs and brazing alloys. Strong manufacturing data and solar build-out support silver; recession fears cut into it. This is why silver sometimes decouples from gold when the economic outlook shifts.'],
    ['Supply is inelastic', 'Most silver is mined as a by-product of copper, lead, zinc and gold mines, so higher silver prices do not quickly bring on new supply. When investment and industrial demand rise together, the market can tighten fast — a dynamic behind silver’s historically sharp rallies.'],
    ['The dollar and real yields', 'The same macro forces that move gold — the US dollar and real interest rates — apply to silver, usually with more amplitude. A softer dollar and falling real yields have tended to support it; the reverse has tended to weigh on it.'],
  ],
  platinum: [
    ['Autocatalyst demand', 'Roughly a third of platinum demand goes into catalytic converters, historically concentrated in diesel engines. Vehicle production numbers, emissions rules, and the mix between diesel, petrol and electric vehicles are therefore central to the platinum story.'],
    ['Substitution with palladium', 'Carmakers can partially swap platinum and palladium in petrol-engine catalysts. When palladium became far more expensive than platinum, manufacturers began substituting platinum in — a slow-moving source of demand that continues to rebalance the two markets.'],
    ['Concentrated supply', 'Around 70% of mined platinum comes from South Africa, where deep, electricity-intensive mines face recurring power and cost pressures. Supply disruptions there can move the price quickly, because there are few alternative sources.'],
    ['Hydrogen and new uses', 'Platinum is the key catalyst in hydrogen fuel cells and electrolysers. This demand is still small, but it is the main long-term growth story analysts watch — and headlines around hydrogen policy can move sentiment.'],
    ['Macro forces', 'As a dollar-priced precious metal, platinum also responds to the US dollar and broad risk appetite, though its industrial side usually dominates. It has traded at a wide discount to gold for years — a gap many pages on this site let you track.'],
  ],
  palladium: [
    ['Petrol autocatalysts', 'Palladium’s dominant use — around 80% of demand — is catalytic converters for petrol engines. Global car production, emissions standards and engine mix drive the market more than anything else.'],
    ['The EV transition', 'Battery-electric vehicles need no catalytic converter, so the long-run growth of EVs is the central structural question for palladium demand. Hybrid vehicles, however, still use palladium-loaded catalysts — the pace of each technology matters.'],
    ['Russian and South African supply', 'Russia (Norilsk) and South Africa together produce most of the world’s palladium. Sanctions risk, mine economics and power problems in either country can tighten supply expectations quickly.'],
    ['Substitution back to platinum', 'After palladium’s 2019–2022 price spike, carmakers began substituting cheaper platinum into petrol catalysts. That substitution works against palladium demand and is part of why the price has retreated from its records.'],
    ['A small, volatile market', 'Palladium is the smallest of the four major precious-metals markets, so modest flows produce large price swings. Sharp daily moves are common and often reflect positioning rather than fundamental news.'],
  ],
};

const FAQS = {
  gold: [
    ['What makes the gold price go up?', 'The strongest short-term forces are falling real interest rates, a weakening US dollar and safe-haven demand during market stress. Longer term, central-bank buying and investment flows matter most. No single factor works in isolation — big moves usually combine several.'],
    ['Does gold rise when the dollar falls?', 'Often, yes. Gold is priced in dollars, so a weaker dollar makes it cheaper in other currencies and tends to lift the dollar price. The relationship is a tendency, not a rule — in strong risk-off episodes both can rise together.'],
    ['Who sets the gold price?', 'No one sets it. The spot price emerges continuously from global trading — futures on COMEX, the London over-the-counter market and other venues. Twice a day the LBMA auction produces a reference “fix” used in contracts, but the market itself trades around the clock during the week.'],
  ],
  silver: [
    ['Why is silver more volatile than gold?', 'The silver market is far smaller than gold’s, so the same amount of buying or selling moves the price further. Silver commonly moves 1.5–2 times as much as gold in the same session, in both directions.'],
    ['Does silver follow gold?', 'Usually. As a precious metal it takes its daily direction from gold, but its large industrial side — over half of demand — means it can decouple when the economic outlook changes sharply.'],
    ['What is silver used for?', 'Solar panels, electronics, EVs, brazing and soldering, medicine, jewellery, and coins and bars. Solar is the fastest-growing use and now a significant share of total demand — a key reason industrial data moves the silver price.'],
  ],
  platinum: [
    ['What drives the platinum price?', 'Autocatalyst demand (especially diesel), the pace of substitution between platinum and palladium in petrol catalysts, concentrated South African supply, and — increasingly — the hydrogen economy, where platinum is the key catalyst.'],
    ['Why is platinum cheaper than gold?', 'It was not always — platinum traded above gold for most of 1987–2011. Diesel’s decline after 2015 cut its biggest demand source while gold benefited from central-bank buying and investment demand, opening today’s wide gap.'],
    ['Where does platinum come from?', 'About 70% of mined supply comes from South Africa, with Russia and Zimbabwe most of the rest. Recycling of old autocatalysts is the other significant source. This concentration makes supply disruptions a recurring price driver.'],
  ],
  palladium: [
    ['What drives the palladium price?', 'Mostly petrol-engine autocatalyst demand — around 80% of the market — set against concentrated supply from Russia and South Africa. Substitution toward cheaper platinum and the growth of EVs are the big structural forces.'],
    ['Why did palladium prices swing so much?', 'A small market met a decade of tightening emissions rules, pushing palladium from under $500 in 2016 to over $3,000 in 2022 — before substitution and the EV transition brought it back down. Small markets produce large swings.'],
    ['Do electric vehicles affect palladium?', 'Yes — battery-electric vehicles need no catalytic converter, so EV growth reduces future palladium demand. Hybrids still use palladium catalysts, so the pace of full electrification is the number the market watches.'],
  ],
};

// ---- page renderer ----
function render(m) {
  const s = stats(m); if (!s) return null;
  const Name = META[m].name;
  const url = `${SITE}/why-is-${m}-moving`;
  const other = ALL.filter((x) => x !== m);

  const dayW = dirWord(s.day, 'up', 'down');
  const weekW = dirWord(s.week, 'gained', 'lost', 'held roughly flat');
  // s.day can be null right after a cron restart (no baseline yet) — dirWord(null)
  // returns '' and Math.abs(null) coerces to 0, which used to render a fabricated
  // "0.0%" instead of honestly omitting the day-change clause.
  const dayClause = s.day == null ? '' : (dayW === 'little changed' ? 'little changed' : `${dayW} ${Math.abs(s.day).toFixed(1)}%`);

  // ---- the daily-baked answer (~55-70 words) ----
  let answer = `${Name} is trading around ${fmt2(s.price)} per troy ounce${dayClause ? ` — ${dayClause} on the day` : ''}`;
  if (s.week != null) answer += `, and it has ${weekW === 'held roughly flat' ? weekW : `${weekW} ${Math.abs(s.week).toFixed(1)}%`} over the past week`;
  answer += '.';
  const dxyPhrase = dxyWk == null ? '' : (Math.abs(dxyWk) < 0.05 ? 'about flat' : `${dxyWk > 0 ? 'up' : 'down'} ${Math.abs(dxyWk).toFixed(1)}%`) + ' this week';
  if (dxyC && dxyWk != null && realC && realWkPP != null && (m === 'gold' || m === 'silver')) {
    answer += ` Two macro forces frame the move: the broad US dollar index is ${dxyPhrase}, and 10-year real yields sit at ${realC.latest.toFixed(2)}% (${realWkPP >= 0 ? '+' : '−'}${Math.abs(realWkPP).toFixed(2)} pt on the week).`;
  } else if (dxyC && dxyWk != null) {
    answer += ` The broad US dollar index — a headwind or tailwind for all dollar-priced metals — is ${dxyPhrase}.`;
  }

  // ---- context table rows ----
  const rows = [
    [`${Name} — today`, sp(s.day, 2)],
    [`${Name} — past week`, sp(s.week)],
    [`${Name} — past month`, sp(s.month)],
    [`${Name} — this year (YTD)`, sp(s.ytd)],
    [`Position in 52-week range`, s.pos52 == null ? '—' : `${Math.round(s.pos52)}% <span class="mut">(low ${fmt0(s.lo52)} – high ${fmt0(s.hi52)})</span>`],
  ];
  if (dxyC) rows.push([`US dollar index (broad) — week`, `${sp(dxyWk)} <span class="mut">(level ${dxyC.latest.toFixed(1)})</span>`]);
  if (realC) rows.push([`10-yr US real yield — week`, `${realWkPP == null ? '—' : (realWkPP >= 0 ? '+' : '−') + Math.abs(realWkPP).toFixed(2) + ' pt'} <span class="mut">(now ${realC.latest.toFixed(2)}%)</span>`]);
  if (ratioNow && (m === 'gold' || m === 'silver')) rows.push([`Gold-to-silver ratio`, `${ratioNow.toFixed(1)} <span class="mut">(<a href="/ratio">what this means</a>)</span>`]);

  const table = `<table class="ctx-table"><tbody>${rows.map(([k, v]) => `<tr><th>${k}</th><td class="n">${v}</td></tr>`).join('')}</tbody></table>`;

  const driversHtml = DRIVERS[m].map(([h, p], i) => `<article class="drv"><h3><span class="dn">${i + 1}</span>${h}</h3><p>${p}</p></article>`).join('\n');

  const faq = FAQS[m];
  const faqHtml = faq.map(([q, a]) => `<article class="qa-card"><h3>${esc(q)}</h3><p>${esc(a)}</p></article>`).join('\n');
  const faqLD = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });

  const descr = `${Name} is ${dayClause || 'trading'} today at ${fmt0(s.price)}. See the forces behind the move — updated daily — and a plain-language guide to what actually drives the ${m} price.`;

  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'preciousmetalscharts', url: `${SITE}/`, logo: `${SITE}/logo.png` },
      { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'preciousmetalscharts', publisher: { '@id': `${SITE}/#org` }, inLanguage: 'en' },
      { '@type': 'Article', '@id': `${url}#article`, headline: `Why is the ${m} price moving today?`, description: descr, datePublished: '2026-06-30', dateModified: todayISO, author: { '@id': `${SITE}/#org` }, publisher: { '@id': `${SITE}/#org` }, mainEntityOfPage: url },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: `${Name} price`, item: `${SITE}/${m}-price` },
        { '@type': 'ListItem', position: 3, name: `Why is ${m} moving?`, item: url }] },
    ],
  });

  return `<!DOCTYPE html>
<html lang="en" data-theme="light" data-currency="usd">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Why Is ${Name} Moving Today? ${Name} Price Drivers Explained | preciousmetalscharts</title>
<meta name="description" content="${esc(descr)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${url}">
<meta name="author" content="preciousmetalscharts">
<meta property="og:type" content="article"><meta property="og:site_name" content="preciousmetalscharts">
<meta property="og:title" content="Why is ${m} moving today?"><meta property="og:description" content="${esc(descr)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/og-cover.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${ld}</script>
<script type="application/ld+json">${faqLD}</script>
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/assets/site.css?v=11">
<style>
.answer{font-size:16px;line-height:1.65;background:var(--surface-2);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--radius-sm);padding:14px 17px;margin:4px 0 6px;}
.upd{font-size:12px;color:var(--faint);margin:0 0 18px;}
.ctx-table{width:100%;border-collapse:collapse;margin:4px 0 6px;font-size:14.5px;}
.ctx-table th,.ctx-table td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);font-weight:400;}
.ctx-table td.n{text-align:right;font-family:var(--font-mono);}
.ctx-table tr:last-child th,.ctx-table tr:last-child td{border-bottom:0;}
.ctx-table .mut{color:var(--muted);font-size:12px;} .ctx-table a{color:var(--accent);}
.drv{margin:0 0 18px;} .drv h3{font-family:var(--font-display);font-weight:600;font-size:17px;letter-spacing:-.01em;margin:0 0 6px;display:flex;align-items:center;gap:10px;}
.drv .dn{flex:none;width:24px;height:24px;border-radius:7px;background:var(--accent-soft);color:var(--accent);font-family:var(--font-mono);font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;}
.drv p{margin:0;color:var(--muted);font-size:14.5px;line-height:1.68;}
.tend{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-sm);padding:13px 16px;font-size:13.5px;color:var(--muted);line-height:1.6;margin:14px 0 0;}
.tend b{color:var(--ink);}
</style>
</head>
<body>
<header class="topbar"><div class="wrap topbar-inner">
  <a class="logo" href="/" aria-label="preciousmetalscharts home"><svg class="logo-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="none" stroke="var(--line-strong)"/><path d="M8 22.5 L14 16 L18.5 19.5 L26 10" fill="none" stroke="var(--accent)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><rect x="23.4" y="7.4" width="5.2" height="5.2" rx="1.3" fill="var(--accent)"/><line x1="8" y1="26.4" x2="26" y2="26.4" stroke="var(--faint)" stroke-width="1.4" stroke-linecap="round" opacity=".55"/></svg><span class="wordmark"><span class="a">preciousmetals</span><span class="b">charts</span></span></a>
  <nav class="sitenav" aria-label="Primary"><a href="/">Charts</a><a href="/ratio">Ratio</a><a href="/market-recap">Recap</a><a href="/calculators">Calculator</a><a href="/buy">Buy</a><a href="gold-ira.html" data-region-only="us">Gold&nbsp;IRA</a></nav>
  <div class="spacer"></div><div class="controls"><a class="livelink" href="${LIVE}/" title="Live prices"><span class="livedot"></span>Live</a><button class="iconbtn" id="themeBtn" aria-label="Toggle dark mode"><svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button></div>
</div></header>

<main class="wrap">
  <article class="doc">
    <h1>Why is the ${m} price moving today?</h1>
    <p class="answer" id="dAnswer">${answer}</p>
    <p class="upd">Updated daily · last build ${niceToday} · spot ~10 min delayed · <a href="${LIVE}/" style="color:var(--accent)">live prices</a></p>

    <h2>Today's context, in numbers</h2>
    ${table}
    <p class="tend"><b>How to read this:</b> a softer dollar and falling real yields have historically <i>tended</i> to support dollar-priced metals, and the reverse has tended to weigh on them — but these are tendencies, not rules, and any single day can break them. We show the forces; we don't make forecasts.</p>

    <h2>What actually drives the ${m} price</h2>
    ${driversHtml}

    <h2>Common questions</h2>
    <div class="faq-grid">
${faqHtml}
    </div>
    <p class="faq-meta">Reviewed by the preciousmetalscharts desk · Updated ${niceToday} · Educational information only — not investment advice.</p>

    <div class="related">
      <a href="/${m}-price">Live ${m} price</a>
      ${(m === 'gold' || m === 'silver') ? '<a href="/ratio">Gold-to-silver ratio</a>' : ''}
      ${m === 'gold' ? '<a href="/gold-all-time-high">Gold all-time highs</a><a href="/gold-price-inflation-adjusted">Adjusted for inflation</a><a href="/gold-vs-stocks-bitcoin">Gold vs stocks vs bitcoin</a>' : ''}
      <a href="/market-recap">Weekly market recap</a>
      <a href="/${m === 'gold' || m === 'silver' ? m + '-price-history' : 'gold-price-history'}">Price history</a>
      ${other.map((o) => `<a href="/why-is-${o}-moving">Why is ${o} moving?</a>`).join('')}
      <a href="/newsletter">Get this as an email</a>
    </div>
  </article>
</main>

<footer><div class="wrap foot">
  <div class="brandline"><svg class="logo-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="none" stroke="var(--line-strong)"/><path d="M8 22.5 L14 16 L18.5 19.5 L26 10" stroke="var(--accent)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><rect x="23.4" y="7.4" width="5.2" height="5.2" rx="1.3" fill="var(--accent)"/></svg><span class="wordmark"><span class="a">preciousmetals</span><span class="b">charts</span></span></div>
  <nav class="foot-links" aria-label="Site information"><a href="/about">About</a><a href="/methodology">Methodology</a><a href="/privacy">Privacy</a><a href="/disclaimer">Disclaimer</a><a href="/affiliate-disclosure">Affiliate disclosure</a></nav>
  <div class="legal"><b>Independent and not affiliated with any dealer or mint.</b> Educational information only — not investment advice. Macro data: FRED (Federal Reserve Bank of St. Louis), public domain.</div>
</div></footer>
<script src="/assets/site.js?v=8" defer></script>
<script>(function(){var sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',moon='<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';var b=document.getElementById("themeBtn");if(b)b.addEventListener("click",function(){var c=document.documentElement.getAttribute("data-theme"),n=c==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",n);document.getElementById("themeIcon").innerHTML=n==="dark"?moon:sun;});})();</script>
</body></html>`;
}

let n = 0;
for (const m of ALL) {
  const html = render(m);
  if (!html) { console.warn(`skip ${m} — no price`); continue; }
  await writeFile(`${OUT}/why-is-${m}-moving.html`, html);
  n++;
}
console.log(`driver pages: ${n} written (ref ${todayISO})`);
