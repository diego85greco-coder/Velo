/* Velo Service Worker — always-fresh strategy for app-premium.html */
var CACHE = 'velo-v5';
var APP_HTML = '/app-premium.html';
var VERSION_URL = '/version.json';

self.addEventListener('install', function(e){
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  // Delete old caches on activate
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var url = e.request.url;

  // CRITICAL: never intercept cross-origin requests.
  // Let the browser handle CDN (Supabase, Google Fonts, Stripe, etc.) directly.
  // Intercepting these and returning undefined from cache causes
  // "TypeError: Failed to convert value to Response" which blocks Supabase from loading.
  if(!url.startsWith(self.location.origin)){
    return;
  }

  var path = new URL(url).pathname;

  /* For app-premium.html and index.html: network-first, fall back to cache */
  if(path === '/' || path === '/index.html' || path.indexOf('app-premium.html') >= 0){
    e.respondWith(
      fetch(e.request, {cache: 'no-store'})
        .then(function(res){
          if(res && res.ok){
            var clone = res.clone();
            caches.open(CACHE).then(function(c){ c.put(APP_HTML, clone); });
          }
          return res;
        })
        .catch(function(){
          return caches.match(APP_HTML).then(function(cached){
            return cached || Response.error();
          });
        })
    );
    return;
  }

  /* For version.json: always network, no cache */
  if(path === VERSION_URL || path === '/version.json'){
    e.respondWith(
      fetch(e.request, {cache: 'no-store'})
        .catch(function(){ return Response.error(); })
    );
    return;
  }

  /* For JS/CSS assets with version query strings: cache-first (they're already versioned) */
  if((path.endsWith('.js') || path.endsWith('.css')) && url.indexOf('?v=') >= 0){
    e.respondWith(
      caches.match(e.request).then(function(cached){
        if(cached) return cached;
        return fetch(e.request).then(function(res){
          if(res && res.ok){
            var clone = res.clone();
            caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
          }
          return res;
        }).catch(function(){ return Response.error(); });
      })
    );
    return;
  }

  /* Same-origin requests: network with safe cache fallback */
  e.respondWith(
    fetch(e.request).catch(function(){
      return caches.match(e.request).then(function(cached){
        return cached || Response.error();
      });
    })
  );
});

// Push notification handler
self.addEventListener('push', function(event){
  var data = {};
  try{ data = event.data ? event.data.json() : {}; }catch(e){ data = {title:'Velo',body:event.data?event.data.text():''}; }
  var title = data.title || '💚 Velo';
  var options = {
    body: data.body || '¿Cómo te sentís hoy?',
    icon: data.icon || '/assets/icon-192.png',
    badge: '/assets/icon-72.png',
    tag: data.tag || 'velo-daily',
    requireInteraction: false,
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.openWindow(url));
});
