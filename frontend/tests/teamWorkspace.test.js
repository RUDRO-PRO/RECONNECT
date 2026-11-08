import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { escape } from '../src/ui.js';
test('workspace sends optimistically, reconciles polling, preserves drafts, and cleans up polling', async () => {
  const elements = new Map(), timers = new Map(), listeners = new Map(); let timerId = 0, resolveSend;
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', hidden: false, open: false, value: '', style: {}, scrollHeight: 100, scrollTop: 0, clientHeight: 100,
      elements: Object.fromEntries(['text', 'image', 'title', 'caption', 'imageUrl', 'progressPercent', 'currentSprintGoal', 'assigneeName'].map(name => [name, { value: '', files: [] }])),
      reset() { for (const el of Object.values(this.elements)) { el.value = ''; el.files = []; } },
      replaceChildren() { this.innerHTML = ''; }, setAttribute() {}, addEventListener() {}, querySelector() { return { disabled: false }; },
      showModal() { this.open = true; }, close() { this.open = false; },
    }); return elements.get(id);
  };
  const document = { hidden: false, body: { insertAdjacentHTML() {} }, querySelector: () => ({ setAttribute() {} }), addEventListener: (name, fn) => listeners.set(name, fn) };
  const state = { user: { id: 'me', name: 'Builder' }, token: 'token' };
  const result = { name: 'Khichuri', event: 'Hackathon', members: [{ name: 'Builder' }], messages: [], milestones: [], assets: [], projectState: 'Ideation', progressPercent: 0 };
  const context = vm.createContext({ $, document, escape, avatar: () => '', safeUrl: () => '', crypto: { randomUUID: () => 'client-1' }, setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout: id => timers.delete(id) });
  const source = readFileSync(new URL('../src/teamWorkspace.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');
  vm.runInContext(source, context);
  const ui = context.installTeamWorkspace({ state, api: async () => structuredClone(result), send: () => new Promise(resolve => { resolveSend = resolve; }), toast() {} });
  await ui.open('team'); assert.equal([...timers.values()].at(-1).delay, 2500);
  const form = $('workspace-compose'); form.elements.text.value = '<hello>';
  const sending = form.onsubmit({ preventDefault() {}, target: form });
  assert.match($('workspace-feed').innerHTML, /&lt;hello&gt;/); assert.match($('workspace-feed').innerHTML, /Sending/);
  const saved = { _id: 'saved', clientMessageId: 'client-1', text: '<hello>', senderId: 'me', senderName: 'Builder', createdAt: new Date().toISOString() };
  result.messages = [saved]; await [...timers.values()].at(-1).fn();
  assert.equal(($('workspace-feed').innerHTML.match(/&lt;hello&gt;/g) || []).length, 1);
  resolveSend(saved); await sending; assert.equal(($('workspace-feed').innerHTML.match(/&lt;hello&gt;/g) || []).length, 1);
  $('workspace-goal').elements.currentSprintGoal.value = 'Unsaved draft'; $('workspace-goal').oninput();
  await [...timers.values()].at(-1).fn(); assert.equal($('workspace-goal').elements.currentSprintGoal.value, 'Unsaved draft');
  document.hidden = true; listeners.get('visibilitychange')(); assert.equal([...timers.values()].at(-1).delay, 30000);
  ui.reset(); assert.equal($('workspace').open, false);
});
