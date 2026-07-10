/* Velo Service Worker v15 — always-fresh HTML + smart notifs + pre-cache */
var CACHE = 'velo-v25';
var APP_HTML = '/app-premium.html';
var VERSION_URL = '/version.json';

// Recursos a pre-cachear en install para arranque instantáneo aún sin red
var PRECACHE = [
  APP_HTML,
  '/assets/icon-192.png',
  '/assets/icon-72.png',
];

self.addEventListener('install', function(e){
  // Pre-cache paralelo (best-effort, no bloquea skipWaiting)
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return Promise.all(PRECACHE.map(function(url){
        return fetch(url, {cache:'no-store'}).then(function(res){
          if(res && res.ok) return c.put(url, res.clone());
        }).catch(function(){});
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
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

// Permite al cliente activar un SW nuevo sin recargar toda la app
self.addEventListener('message', function(e){
  if(!e.data) return;
  if(e.data.type === 'SKIP_WAITING'){ self.skipWaiting(); }
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

// ── PUSH NOTIFICATIONS con acciones inteligentes ──────────────
// Payload esperado (send-push.js):
//   { title, body, icon, badge, tag, url, actions?: [{action:'open', title:'💌 Ver'}, {action:'later', title:'Después'}] }
self.addEventListener('push', function(event){
  var data = {};
  try{ data = event.data ? event.data.json() : {}; }
  catch(e){ data = {title:'Velo', body: event.data ? event.data.text() : ''}; }
  var title = data.title || '💚 Velo';
  // Actions por defecto según tag — cada uno con un URL de deep-link
  var defaultActions = [{action:'open', title:'Abrir Velo'}];
  var actionMeta = {}; // action_id → url override
  if(data.actions && Array.isArray(data.actions)){
    // Formato custom: array de {action,title,url}
    defaultActions = data.actions.map(function(a){
      if(a && a.url) actionMeta[a.action] = a.url;
      return { action: a.action || 'open', title: a.title || 'Ver' };
    }).slice(0, 2); // spec: máx 2 acciones visibles
  } else if(data.tag){
    if(data.tag.indexOf('velo-wrapped-annual') === 0){
      defaultActions = [
        {action:'open-wrapped-annual', title:'🎊 Ver mi año'},
        {action:'later', title:'Después'}
      ];
      actionMeta['open-wrapped-annual'] = '/?open=wrapped-annual';
    } else if(data.tag.indexOf('velo-wrapped-') === 0){
      defaultActions = [
        {action:'open-wrapped', title:'🌸 Ver Wrapped'},
        {action:'later', title:'Después'}
      ];
      actionMeta['open-wrapped'] = '/?open=wrapped';
    } else if(data.tag === 'velo-buddy-alert'){
      defaultActions = [
        {action:'open-buddy', title:'💬 Ir al buddy'},
        {action:'later', title:'Después'}
      ];
      actionMeta['open-buddy'] = '/?open=buddy';
    } else if(data.tag && data.tag.indexOf('velo-dm-') === 0){
      // DM notification: deep link con peer ID (viene en data.url)
      defaultActions = [
        {action:'open-dm', title:'💬 Ver mensaje'},
        {action:'later', title:'Después'}
      ];
      actionMeta['open-dm'] = data.url || '/';
    } else if(data.tag && data.tag.indexOf('velo-weekly-') === 0){
      // Resumen semanal — deep-link al overlay del resumen
      defaultActions = [
        {action:'open-weekly-summary', title:'🌸 Ver mi semana'},
        {action:'later', title:'Después'}
      ];
      actionMeta['open-weekly-summary'] = '/?open=weekly-summary';
    } else if(data.tag && data.tag.indexOf('velo-') === 0){
      // Daily notifs — action de "Registrar ánimo" en morning slot
      if(data.tag === 'velo-morning'){
        defaultActions = [
          {action:'open-mood', title:'🌿 Registrar ánimo'},
          {action:'later', title:'Después'}
        ];
        actionMeta['open-mood'] = '/?open=mood';
      }
    }
  }
  var options = {
    body: data.body || '¿Cómo te sentís hoy?',
    icon: data.icon || '/assets/icon-192.png',
    badge: '/assets/icon-72.png',
    tag: data.tag || 'velo-daily',
    renotify: false,
    requireInteraction: !!data.requireInteraction,
    actions: defaultActions,
    data: {
      url: data.url || '/',
      actionMeta: actionMeta,
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var d = event.notification.data || {};
  var target = d.url || '/';
  if(event.action && d.actionMeta && d.actionMeta[event.action]){
    target = d.actionMeta[event.action];
  } else if(event.action === 'later'){
    return; // el usuario descarta, no abrimos nada
  }
  event.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(list){
      // Si ya hay una ventana abierta, foco + mandarle un mensaje con el intent
      for(var i=0; i<list.length; i++){
        var c = list[i];
        if(c.url.indexOf(self.location.origin) === 0){
          c.postMessage({ type:'NOTIF_ACTION', action: event.action || 'open', url: target });
          if('focus' in c) return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
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
