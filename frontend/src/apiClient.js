// Session-scoped reads. Mutations invalidate before and after writing so stale in-flight
// reads cannot repopulate the cache. Chat cursors intentionally bypass the TTL.
export function createApiClient(request, getSession = () => '', { ttl = 20000, maxEntries = 100, now = Date.now } = {}) {
  const pending = new Map(), cache = new Map(); let generation = 0, session = getSession();
  const stats = { requests: 0, deduplicated: 0, cacheHits: 0 };
  function clear() { generation++; pending.clear(); cache.clear(); }
  function api(path, options = {}) {
    if (session !== getSession()) { clear(); session = getSession(); }
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET') {
      clear(); stats.requests++;
      return Promise.resolve().then(() => request(path, options)).then(result => { clear(); return result; });
    }
    const parsed = new URL(path, 'http://local'); parsed.searchParams.sort();
    const key = JSON.stringify([session, parsed.pathname + parsed.search]);
    if (pending.has(key)) { stats.deduplicated++; return pending.get(key); }
    const lifetime = options.fresh || /\/(?:messages)(?:\/|$)/.test(parsed.pathname) && !parsed.pathname.endsWith('/conversations') ? 0 : ttl;
    const cached = cache.get(key);
    if (lifetime && cached?.until > now()) { stats.cacheHits++; return Promise.resolve(structuredClone(cached.value)); }
    const version = generation; stats.requests++;
    const { fresh, ...networkOptions } = options;
    const promise = Promise.resolve().then(() => request(path, networkOptions)).then(value => {
      if (lifetime && generation === version) {
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
        cache.set(key, { value: structuredClone(value), until: now() + lifetime });
      }
      return value;
    }).finally(() => { if (pending.get(key) === promise) pending.delete(key); });
    pending.set(key, promise); return promise;
  }
  api.clear = clear; api.stats = stats; return api;
}
