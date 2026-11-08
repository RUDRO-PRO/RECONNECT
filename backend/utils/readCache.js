// Bounded process-local cache; never a substitute for a distributed quota.
function createReadCache({ ttl = 20000, maxEntries = 100, maxBytes = 8 * 1024 * 1024 } = {}) {
  const entries = new Map(), pending = new Map(); let bytes = 0, generation = 0;
  const stats = { hits: 0, coalesced: 0, loads: 0 };
  async function get(key, load) {
    const entry = entries.get(key);
    if (entry?.until > Date.now()) { stats.hits++; return entry.value; }
    if (pending.has(key)) { stats.coalesced++; return pending.get(key); }
    if (entry) { bytes -= entry.bytes; entries.delete(key); }
    const version = generation; stats.loads++;
    const promise = Promise.resolve().then(load).then(value => {
      const size = Buffer.byteLength(JSON.stringify(value));
      if (version === generation && size <= maxBytes) {
        while (entries.size >= maxEntries || bytes + size > maxBytes) { const first = entries.keys().next().value; bytes -= entries.get(first).bytes; entries.delete(first); }
        entries.set(key, { value, until: Date.now() + ttl, bytes: size }); bytes += size;
      }
      return value;
    }).finally(() => { if (pending.get(key) === promise) pending.delete(key); });
    pending.set(key, promise); return promise;
  }
  return { get, stats, clear() { generation++; entries.clear(); pending.clear(); bytes = 0; } };
}
const publicCache = createReadCache();
const cacheHeader = (req, res) => res.set('Cache-Control', req.headers.authorization ? 'private, no-store' : 'public, s-maxage=20, stale-while-revalidate=40');
module.exports = { createReadCache, publicCache, cacheHeader };
