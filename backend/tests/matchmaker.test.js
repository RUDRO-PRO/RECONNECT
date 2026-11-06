const { test } = require("node:test");
const assert = require("node:assert/strict");
const { rankComplementaryBuilders, localRank } = require("../utils/aiMatchmaker");
const { aiProviders, apiKeys } = require("../config");
const user = { _id: "me", userId: "u1", skills: [{ name: "React" }], interests: ["Climate"] };
const candidates = [
  { _id: "backend", userId: "u2", skills: [{ name: "Node.js" }, { name: "MongoDB" }], interests: ["Climate"] },
  { _id: "similar", userId: "u3", skills: [{ name: "React" }], interests: [] },
];
const providers = aiProviders({ GEMINI_API_KEY: "one", GROQ_API_KEY: "two", MISTRAL_API_KEY: "three", OPENROUTER_API_KEY: "four" });
const result = JSON.stringify({ matches: [{ id: "backend", reason: "Useful teammate" }] });
test("unconfigured providers use deterministic complementary ranking without network", async () => {
  const matches = await rankComplementaryBuilders(user, candidates, { providers: [], fetch: () => { throw Error("Network must not be used"); } });
  assert.equal(matches[0]._id, "backend"); assert.match(matches[0].matchReason, /node.js.*mongodb.*climate/i);
  assert.deepEqual(matches, localRank(user, candidates));
  assert.deepEqual(await rankComplementaryBuilders(user, [], { providers: [] }), []);
});
test("cloud providers cascade in strict order and do not expose provider reasoning", async () => {
  const calls = [];
  const matches = await rankComplementaryBuilders(user, candidates, { providers, fetch: async (url, request) => {
    calls.push(url);
    if (calls.length < 4) return { ok: false, status: [429, 401, 403][calls.length - 1] };
    assert.equal(request.headers.Authorization, "Bearer four");
    return { ok: true, json: async () => ({ choices: [{ message: { content: result } }] }) };
  } });
  assert.ok(calls[0].includes("googleapis")); assert.ok(calls[1].includes("groq")); assert.ok(calls[2].includes("mistral")); assert.ok(calls[3].includes("openrouter"));
  assert.equal(matches[0]._id, "backend"); assert.ok(!matches[0].matchReason.includes("Useful teammate"));
});
test("timeouts, invalid JSON and invented IDs fall through to local matching", async () => {
  let calls = 0;
  const matches = await rankComplementaryBuilders(user, candidates, { providers, timeoutMs: 5, fetch: async () => {
    calls++;
    if (calls === 1) return new Promise(() => {});
    return { ok: true, json: async () => ({ choices: [{ message: { content: calls === 2 ? "not JSON" : JSON.stringify({ matches: [{ id: "invented", reason: "quota" }] }) } }] }) };
  } });
  assert.equal(calls, 4); assert.deepEqual(matches, localRank(user, candidates));
});
test("key pools are trimmed, placeholders skipped, and rotated across requests", async () => {
  assert.deepEqual(apiKeys(" your_key, first, second,first, "), ["first", "second"]);
  const keys = [], pool = [{ name: "test-pool", keys: ["first", "second"], endpoint: "https://provider.test", model: "test" }];
  for (let i = 0; i < 2; i++) await rankComplementaryBuilders(user, candidates, { providers: pool, fetch: async (_, req) => { keys.push(req.headers.Authorization); return { ok: true, json: async () => ({ choices: [{ message: { content: result } }] }) }; } });
  assert.deepEqual(keys, ["Bearer first", "Bearer second"]);
});
test("Gemini accepts structured output and excludes the current builder", async () => {
  let calls = 0;
  const matches = await rankComplementaryBuilders(user, [user, ...candidates], { providers, fetch: async (_, req) => { calls++; assert.ok(!JSON.parse(req.body).contents[0].parts[0].text.includes('"id":"me"')); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: result }] } }] }) }; } });
  assert.equal(calls, 1); assert.equal(matches.length, 1);
});
