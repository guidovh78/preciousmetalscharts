// worker.mjs — Cloudflare Worker (primary, free path)
// ---------------------------------------------------------------------------
// - Cron trigger (every 10 min, see wrangler.toml) refreshes prices into KV.
// - HTTP handler serves the cached snapshot at /prices.json with edge caching,
//   so visitor traffic does NOT translate into provider API calls.
//
// Bind a KV namespace as `PRICES` and put your provider keys in env vars/secrets.
// ---------------------------------------------------------------------------

import { buildSnapshot } from './fetchPrices.mjs';

const SNAPSHOT_KEY = 'snapshot';
const BASELINE_KEY = 'baseline';

async function refresh(env) {
  const [prevRaw, baseRaw] = await Promise.all([
    env.PRICES.get(SNAPSHOT_KEY),
    env.PRICES.get(BASELINE_KEY),
  ]);
  const prev = prevRaw ? JSON.parse(prevRaw) : null;
  const baseline = baseRaw ? JSON.parse(baseRaw) : null;

  const result = await buildSnapshot(env, prev, baseline, {
    crossCheck: (env.CROSS_CHECK === 'true'),
    maxDeviationPct: Number(env.MAX_DEVIATION_PCT || 3),
  });

  if (result.ok) {
    await env.PRICES.put(SNAPSHOT_KEY, JSON.stringify(result.snapshot));
    await env.PRICES.put(BASELINE_KEY, JSON.stringify(result.baseline));
    return result.snapshot;
  }

  // All sources failed: keep serving the previous snapshot, flagged stale.
  if (prev) {
    const stale = { ...prev, stale: true, lastCheckFailedAt: new Date().toISOString() };
    await env.PRICES.put(SNAPSHOT_KEY, JSON.stringify(stale));
    return stale;
  }
  return null;
}

export default {
  // Scheduled: runs on the cron in wrangler.toml (*/10 * * * *)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refresh(env));
  },

  // HTTP: serve the cached snapshot. Edge-cached for 10 min, stale up to 2 min
  // while revalidating, so the origin/KV is hit at most a few times per window.
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/refresh' && request.method === 'POST') {
      // optional manual trigger (protect with a secret in production)
      const snap = await refresh(env);
      return Response.json(snap || { error: 'no data' });
    }

    if (url.pathname === '/prices.json') {
      const cache = caches.default;
      const cacheKey = new Request(url.toString(), request);
      let res = await cache.match(cacheKey);
      if (res) return res;

      const raw = await env.PRICES.get(SNAPSHOT_KEY);
      if (!raw) return new Response(JSON.stringify({ error: 'warming up' }), { status: 503 });

      res = new Response(raw, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, s-maxage=600, stale-while-revalidate=120',
          'access-control-allow-origin': '*',
        },
      });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }

    return new Response('Not found', { status: 404 });
  },
};
