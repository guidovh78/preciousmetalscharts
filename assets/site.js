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
