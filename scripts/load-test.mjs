// Zero external dependencies. Supply distinct valid sessions via a private JSON token file.
// node scripts/load-test.mjs http://127.0.0.1:5000
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createApiClient } from '../frontend/src/apiClient.js';
const base = (process.argv[2] || process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const users = Number(process.env.LOAD_TEST_USERS || 50), rounds = Number(process.env.LOAD_TEST_ROUNDS || 5);
if (!Number.isInteger(users) || users < 1 || users > 300 || !Number.isInteger(rounds) || rounds < 1 || rounds > 100) throw Error('Invalid users/rounds.');
const tokens = process.env.LOAD_TEST_TOKENS_FILE ? JSON.parse(await readFile(process.env.LOAD_TEST_TOKENS_FILE, 'utf8')) : [];
if (tokens.length < users || new Set(tokens.slice(0, users)).size !== users) throw Error(`Provide ${users} distinct sessions in LOAD_TEST_TOKENS_FILE. Missing auth must not be reported as a passing test.`);
const paths = ['/api/health', '/api/profiles', '/api/auth/me', '/api/messages/conversations'];
const samples = [], errors = [], statusCounts = {};
async function hit(path, token, record = true) {
  const start = performance.now(); let status = 0, bytes = 0, ok = false;
  try {
    const response = await fetch(base + path, { headers: path === '/api/auth/me' || path.startsWith('/api/messages') ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15000) });
    status = response.status; const body = await response.text(); bytes = Buffer.byteLength(body);
    const data = JSON.parse(body);
    ok = response.ok && (path === '/api/health' ? data.services?.database === 'operational' : path === '/api/auth/me' ? Boolean(data.id) : Array.isArray(data));
    if (!ok) throw Error(`HTTP ${status} or invalid response`);
    return data;
  } catch (error) { if (record) errors.push({ path, status, message: error.name === 'TimeoutError' ? 'Timed out' : error.message }); if (!record) throw error; }
  finally { if (record) { statusCounts[status] = (statusCounts[status] || 0) + 1; samples.push({ path, ms: performance.now() - start, bytes, ok }); } }
}
await Promise.all(paths.map(path => hit(path, tokens[0], false)));
const started = performance.now();
await Promise.all(Array.from({ length: users }, async (_, user) => {
  for (let round = 0; round < rounds; round++) await Promise.all(paths.map(path => hit(path, tokens[user])));
}));
const durationMs = performance.now() - started;
const percentile = (values, fraction) => { values.sort((a, b) => a - b); return Number(values[Math.max(0, Math.ceil(values.length * fraction) - 1)].toFixed(2)); };
function summary(values) { return { requests: values.length, p50Ms: percentile(values.map(v => v.ms), .5), p95Ms: percentile(values.map(v => v.ms), .95), errorCount: values.filter(v => !v.ok).length, responseBytes: values.reduce((sum, v) => sum + v.bytes, 0) }; }
const dedup = { logicalCalls: users * 4, networkRequests: 0, inFlightReuses: 0, ttlHits: 0 };
await Promise.all(tokens.slice(0, users).map(async token => {
  const client = createApiClient(async path => { dedup.networkRequests++; return hit('/api' + path, token, false); }, () => token);
  await Promise.all([client('/profiles'), client('/profiles'), client('/profiles')]);
  await client('/profiles'); dedup.inFlightReuses += client.stats.deduplicated; dedup.ttlHits += client.stats.cacheHits;
}));
const report = { generatedAt: new Date().toISOString(), base, virtualUsers: users, rounds, maximumParallelRequests: users * paths.length, durationMs: Number(durationMs.toFixed(2)), ...summary(samples), errorRatePercent: Number((errors.length / samples.length * 100).toFixed(2)), requestsPerSecond: Number((samples.length / durationMs * 1000).toFixed(2)), statusCounts, endpoints: Object.fromEntries(paths.map(path => [path, summary(samples.filter(s => s.path === path))])), clientDeduplication: dedup, errors: errors.slice(0, 10) };
if (process.env.LOAD_TEST_OUTPUT) await writeFile(process.env.LOAD_TEST_OUTPUT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
