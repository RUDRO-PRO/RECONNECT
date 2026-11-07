import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("GET requests coalesce by URL and session, retry failures, and invalidate on writes", async () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const calls = [];
  const context = vm.createContext({
    state: { token: "first" },
    requestApi: (path, options) => new Promise((resolve, reject) => calls.push({ path, options, resolve, reject })),
  });
  vm.runInContext(source.slice(source.indexOf("const pendingReads"), source.indexOf("async function requestApi")), context);
  for (const path of ["/profiles?search=", "/invitations", "/notifications", "/connections"]) {
    const first = context.api(path);
    assert.equal(context.api(path), first);
    calls.at(-1).resolve([]);
    await first;
  }
  assert.equal(calls.length, 4);
  const failed = context.api("/connections");
  calls.at(-1).reject(new Error("offline"));
  await assert.rejects(failed, /offline/);
  const retry = context.api("/connections");
  const oldRead = calls.at(-1);
  context.state.token = "second";
  const newSession = context.api("/connections");
  assert.notEqual(retry, newSession);
  calls.at(-1).resolve([]);
  await newSession;
  const beforeWrite = context.api("/connections");
  const beforeWriteCall = calls.at(-1);
  const write = context.api("/invitations", { method: "POST" });
  calls.at(-1).resolve({});
  await write;
  const afterWrite = context.api("/connections");
  assert.notEqual(beforeWrite, afterWrite);
  oldRead.resolve([]);
  beforeWriteCall.resolve([]);
  await Promise.all([retry, beforeWrite]);
  assert.equal(context.api("/connections"), afterWrite);
  calls.at(-1).resolve([]);
  await afterWrite;
});
