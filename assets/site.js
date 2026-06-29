// site.js — shared header enhancement (mobile hamburger menu) for all pages.
// Builds a hamburger button + dropdown that clones the primary site nav, so the
// pages stay reachable on phones where the top nav is hidden. Works on both the
// current header (.controls) and the older gold-ira header (.util).
(function () {
  var bar = document.querySelector('.topbar-inner .controls')
         || document.querySelector('.topbar-inner .util')
         || document.querySelector('.topbar-inner');
  var src = document.querySelector('.sitenav');
  if (!bar || !src) return;

  var btn = document.createElement('button');
  btn.className = 'navtoggle';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Open menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'mobilemenu');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  bar.appendChild(btn);

  var panel = document.createElement('nav');
  panel.className = 'mobilemenu';
  panel.id = 'mobilemenu';
  panel.setAttribute('aria-label', 'Mobile navigation');
  Array.prototype.forEach.call(src.querySelectorAll('a'), function (a) {
    panel.appendChild(a.cloneNode(true));
  });
  // The "Live" pill is hidden on small screens to keep room for the menu button,
  // so surface the live page inside the mobile menu too.
  if (!panel.querySelector('a[href*="live.preciousmetalscharts.com"]')) {
    var liveItem = document.createElement('a');
    liveItem.href = 'https://live.preciousmetalscharts.com/';
    liveItem.textContent = 'Live prices';
    panel.appendChild(liveItem);
  }
  document.body.appendChild(panel);

  function close() {
    panel.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = panel.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  panel.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
  document.addEventListener('click', function (e) {
    if (panel.classList.contains('open') && !panel.contains(e.target) && !btn.contains(e.target)) close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();

// region tailoring — coarse EU/US/other from the browser timezone (no IP, no cookie).
(function () {
  if (!document.querySelector('[data-region-group],[data-region-only],#regionSeg')) return;
  var KEY = 'pmc_region';
  function detect() {
    try { var s = localStorage.getItem(KEY); if (s) return s; } catch (e) {}
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    if (/^Europe\//.test(tz)) return 'eu';
    if (/^America\//.test(tz)) return 'us';
    return 'intl';
  }
  function apply(r) {
    document.querySelectorAll('[data-region-group]').forEach(function (g) {
      g.classList.toggle('region-on', g.getAttribute('data-region-group').split(',').indexOf(r) >= 0);
    });
    document.querySelectorAll('[data-region-only]').forEach(function (el) {
      el.classList.toggle('region-on', el.getAttribute('data-region-only').split(',').indexOf(r) >= 0);
    });
    var seg = document.getElementById('regionSeg');
    if (seg) Array.prototype.forEach.call(seg.querySelectorAll('[data-region]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-region') === r ? 'true' : 'false');
    });
  }
  apply(detect());
  var seg = document.getElementById('regionSeg');
  if (seg) seg.addEventListener('click', function (e) {
    var b = e.target.closest('[data-region]'); if (!b) return;
    var r = b.getAttribute('data-region');
    try { localStorage.setItem(KEY, r); } catch (e) {}
    apply(r);
  });
})();

// footer trust links — kept consistent across all pages (injected if not already present).
(function () {
  var foot = document.querySelector('footer .foot');
  if (!foot || foot.querySelector('.foot-links')) return;
  var nav = document.createElement('nav');
  nav.className = 'foot-links';
  nav.setAttribute('aria-label', 'Site information');
  nav.innerHTML = '<a href="/about">About</a><a href="/methodology">Methodology</a><a href="/disclaimer">Disclaimer</a><a href="/affiliate-disclosure">Affiliate disclosure</a>';
  var brand = foot.querySelector('.brandline');
  if (brand && brand.nextSibling) foot.insertBefore(nav, brand.nextSibling); else foot.appendChild(nav);
})();

// per-metal price page (gold-price, silver-price, ...) — live price, unit conversions, history chart.
(function () {
  var root = document.querySelector('[data-metal]');
  if (!root) return;
  var metal = root.getAttribute('data-metal'), OZT_G = 31.1034768;
  var cur = 'usd', rate = 1, SYM = { usd: '$', eur: '€' }, lastM = null;
  function money(n) { if (n == null) return '—'; var v = cur === 'eur' ? n * rate : n; return SYM[cur] + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  var set = function (k, v) { document.querySelectorAll('[data-mp="' + k + '"]').forEach(function (e) { e.textContent = v; }); };
  function render() {
    if (!lastM) return; var p = lastM.price;
    set('price', money(p)); set('oz', money(p)); set('g', money(p / OZT_G)); set('kg', money(p / OZT_G * 1000));
    set('ccy', cur.toUpperCase());
    var chg = document.querySelector('[data-mp="change"]');
    if (chg) { var up = (lastM.changePct || 0) >= 0; chg.textContent = (up ? '▲ +' : '▼ ') + Math.abs(lastM.changePct || 0).toFixed(2) + '%'; chg.className = 'c mono ' + (up ? 'up' : 'down'); }
  }
  function paint(snap) {
    var m = snap.metals && snap.metals[metal]; if (!m || m.price == null) return;
    lastM = m; if (snap.fx && snap.fx.eur > 0) rate = snap.fx.eur;
    render();
    var t = new Date(snap.updatedAt), hhmm = isNaN(t.getTime()) ? '' : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    set('fresh', (hhmm ? ('as of ' + hhmm + ' · ') : '') + '~' + (snap.delayedMinutes || 10) + ' min delayed');
  }
  var curSeg = document.getElementById('curSeg');
  if (curSeg) curSeg.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; cur = b.getAttribute('data-cur'); Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-cur') === cur ? 'true' : 'false'); }); render(); });
  function loadPrice() { fetch('/prices.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (s) { if (s) paint(s); }).catch(function () {}); }
  loadPrice(); setInterval(loadPrice, 60000);

  var host = document.getElementById('chartHost'); if (!host) return;
  var label = document.getElementById('chLabel'), HR = { '1m': '1m', '1y': '1y', '5y': '5y', '10y': '10y', 'max': '50y' }, range = '1y';
  function buildPath(v, w, h, pad) { var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), rg = (mx - mn) || 1, n = v.length, X = function (i) { return pad + i / (n - 1) * (w - 2 * pad); }, Y = function (x) { return h - pad - (x - mn) / rg * (h - 2 * pad); }, d = 'M' + X(0).toFixed(1) + ' ' + Y(v[0]).toFixed(1); for (var i = 1; i < n; i++) { var x0 = X(i - 1), y0 = Y(v[i - 1]), x1 = X(i), y1 = Y(v[i]), cx = (x0 + x1) / 2; d += ' C' + cx.toFixed(1) + ' ' + y0.toFixed(1) + ' ' + cx.toFixed(1) + ' ' + y1.toFixed(1) + ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1); } return { d: d, X: X, Y: Y }; }
  function draw(pts) {
    Array.prototype.slice.call(host.querySelectorAll('svg')).forEach(function (e) { e.remove(); });
    if (!pts || pts.length < 2) return;
    var dates = pts.map(function (p) { return p[0]; }), data = pts.map(function (p) { return p[1]; });
    var w = 820, h = 300, pad = 18, p = buildPath(data, w, h, pad), col = 'var(--' + metal + ')', gid = 'mp' + Math.random().toString(36).slice(2, 7), grid = '';
    for (var g = 1; g <= 3; g++) { var gy = pad + g / 4 * (h - 2 * pad); grid += '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + gy + '" y2="' + gy + '" stroke="var(--line)" stroke-width="1"/>'; }
    var area = p.d + ' L' + (w - pad) + ' ' + (h - pad) + ' L' + pad + ' ' + (h - pad) + ' Z';
    host.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="' + metal + ' price history"><defs><linearGradient id="' + gid + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity=".18"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' + grid + '<path d="' + area + '" fill="url(#' + gid + ')"/><path d="' + p.d + '" fill="none" stroke="' + col + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + p.X(data.length - 1).toFixed(1) + '" cy="' + p.Y(data[data.length - 1]).toFixed(1) + '" r="3.5" fill="' + col + '"/><line id="chLine" x1="0" x2="0" y1="' + pad + '" y2="' + (h - pad) + '" stroke="var(--line-strong)" stroke-width="1" opacity="0"/></svg>');
    var svg = host.querySelector('svg'), chLine = host.querySelector('#chLine');
    function mv(ev) { var rect = svg.getBoundingClientRect(), cx = (ev.touches ? ev.touches[0].clientX : ev.clientX), rel = Math.max(0, Math.min(1, (cx - rect.left) / rect.width)), idx = Math.round(rel * (data.length - 1)), vx = p.X(idx), vy = p.Y(data[idx]); chLine.setAttribute('x1', vx); chLine.setAttribute('x2', vx); chLine.setAttribute('opacity', '1'); if (label) { label.style.opacity = '1'; label.style.left = (vx / w * 100) + '%'; label.style.top = (vy / h * 100) + '%'; label.textContent = dates[idx] + ' · ' + money(data[idx]); } }
    function lv() { chLine.setAttribute('opacity', '0'); if (label) label.style.opacity = '0'; }
    svg.addEventListener('mousemove', mv); svg.addEventListener('touchmove', mv, { passive: true }); svg.addEventListener('mouseleave', lv); svg.addEventListener('touchend', lv);
  }
  function loadChart() { var hr = HR[range] || '1y'; fetch('/history/' + metal + '-' + hr + '.json', { cache: 'force-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (f) { if (f && f.points) draw(f.points); }).catch(function () {}); }
  var ranges = document.getElementById('ranges');
  if (ranges) ranges.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); range = b.dataset.r; loadChart(); });
  loadChart();
})();
