import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoller } from '../src/poller.js';
test('one adaptive poller pauses hidden/offline, never overlaps and backs off failures', async () => {
  const timers = new Map(), handlers = {}; let id = 0, chat = null, backgrounds = 0, polls = 0, resolvePoll;
  const document = { hidden: false, addEventListener: (n, f) => { handlers[n] = f; }, removeEventListener() {} };
  const events = { addEventListener: document.addEventListener, removeEventListener() {} }, navigator = { onLine: true };
  const poller = createPoller({ active: () => chat, background: async () => { backgrounds++; }, document, events, navigator,
    setTimer: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, clearTimer: id => timers.delete(id) });
  const fire = () => { const [id, timer] = [...timers][0]; timers.delete(id); return timer.fn(); };
  assert.equal([...timers.values()][0].ms, 45000); await fire(); assert.equal(backgrounds, 1);
  chat = () => { polls++; return new Promise(r => { resolvePoll = r; }); }; poller.wake(); assert.equal(timers.size, 1); assert.equal([...timers.values()][0].ms, 3000);
  const pending = fire(); poller.wake(); assert.equal(timers.size, 0); assert.equal(polls, 1);
  document.hidden = true; handlers.visibilitychange(); resolvePoll(); await pending; assert.equal(timers.size, 0);
  document.hidden = false; handlers.visibilitychange(); assert.equal(timers.size, 1);
  navigator.onLine = false; handlers.offline(); assert.equal(timers.size, 0);
  navigator.onLine = true; handlers.online(); chat = async () => { throw Error('offline'); }; await fire(); assert.equal([...timers.values()][0].ms, 6000);
  poller.dispose(); assert.equal(timers.size, 0);
});
