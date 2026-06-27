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
