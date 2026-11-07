import { test } from "node:test";
import assert from "node:assert/strict";
import { readSession, validateSession } from "../src/session.js";

test("cached session belongs to the current token and tolerates corrupt storage", () => {
  const cached = { token: "a", user: { id: "alice" }, profile: { fullName: "Alice" } };
  const storage = { get: () => JSON.stringify(cached) };
  assert.deepEqual(readSession(storage, "a"), cached);
  assert.equal(readSession(storage, "b"), null);
  assert.equal(readSession({ get: () => "bad-json" }, "a"), null);
});

test("cold starts and network failures retry after 1.5 seconds without clearing the session", async () => {
  for (const status of [undefined, 500, 503]) {
    let calls = 0, clears = 0;
    const waits = [];
    const api = async () => { calls++; throw Object.assign(new Error("offline"), { status }); };
    await assert.rejects(validateSession(api, () => true, () => clears++, async ms => waits.push(ms)), /offline/);
    assert.equal(calls, 2); assert.equal(clears, 0); assert.deepEqual(waits, [1500]);
  }
});

test("explicit invalid sessions clear once, while stale requests cannot clear a new login", async () => {
  for (const status of [401, 403]) {
    let clears = 0;
    const api = async () => { throw Object.assign(new Error("invalid"), { status }); };
    await assert.rejects(validateSession(api, () => true, () => clears++), /invalid/);
    assert.equal(clears, 1);
    assert.equal(await validateSession(api, () => false, () => clears++), null);
    assert.equal(clears, 1);
  }
});

test("a successful retry restores the server user", async () => {
  let calls = 0;
  const user = { id: "alice" };
  const result = await validateSession(async () => { if (!calls++) throw new Error("timeout"); return user; }, () => true, () => assert.fail("cleared session"), async () => {});
  assert.equal(result, user);
});
