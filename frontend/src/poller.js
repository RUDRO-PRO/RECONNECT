// The only recurring network scheduler. UI countdowns/debounces are not pollers.
export function createPoller({ active, background, enabled = () => true, document = globalThis.document, navigator = globalThis.navigator, events = globalThis.window, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer, running = false, disposed = false, failures = 0;
  const available = () => !disposed && !document.hidden && navigator.onLine !== false && enabled();
  function schedule() {
    clearTimer(timer); timer = undefined;
    if (!available() || running) return;
    timer = setTimer(tick, Math.min(120000, (active() ? 3000 : 45000) * 2 ** failures));
  }
  async function tick() {
    timer = undefined; if (!available() || running) return;
    running = true;
    try { const conversation = active(); await (conversation ? conversation() : background()); failures = 0; }
    catch { failures = Math.min(3, failures + 1); }
    finally { running = false; schedule(); }
  }
  for (const name of ['online', 'offline']) events.addEventListener(name, schedule);
  document.addEventListener('visibilitychange', schedule);
  schedule();
  return { wake: schedule, dispose() { disposed = true; clearTimer(timer); document.removeEventListener('visibilitychange', schedule); for (const name of ['online', 'offline']) events.removeEventListener(name, schedule); } };
}
export const debounce = (fn, delay = 300) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; };
