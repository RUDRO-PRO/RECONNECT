import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeMessages, messagePollDelay } from "../src/messages.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("incoming polls preserve pending sends and reconcile saved IDs without duplicates", () => {
  const pending = { _id: "temp", clientMessageId: "temp", createdAt: "2026-11-07T10:00:01.000Z", text: "Hi", pending: true };
  const earlier = { _id: "a", createdAt: "2026-11-07T10:00:00.000Z", text: "Hello" };
  const saved = { ...pending, _id: "b", pending: undefined };
  const duringSend = mergeMessages([pending], [earlier]);
  assert.deepEqual(duringSend, [earlier, pending]);
  const received = mergeMessages(duringSend, [saved]);
  assert.deepEqual(received, [earlier, saved]);
  assert.deepEqual(mergeMessages(received, [earlier, saved]), received);
});

test("polling is fast only for a visible open conversation", () => {
  assert.equal(messagePollDelay(true, false), 2500);
  assert.equal(messagePollDelay(false, false), 30000);
  assert.equal(messagePollDelay(true, true), 30000);
  assert.equal(messagePollDelay(false, true), 30000);
});

test("chat restores cached history, renders before POST resolves, and rolls back failed sends", async () => {
  const elements = new Map(), timers = new Map(), requests = [], toasts = [];
  let timerId = 0, resolveSend, rejectSend;
  const $ = id => {
    if (!elements.has(id)) elements.set(id, {
      value: "", innerHTML: "", textContent: "", hidden: false, open: false,
      scrollHeight: 100, scrollTop: 0, clientHeight: 100,
      addEventListener() {}, showModal() { this.open = true; }, close() { this.open = false; },
      reset() {}, replaceChildren() { this.innerHTML = ""; },
    });
    return elements.get(id);
  };
  const peer = { id: "peer", name: "Priyam", unread: 0 };
  const old = { _id: "old", senderId: "peer", recipientId: "me", text: "Persisted hello", createdAt: "2026-11-07T00:00:00.000Z" };
  const cache = new Map([["reconnect_messages_me", JSON.stringify({ people: [peer], threads: { peer: [old] }, selected: "peer" })]]);
  const state = { user: { id: "me" }, token: "token" };
  const context = vm.createContext({
    installTeamWorkspace: () => ({ reset() {} }),
    $, mergeMessages, messagePollDelay, escape: String, avatar: () => "", crypto: { randomUUID: () => "temporary" },
    localStorage: { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value) },
    document: { hidden: false, body: { insertAdjacentHTML() {} }, addEventListener() {} },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id), setInterval() {},
  });
  const source = readFileSync(new URL("../src/social.js", import.meta.url), "utf8");
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, "").replace("export function", "function"), context);
  const ui = context.installSocialUI({ state, api: async path => { requests.push(path); return path === "/messages/conversations" ? [peer] : [old]; },
    send: () => new Promise((resolve, reject) => { resolveSend = resolve; rejectSend = reject; }), toast: message => toasts.push(message) });
  const restoring = ui.restore();
  assert.match($("dm-feed").innerHTML, /Persisted hello/);
  await restoring;
  assert.ok(requests.includes("/messages/peer"));
  await $("messages-toggle").onclick();
  const submit = text => $("dm-compose").onsubmit({ preventDefault() {}, target: { elements: { text: { value: text } }, reset() {} } });
  const sending = submit("Instant message");
  assert.match($("dm-feed").innerHTML, /Instant message/);
  assert.match($("dm-feed").innerHTML, /Sending/);
  await [...timers.values()].find(timer => timer.delay === 2500).fn();
  assert.ok(requests.some(path => path.includes("?after=")));
  assert.match($("dm-feed").innerHTML, /Instant message/);
  resolveSend({ _id: "saved", clientMessageId: "temporary", senderId: "me", recipientId: "peer", text: "Instant message", createdAt: "2026-11-07T00:00:01.000Z" });
  await sending;
  assert.doesNotMatch($("dm-feed").innerHTML, /Sending/);
  assert.equal(($("dm-feed").innerHTML.match(/Instant message/g) || []).length, 1);
  const failing = submit("Failed message");
  rejectSend(new Error("offline")); await failing;
  assert.doesNotMatch($("dm-feed").innerHTML, /Failed message/);
  assert.match(toasts.at(-1), /offline/);
  ui.reset();
  state.user = { id: "another-user" }; state.token = "another-token";
  const restoringAnother = ui.restore();
  assert.doesNotMatch($("dm-feed").innerHTML, /Instant message/);
  await restoringAnother;
});
