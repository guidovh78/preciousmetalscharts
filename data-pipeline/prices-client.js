// prices-client.js — drop-in for the site (no build step)
// ---------------------------------------------------------------------------
// Reads the cached snapshot (NOT the provider) and updates the UI. Hitting this
// endpoint is free and independent of provider limits — it's your own cache.
//
// Mark up your elements like:
//   <span data-price="gold"></span>          price, currency-formatted
//   <span data-change="gold"></span>         change %, gets .up / .down class
//   <span data-ratio></span>                 gold/silver ratio
//   <span data-freshness></span>             "as of 14:30 · ~10 min delayed"
//   <div  data-attributions></div>           required source credits (footer)
//
// Set SNAPSHOT_URL to your Worker route (e.g. https://prices.yourdomain.com/prices.json)
// or a static /prices.json if you use the GitHub Action path.
// ---------------------------------------------------------------------------

(function () {
  "use strict";
  const SNAPSHOT_URL = "/prices.json";
  const REFRESH_MS = 60_000; // poll your own cache once a minute (free)

  const fmt = (n) =>
    n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function paint(snap) {
    const metals = snap.metals || {};
    for (const metal of ["gold", "silver", "platinum", "palladium"]) {
      const m = metals[metal] || {};
      document.querySelectorAll(`[data-price="${metal}"]`).forEach((el) => { el.textContent = fmt(m.price); });
      document.querySelectorAll(`[data-change="${metal}"]`).forEach((el) => {
        const up = (m.changePct ?? 0) >= 0;
        el.textContent = (up ? "▲ +" : "▼ ") + (m.changePct == null ? "0.00" : Math.abs(m.changePct).toFixed(2)) + "%";
        el.classList.toggle("up", up);
        el.classList.toggle("down", !up);
      });
    }

    // gold/silver ratio
    const g = metals.gold?.price, s = metals.silver?.price;
    document.querySelectorAll("[data-ratio]").forEach((el) => {
      el.textContent = g && s ? (g / s).toFixed(1) : "—";
    });

    // freshness label
    const t = new Date(snap.updatedAt);
    const hhmm = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const label = `as of ${hhmm} · ~${snap.delayedMinutes || 10} min delayed` + (snap.stale ? " · last good data" : "");
    document.querySelectorAll("[data-freshness]").forEach((el) => { el.textContent = label; });

    // required attributions (e.g. goldpricez)
    const credits = snap.attributions || [];
    document.querySelectorAll("[data-attributions]").forEach((box) => {
      box.innerHTML = credits
        .map((a) => `<a href="${a.href}" target="_blank" rel="noopener">${a.text}</a>`)
        .join(" · ");
    });
  }

  async function tick() {
    try {
      const res = await fetch(SNAPSHOT_URL, { cache: "no-store" });
      if (res.ok) paint(await res.json());
    } catch (_) { /* keep last painted values */ }
  }

  tick();
  setInterval(tick, REFRESH_MS);
})();
