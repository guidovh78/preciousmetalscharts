// build-coin-pages.mjs — generate server-rendered bullion-coin price / melt-value pages.
// ---------------------------------------------------------------------------------------
// Each page's ORIGINAL data point is the coin's live melt value = its fine-metal content ×
// the live spot price (baked at build time for crawlers, then hydrated live from prices.json
// for visitors). Specs are factual public data. Premiums are described generally and labelled
// illustrative — we publish NO invented dealer figures (project hard rule). Factual, not advice.
//
//   DATA_DIR=./data OUT_DIR=./out node build-coin-pages.mjs
// ---------------------------------------------------------------------------------------

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const DATA = process.env.DATA_DIR || './data';
const OUT = process.env.OUT_DIR || './out';
const SITE = 'https://preciousmetalscharts.com';
const LIVE = 'https://live.preciousmetalscharts.com';

const METAL = { gold: { name: 'Gold', sym: 'XAU', color: '#C19A2E' }, silver: { name: 'Silver', sym: 'XAG', color: '#8C9298' } };

// Coin specs — public, factual. content = fine troy oz of the precious metal; gross = total grams.
const COINS = [
  { slug: 'american-gold-eagle-price', name: 'American Gold Eagle', metal: 'gold', content: 1.0, fineness: '0.9167 (22k)', gross: '33.93 g', country: 'United States', since: 1986, sizes: '1, 1/2, 1/4, 1/10 oz' },
  { slug: 'american-gold-buffalo-price', name: 'American Gold Buffalo', metal: 'gold', content: 1.0, fineness: '0.9999 (24k)', gross: '31.10 g', country: 'United States', since: 2006, sizes: '1 oz' },
  { slug: 'canadian-gold-maple-leaf-price', name: 'Canadian Gold Maple Leaf', metal: 'gold', content: 1.0, fineness: '0.9999 (24k)', gross: '31.10 g', country: 'Canada', since: 1979, sizes: '1, 1/2, 1/4, 1/10, 1/20 oz' },
  { slug: 'krugerrand-price', name: 'South African Krugerrand', metal: 'gold', content: 1.0, fineness: '0.9167 (22k)', gross: '33.93 g', country: 'South Africa', since: 1967, sizes: '1, 1/2, 1/4, 1/10 oz' },
  { slug: 'gold-britannia-price', name: 'British Gold Britannia', metal: 'gold', content: 1.0, fineness: '0.9999 (24k)', gross: '31.10 g', country: 'United Kingdom', since: 1987, sizes: '1, 1/2, 1/4, 1/10 oz' },
  { slug: 'gold-philharmonic-price', name: 'Austrian Gold Philharmonic', metal: 'gold', content: 1.0, fineness: '0.9999 (24k)', gross: '31.10 g', country: 'Austria', since: 1989, sizes: '1, 1/2, 1/4, 1/10 oz' },
  { slug: 'gold-sovereign-price', name: 'Gold Sovereign', metal: 'gold', content: 0.2354, fineness: '0.9167 (22k)', gross: '7.99 g', country: 'United Kingdom', since: 1817, sizes: 'full + half sovereign' },
  { slug: 'american-silver-eagle-price', name: 'American Silver Eagle', metal: 'silver', content: 1.0, fineness: '0.999', gross: '31.10 g', country: 'United States', since: 1986, sizes: '1 oz' },
  { slug: 'canadian-silver-maple-leaf-price', name: 'Canadian Silver Maple Leaf', metal: 'silver', content: 1.0, fineness: '0.9999', gross: '31.10 g', country: 'Canada', since: 1988, sizes: '1 oz' },
  { slug: 'silver-britannia-price', name: 'British Silver Britannia', metal: 'silver', content: 1.0, fineness: '0.999', gross: '31.10 g', country: 'United Kingdom', since: 1997, sizes: '1 oz' },
  { slug: 'silver-philharmonic-price', name: 'Austrian Silver Philharmonic', metal: 'silver', content: 1.0, fineness: '0.999', gross: '31.10 g', country: 'Austria', since: 2008, sizes: '1 oz' },
  { slug: 'silver-krugerrand-price', name: 'South African Silver Krugerrand', metal: 'silver', content: 1.0, fineness: '0.999', gross: '31.10 g', country: 'South Africa', since: 2017, sizes: '1 oz' },
];

async function tryJSON(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }
const snap = await tryJSON(`${DATA}/prices.json`);
if (!snap || !snap.metals) { console.error('No prices.json in ' + DATA); process.exit(1); }
const refDate = new Date(snap.updatedAt && !isNaN(Date.parse(snap.updatedAt)) ? snap.updatedAt : Date.now());
const todayISO = refDate.toISOString().slice(0, 10);
const niceToday = refDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const fmt2 = (n) => n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const header = (m) => `<header class="topbar"><div class="wrap topbar-inner">
  <a class="logo" href="/" aria-label="preciousmetalscharts home"><svg class="logo-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="none" stroke="var(--line-strong)"/><path d="M8 22.5 L14 16 L18.5 19.5 L26 10" fill="none" stroke="var(--accent)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><rect x="23.4" y="7.4" width="5.2" height="5.2" rx="1.3" fill="var(--accent)"/><line x1="8" y1="26.4" x2="26" y2="26.4" stroke="var(--faint)" stroke-width="1.4" stroke-linecap="round" opacity=".55"/></svg><span class="wordmark"><span class="a">preciousmetals</span><span class="b">charts</span></span></a>
  <nav class="sitenav" aria-label="Primary"><a href="/">Charts</a><a href="/ratio">Ratio</a><a href="/market-recap">Recap</a><a href="/calculators">Calculator</a><a href="/buy">Buy</a><a href="gold-ira.html" data-region-only="us">Gold&nbsp;IRA</a></nav>
  <div class="spacer"></div><div class="controls"><a class="livelink" href="${LIVE}/" title="Live prices"><span class="livedot"></span>Live</a><button class="iconbtn" id="themeBtn" aria-label="Toggle dark mode"><svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button></div>
</div></header>`;

const footer = () => `<footer><div class="wrap foot">
  <div class="brandline"><svg class="logo-mark" viewBox="0 0 34 34" fill="none" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="none" stroke="var(--line-strong)"/><path d="M8 22.5 L14 16 L18.5 19.5 L26 10" stroke="var(--accent)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><rect x="23.4" y="7.4" width="5.2" height="5.2" rx="1.3" fill="var(--accent)"/></svg><span class="wordmark"><span class="a">preciousmetals</span><span class="b">charts</span></span></div>
  <nav class="foot-links" aria-label="Site information"><a href="/about">About</a><a href="/methodology">Methodology</a><a href="/disclaimer">Disclaimer</a><a href="/affiliate-disclosure">Affiliate disclosure</a></nav>
  <div class="legal"><b>Independent and not affiliated with any dealer or mint.</b> Educational information only — not investment advice. Melt values are spot × metal content, ~10 minutes delayed; dealers charge a premium. Verify before transacting.</div>
</div></footer>
<script src="/assets/site.js?v=8" defer></script>
<script>(function(){var sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',moon='<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';var b=document.getElementById("themeBtn");if(b)b.addEventListener("click",function(){var c=document.documentElement.getAttribute("data-theme"),n=c==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",n);document.getElementById("themeIcon").innerHTML=n==="dark"?moon:sun;});})();</script>
<script>(function(){function fmt(n){return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
fetch('/prices.json?t='+Date.now()).then(function(r){return r.json();}).then(function(p){
  document.querySelectorAll('[data-melt]').forEach(function(el){var m=el.getAttribute('data-melt'),c=parseFloat(el.getAttribute('data-content'));var px=p.metals&&p.metals[m]&&p.metals[m].price;if(px)el.textContent=fmt(px*c);});
  document.querySelectorAll('[data-spotref]').forEach(function(el){var m=el.getAttribute('data-spotref');var px=p.metals&&p.metals[m]&&p.metals[m].price;if(px)el.textContent=fmt(px);});
}).catch(function(){});})();</script>
</body></html>`;

function meltOf(c) { const px = snap.metals[c.metal]?.price; return px != null ? px * c.content : null; }

function renderCoin(c) {
  const M = METAL[c.metal], Mn = M.name.toLowerCase();
  const spot = snap.metals[c.metal]?.price ?? null;
  const melt = meltOf(c);
  const url = `${SITE}/${c.slug}`;
  const contentTxt = c.content === 1 ? `1 troy ounce of ${Mn}` : `${c.content} troy oz of ${Mn}`;
  const descr = `A ${c.name} contains ${contentTxt} (fineness ${c.fineness}). At the current ${Mn} price its metal is worth about ${fmt2(melt)} — its live melt value. Dealers charge a premium over this. Specs, melt value and how premiums work.`;

  const answer = `A ${c.name} contains <strong>${contentTxt}</strong> (fineness ${c.fineness}, gross weight ${c.gross}). At the current ${Mn} spot price of about <span data-spotref="${c.metal}">${fmt2(spot)}</span> per troy ounce, the metal in one coin is worth about <strong><span data-melt="${c.metal}" data-content="${c.content}">${fmt2(melt)}</span></strong> — its <em>melt value</em>. A dealer's selling price is this melt value <strong>plus a premium</strong> for minting, distribution and margin.`;

  const specRows = [
    ['Metal', M.name], ['Fine metal content', `${c.content} troy oz`], ['Fineness', c.fineness], ['Gross weight', c.gross],
    ['Issuing country', c.country], ['First minted', String(c.since)], ['Sizes available', c.sizes],
  ].map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');

  const faqObj = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
    { '@type': 'Question', name: `How much ${Mn} is in a ${c.name}?`, acceptedAnswer: { '@type': 'Answer', text: `A ${c.name} contains ${contentTxt} (fineness ${c.fineness}), with a gross weight of ${c.gross}.` } },
    { '@type': 'Question', name: `What is a ${c.name} worth?`, acceptedAnswer: { '@type': 'Answer', text: `Its melt value — the value of the metal it contains — is about ${fmt2(melt)} at the current ${Mn} spot price (~10 minutes delayed). Dealers sell it for a premium above this melt value.` } },
    { '@type': 'Question', name: `Why does a ${c.name} cost more than its ${Mn} value?`, acceptedAnswer: { '@type': 'Answer', text: `The difference is the premium — the markup over the metal's melt value covering minting, fabrication, distribution and dealer margin. Premiums are usually higher on smaller coins and on silver, and rise when demand is high.` } },
  ] };

  const others = COINS.filter((x) => x.metal === c.metal && x.slug !== c.slug).slice(0, 5).map((x) => `<a href="/${x.slug}">${x.name}</a>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en" data-theme="light" data-currency="usd">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${c.name} Price &amp; Melt Value (Live) | preciousmetalscharts</title>
<meta name="description" content="${esc(descr)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${url}">
<meta name="author" content="preciousmetalscharts">
<meta property="og:type" content="website"><meta property="og:site_name" content="preciousmetalscharts">
<meta property="og:title" content="${c.name} price &amp; melt value"><meta property="og:description" content="${esc(descr)}"><meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"${SITE}/#org","name":"preciousmetalscharts","url":"${SITE}/","logo":"${SITE}/logo.png"},{"@type":"WebSite","@id":"${SITE}/#website","url":"${SITE}/","name":"preciousmetalscharts","publisher":{"@id":"${SITE}/#org"},"inLanguage":"en"},{"@type":"WebPage","@id":"${url}#webpage","url":"${url}","name":"${c.name} price & melt value","isPartOf":{"@id":"${SITE}/#website"},"dateModified":"${todayISO}","about":"${c.name}"},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},{"@type":"ListItem","position":2,"name":"Coin prices","item":"${SITE}/coin-prices"},{"@type":"ListItem","position":3,"name":"${c.name}","item":"${url}"}]}]}</script>
<script type="application/ld+json">${JSON.stringify(faqObj)}</script>
<link rel="stylesheet" href="/assets/site.css?v=10">
<style>.coin-melt{display:flex;align-items:baseline;gap:10px;margin:8px 0 2px;}.coin-melt .v{font-family:var(--font-mono);font-size:30px;font-weight:600;}.coin-melt .lab{font-size:12px;color:var(--muted);}.spec-table{width:100%;border-collapse:collapse;margin:6px 0;font-size:14.5px;}.spec-table th,.spec-table td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);}.spec-table th{color:var(--muted);font-weight:500;width:46%;}.spec-table td{font-family:var(--font-mono);}.spec-table tr:last-child td,.spec-table tr:last-child th{border-bottom:0;}.answer{font-size:16px;line-height:1.65;background:var(--surface-2);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--radius-sm);padding:13px 16px;margin:4px 0 14px;}</style>
</head>
<body>${header(c.metal)}
<main class="wrap">
  <section class="hero">
    <div class="trustline"><span class="ttag">Independent</span><span>Not a dealer — we sell no metals</span><span class="sep"></span><span>Melt value · ~10 min delayed</span></div>
    <h1 class="lede">${c.name} price</h1>
    <div class="coin-melt"><span class="v" data-melt="${c.metal}" data-content="${c.content}">${fmt2(melt)}</span><span class="lab">live melt value · ${c.content} oz ${Mn} × spot</span></div>
    <div class="mp-meta" style="margin-bottom:10px"><span class="livedot"></span>${M.sym} spot ≈ <span data-spotref="${c.metal}">${fmt2(spot)}</span> / troy oz · as of ${niceToday}</div>
    <p class="answer">${answer}</p>
    <div class="related"><a href="/${c.metal}-price">Live ${c.metal} price</a><a href="/premium-calculator">Premium calculator</a><a href="/coin-prices">All coin prices</a><a href="/buy">Where to buy</a></div>
  </section>

  <section class="sec">
    <div class="sec-head"><span class="sec-num">01</span><h2>${c.name} specifications</h2></div>
    <table class="spec-table"><tbody>${specRows}</tbody></table>
    <p class="sub" style="font-size:12px;color:var(--faint)">Specifications are public mint data. Melt value is the live ${Mn} spot price × the coin's fine-metal content, ~10 minutes delayed.</p>
  </section>

  <section class="sec">
    <div class="sec-head"><span class="sec-num">02</span><h2>What you'll pay over melt value</h2></div>
    <p>A dealer's price is the <strong>melt value plus a premium</strong>. The premium covers minting, fabrication, distribution and dealer margin, and it is <strong>not fixed</strong>: it is usually higher on smaller coins and on silver than gold, varies between products and dealers, and rises when demand is high. We publish no specific dealer figures — to check a real offer, put the price you're quoted into our <a href="/premium-calculator">premium calculator</a> to see the premium over the live ${Mn} price.</p>
  </section>

  <section class="sec">
    <div class="sec-head"><span class="sec-num">03</span><h2>Common questions</h2></div>
    <div class="faq-grid">
      <article class="qa-card"><h3>How much ${Mn} is in a ${c.name}?</h3><p>A ${c.name} contains ${contentTxt} (fineness ${c.fineness}), with a gross weight of ${c.gross}.</p></article>
      <article class="qa-card"><h3>What is a ${c.name} worth?</h3><p>Its melt value is about <span data-melt="${c.metal}" data-content="${c.content}">${fmt2(melt)}</span> at the current ${Mn} spot price (~10 minutes delayed). A dealer sells it for a premium above this melt value.</p></article>
      <article class="qa-card"><h3>Why does a ${c.name} cost more than its ${Mn} value?</h3><p>The difference is the premium — the markup over melt value for minting, distribution and margin. Premiums are usually higher on smaller coins and on silver, and rise when demand is high.</p></article>
    </div>
    <p class="faq-meta">Reviewed by the preciousmetalscharts editorial team · Updated ${niceToday} · Melt value = live spot × metal content. See our <a href="/methodology">methodology</a>.</p>
    ${others ? `<div class="related">${others}</div>` : ''}
  </section>
</main>${footer()}`;
  return html;
}

function renderHub() {
  const url = `${SITE}/coin-prices`;
  const row = (c) => { const M = METAL[c.metal]; const melt = meltOf(c); return `<tr><td><a href="/${c.slug}" style="color:var(--accent);text-decoration:none;font-weight:600;">${c.name}</a></td><td>${M.name}</td><td class="n">${c.content} oz</td><td class="n" data-melt="${c.metal}" data-content="${c.content}">${fmt2(melt)}</td></tr>`; };
  const goldRows = COINS.filter((c) => c.metal === 'gold').map(row).join('');
  const silverRows = COINS.filter((c) => c.metal === 'silver').map(row).join('');
  const descr = `Live melt value of popular gold and silver bullion coins — American Eagle, Krugerrand, Maple Leaf, Britannia, Philharmonic and more. Each coin's metal value at the current spot price, with full specifications.`;
  const faqObj = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
    { '@type': 'Question', name: 'What is a coin’s melt value?', acceptedAnswer: { '@type': 'Answer', text: 'A coin’s melt value is the value of the precious metal it contains: its fine-metal content (in troy ounces) multiplied by the current spot price. Dealers sell coins for a premium above melt value.' } },
    { '@type': 'Question', name: 'Which bullion coin has the lowest premium?', acceptedAnswer: { '@type': 'Answer', text: 'Premiums vary by product, dealer and demand, so there is no fixed answer. Larger coins and gold generally carry lower percentage premiums than small coins and silver. Compare a real quote against melt value with our premium calculator.' } },
  ] };
  return `<!DOCTYPE html>
<html lang="en" data-theme="light" data-currency="usd">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bullion Coin Prices &amp; Melt Values (Live) — Gold &amp; Silver | preciousmetalscharts</title>
<meta name="description" content="${esc(descr)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${url}">
<meta name="author" content="preciousmetalscharts">
<meta property="og:type" content="website"><meta property="og:site_name" content="preciousmetalscharts">
<meta property="og:title" content="Bullion coin prices &amp; melt values"><meta property="og:description" content="${esc(descr)}"><meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"${SITE}/#org","name":"preciousmetalscharts","url":"${SITE}/","logo":"${SITE}/logo.png"},{"@type":"WebSite","@id":"${SITE}/#website","url":"${SITE}/","name":"preciousmetalscharts","publisher":{"@id":"${SITE}/#org"},"inLanguage":"en"},{"@type":"CollectionPage","@id":"${url}#webpage","url":"${url}","name":"Bullion coin prices & melt values","isPartOf":{"@id":"${SITE}/#website"},"dateModified":"${todayISO}"},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},{"@type":"ListItem","position":2,"name":"Coin prices","item":"${url}"}]}]}</script>
<script type="application/ld+json">${JSON.stringify(faqObj)}</script>
<link rel="stylesheet" href="/assets/site.css?v=10">
<style>.coin-table{width:100%;border-collapse:collapse;margin:6px 0;font-size:14.5px;}.coin-table th,.coin-table td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);}.coin-table th.n,.coin-table td.n{text-align:right;font-family:var(--font-mono);}.coin-table thead th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);}.answer{font-size:16px;line-height:1.65;background:var(--surface-2);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--radius-sm);padding:13px 16px;margin:4px 0 14px;}h2.grp{font-family:var(--font-display);font-size:18px;margin:18px 0 4px;}</style>
</head>
<body>${header('gold')}
<main class="wrap">
  <section class="hero">
    <div class="trustline"><span class="ttag">Independent</span><span>Not a dealer — we sell no metals</span><span class="sep"></span><span>Live melt values · ~10 min delayed</span></div>
    <h1 class="lede">Bullion coin prices &amp; melt values</h1>
    <p class="answer">A coin's <strong>melt value</strong> is the worth of the metal it contains — its fine-metal content × the live spot price. The tables below show the live melt value of popular gold and silver coins. Dealers sell each coin for a <strong>premium</strong> above its melt value; check any quote with our <a href="/premium-calculator">premium calculator</a>.</p>
    <div class="related"><a href="/gold-price">Live gold price</a><a href="/silver-price">Live silver price</a><a href="/premium-calculator">Premium calculator</a><a href="/buy">Where to buy</a></div>
  </section>
  <section class="sec">
    <h2 class="grp">Gold coins</h2>
    <table class="coin-table"><thead><tr><th>Coin</th><th>Metal</th><th class="n">Content</th><th class="n">Melt value</th></tr></thead><tbody>${goldRows}</tbody></table>
    <h2 class="grp">Silver coins</h2>
    <table class="coin-table"><thead><tr><th>Coin</th><th>Metal</th><th class="n">Content</th><th class="n">Melt value</th></tr></thead><tbody>${silverRows}</tbody></table>
    <p class="faq-meta">Reviewed by the preciousmetalscharts editorial team · Updated ${niceToday} · Melt value = live spot × fine-metal content, ~10 min delayed. Specs are public mint data. See our <a href="/methodology">methodology</a>.</p>
  </section>
</main>${footer()}`;
}

// ---- main ----
await mkdir(OUT, { recursive: true });
const urls = [];
for (const c of COINS) { await writeFile(`${OUT}/${c.slug}.html`, renderCoin(c)); urls.push(`${SITE}/${c.slug}`); }
await writeFile(`${OUT}/coin-prices.html`, renderHub()); urls.push(`${SITE}/coin-prices`);

const sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
for (const u of urls) { const isHub = u.endsWith('/coin-prices'); sm.push(`  <url><loc>${u}</loc><lastmod>${todayISO}</lastmod><changefreq>daily</changefreq><priority>${isHub ? '0.7' : '0.6'}</priority></url>`); }
sm.push('</urlset>');
await writeFile(`${OUT}/sitemap-coins.xml`, sm.join('\n'));

console.error(`OK coin-pages → ${COINS.length} coins + hub (${urls.length} urls). spot gold=${snap.metals.gold?.price} silver=${snap.metals.silver?.price}`);
