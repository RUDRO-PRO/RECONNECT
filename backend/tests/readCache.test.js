const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReadCache } = require('../utils/readCache');
test('server read cache coalesces concurrent misses and invalidation rejects stale fills', async () => {
  const cache = createReadCache(); let resolve, loads = 0;
  const load = () => { loads++; return new Promise(r => { resolve = r; }); };
  const requests = Array.from({ length: 50 }, () => cache.get('public-list', load));
  await Promise.resolve(); assert.equal(loads, 1); resolve(['public']); await Promise.all(requests);
  assert.equal(cache.stats.coalesced, 49); assert.deepEqual(await cache.get('public-list', load), ['public']);
  const stale = cache.get('stale', load); await Promise.resolve(); cache.clear(); resolve(['old']); await stale;
  assert.deepEqual(await cache.get('stale', async () => ['new']), ['new']);
  await assert.rejects(cache.get('failure', async () => { throw Error('unavailable'); }));
  assert.deepEqual(await cache.get('failure', async () => ['recovered']), ['recovered']);
});
