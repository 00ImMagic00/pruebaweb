/**
 * NexoERP — sw.js (Adenda 1.6)
 * Service Worker: modo offline para el POS de mostrador.
 *
 * Estrategia:
 *  · App shell (HTML/CSS/JS/vendor/iconos): cache-first con revalidación
 *    en segundo plano (stale-while-revalidate). Así el sistema abre y el
 *    POS funciona aunque no haya internet en el local.
 *  · Llamadas al backend (script.google.com u otras APIs): network-only;
 *    si no hay conexión, la venta queda en la cola local del navegador
 *    (api.js → Api.encolarVenta) y se sincroniza sola al reconectar.
 */
var CACHE = 'nexoerp-v1.6.1-r7';
var APP_SHELL = [
  './',
  './index.html',
  './catalogo.html',
  './manifest.json',
  './assets/css/custom.css',
  './assets/vendor/tailwind.js',
  './assets/vendor/vue.global.prod.js',
  './assets/vendor/chart.umd.js',
  './assets/vendor/jspdf.umd.min.js',
  './assets/js/config.js',
  './assets/js/utils.js',
  './assets/js/demo-data.js',
  './assets/js/demo-store.js',
  './assets/js/store.js',
  './assets/js/api.js',
  './assets/js/components.js',
  './assets/js/receipts.js',
  './assets/js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
var VISTAS = [
  'view-login', 'view-dashboard', 'view-pos', 'view-ventas', 'view-cotizaciones',
  'view-fiados', 'view-caja', 'view-clientes', 'view-productos', 'view-almacenes',
  'view-stock', 'view-lotes', 'view-movimientos', 'view-kardex', 'view-alertas',
  'view-usuarios', 'view-reportes', 'view-rentabilidad', 'view-panel',
  'view-auditoria', 'view-config', 'view-categorias', 'view-asistente',
  /* Adenda 1.6 */
  'view-comprobantes', 'view-gastos', 'view-compras', 'view-cobranzas', 'view-rrhh'
];
VISTAS.forEach(function (v) { APP_SHELL.push('./assets/js/views/' + v + '.js'); });

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* addAll falla si un archivo no existe; se agregan uno a uno. */
      return Promise.all(APP_SHELL.map(function (url) {
        return cache.add(url).catch(function () { /* archivo opcional */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (ev) {
  var url = new URL(ev.request.url);
  /* Nunca interceptamos la API del backend ni CDNs: network-only. */
  if (url.hostname.indexOf('script.google.com') !== -1 ||
      url.hostname.indexOf('googleapis.com') !== -1 ||
      url.hostname.indexOf('unpkg.com') !== -1 ||
      url.hostname.indexOf('jsdelivr.net') !== -1 ||
      ev.request.method !== 'GET') {
    return;
  }
  if (url.origin !== self.location.origin) return;

  ev.respondWith(
    caches.match(ev.request).then(function (cacheRes) {
      var red = fetch(ev.request).then(function (res) {
        if (res && res.status === 200) {
          var copia = res.clone();
          caches.open(CACHE).then(function (c) { c.put(ev.request, copia); });
        }
        return res;
      }).catch(function () { return cacheRes; });
      return cacheRes || red;
    })
  );
});
