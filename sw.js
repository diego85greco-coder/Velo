/* Velo Service Worker — always-fresh strategy for app-premium.html */
var CACHE = 'velo-v13';
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

  if(!url.startsWith(self.location.origin)){
    return;
  }

  var path = new URL(url).pathname;

  if(path === '/' || path === '/index.html' || path === '/app-premium.html'){
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

  if(path === VERSION_URL || path === '/version.json'){
    e.respondWith(
      fetch(e.request, {cache: 'no-store'})
        .catch(function(){ return Response.error(); })
    );
    return;
  }

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

  e.respondWith(
    fetch(e.request).catch(function(){
      return caches.match(e.request).then(function(cached){
        return cached || Response.error();
      });
    })
  );
});

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

self.addEventListener('pushsubscriptionchange', function(event){
  var appKey = event.oldSubscription && event.oldSubscription.options
    ? event.oldSubscription.options.applicationServerKey
    : null;
  if(!appKey) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey })
      .then(function(newSub){
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then(function(clientList){
            clientList.forEach(function(c){
              c.postMessage({ type: 'PUSH_SUB_CHANGED', sub: JSON.stringify(newSub) });
            });
          });
      })
      .catch(function(e){ console.warn('[SW pushsubscriptionchange]', e && e.message); })
  );
});
