/* Velo Service Worker — always-fresh strategy for app-premium.html */
var CACHE = 'velo-v1';
var APP_HTML = '/app-premium.html';
var VERSION_URL = '/version.json';

self.addEventListener('install', function(e){
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(e){
  var url = e.request.url;
  var path = new URL(url).pathname;

  /* For app-premium.html and index.html: network-first, fall back to cache */
  if(path === '/' || path === '/index.html' || path.indexOf('app-premium.html') >= 0){
    e.respondWith(
      fetch(e.request, {cache: 'no-store'})
        .then(function(res){
          if(res.ok){
            var clone = res.clone();
            caches.open(CACHE).then(function(c){ c.put(APP_HTML, clone); });
          }
          return res;
        })
        .catch(function(){
          return caches.match(APP_HTML);
        })
    );
    return;
  }

  /* For version.json: always network, no cache */
  if(path === VERSION_URL){
    e.respondWith(fetch(e.request, {cache: 'no-store'}));
    return;
  }

  /* For JS/CSS assets with version query strings: cache-first (they're already versioned) */
  if((path.endsWith('.js') || path.endsWith('.css')) && url.indexOf('?v=') >= 0){
    e.respondWith(
      caches.match(e.request).then(function(cached){
        if(cached) return cached;
        return fetch(e.request).then(function(res){
          var clone = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
          return res;
        });
      })
    );
    return;
  }

  /* Everything else: network with cache fallback */
  e.respondWith(
    fetch(e.request).catch(function(){ return caches.match(e.request); })
  );
});
