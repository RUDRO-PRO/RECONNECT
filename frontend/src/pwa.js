import { registerSW } from 'virtual:pwa-register';
// Workbox autoUpdate activates new shells. Check on foreground/online events,
// without adding another recurring timer or ever caching authenticated API data.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    let lastCheck = Date.now();
    const check = () => {
      if (document.hidden || navigator.onLine === false || Date.now() - lastCheck < 60000) return;
      lastCheck = Date.now();
      void registration.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
  },
});
