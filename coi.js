// Cross-origin isolation for a host that cannot send the headers, such as
// GitHub Pages. Shared wasm memory needs the page and every worker it starts
// served with COOP and COEP; this one file does both halves.
//   In a page (<script src="../coi.js"></script>, before the page's modules):
//   if the page is not isolated, it registers this file as the site's service
//   worker and reloads the page once that worker controls it. It tries once
//   per tab, so a browser that will not isolate shows the page's own error
//   rather than reloading for ever. globalThis.coi.reloading tells
//   client/host.mjs to wait for the reload rather than fail.
//   As the service worker: every same-origin response gets the two headers
//   (and CORP), so the reloaded page and its workers are isolated.
// A page that is already isolated (tools/serve.mjs sends the headers) does nothing.
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (new URL(req.url).origin !== self.location.origin) return; // cross-origin: as it comes (COEP lets CORS through)
    if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
    e.respondWith(fetch(req).then((res) => {
      if (res.status === 0) return res;
      const headers = new Headers(res.headers);
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }));
  });
} else if (!window.crossOriginIsolated && window.isSecureContext && navigator.serviceWorker) {
  const KEY = 'coi-reloaded';
  let tried = false;
  try { tried = sessionStorage.getItem(KEY) === '1'; } catch { /* storage off: try anyway */ }
  if (!tried) {
    window.coi = { reloading: true };
    const reload = () => {
      try { sessionStorage.setItem(KEY, '1'); } catch { /* storage off */ }
      location.reload();
    };
    if (navigator.serviceWorker.controller) reload(); // controlled, yet not isolated: an older worker's page
    else {
      navigator.serviceWorker.addEventListener('controllerchange', reload);
      navigator.serviceWorker.register(document.currentScript.src).catch((err) => {
        window.coi = { reloading: false, error: String(err) };
        console.warn('coi.js: no service worker', err);
      });
    }
  }
} else if (window.crossOriginIsolated) {
  try { sessionStorage.removeItem('coi-reloaded'); } catch { /* storage off */ }
}
