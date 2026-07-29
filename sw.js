/* Velo Service Worker v16 — always-fresh HTML + smart notifs + pre-cache + DM mute si el chat está abierto */
var CACHE = 'velo-v174';
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
// Dedup de notificaciones duplicadas (p.ej. si hay 2 webhooks/triggers en la DB
// disparando el mismo push): suprime un push idéntico que llega dentro de 7s.
var _veloRecentPush = {};
function _veloIsDupPush(key){
  var now = Date.now();
  // limpiar viejos
  Object.keys(_veloRecentPush).forEach(function(k){ if(now - _veloRecentPush[k] > 15000) delete _veloRecentPush[k]; });
  if(_veloRecentPush[key] && (now - _veloRecentPush[key]) < 7000) return true;
  _veloRecentPush[key] = now;
  return false;
}
self.addEventListener('push', function(event){
  var data = {};
  try{ data = event.data ? event.data.json() : {}; }
  catch(e){ data = {title:'Velo', body: event.data ? event.data.text() : ''}; }
  var title = data.title || '💚 Velo';
  // Si un push idéntico (mismo tag+título+cuerpo) ya se mostró hace <7s, saltarlo.
  var _dupKey = (data.tag||'') + '|' + title + '|' + (data.body||'');
  if(_veloIsDupPush(_dupKey)){ return; }
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
  // v83: dedup PERSISTENTE vía Cache API — el mapa en memoria se pierde si el
  // navegador reinicia el SW entre dos pushes duplicados (p.ej. dos triggers en
  // la DB disparando el mismo aviso). Esto sobrevive reinicios: si un push con
  // la misma clave se mostró hace <20s, se descarta.
  function _veloCacheDedup(key){
    var url = '/velo-push-dedup/' + encodeURIComponent(key);
    return caches.open('velo-push-dedup').then(function(c){
      return c.match(url).then(function(hit){
        var now = Date.now();
        if(hit){
          var ts = parseInt(hit.headers.get('x-velo-ts')||'0', 10);
          if(now - ts < 20000) return true; // duplicado reciente → no mostrar
        }
        return c.put(url, new Response('1', { headers: { 'x-velo-ts': String(now) } }))
          .then(function(){ return false; });
      });
    }).catch(function(){ return false; });
  }

  // v81: si es una notificación de DM y el usuario YA está con ese chat abierto
  // y visible, no mostrarla (le preguntamos a la ventana antes de notificar).
  event.waitUntil(_veloCacheDedup(_dupKey).then(function(_isDupPersist){
    if(_isDupPersist) return;
    var isDm = (data.tag||'').indexOf('velo-dm-') === 0;
    if(!isDm) return self.registration.showNotification(title, options);
    var peer = (data.tag||'').slice('velo-dm-'.length);
    return self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(wins){
      var checks = wins.filter(function(w){ return w.visibilityState === 'visible'; }).map(function(w){
        return new Promise(function(res){
          var mc = new MessageChannel();
          var t = setTimeout(function(){ res(false); }, 400);
          mc.port1.onmessage = function(ev){ clearTimeout(t); res(!!(ev.data && ev.data.open)); };
          try{ w.postMessage({ type:'VELO_DM_OPEN_QUERY', peer: peer }, [mc.port2]); }
          catch(e){ clearTimeout(t); res(false); }
        });
      });
      return Promise.all(checks).then(function(answers){
        if(answers.some(function(a){ return a; })) return; // chat abierto → no molestar
        return self.registration.showNotification(title, options);
      });
    }).catch(function(){ return self.registration.showNotification(title, options); });
  }));
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
