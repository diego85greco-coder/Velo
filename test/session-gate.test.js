/**
 * Prueba de la espera de sesión que envuelve al fetch de Supabase.
 *
 *     node test/session-gate.test.js
 *
 * POR QUÉ EXISTE
 * `_veloLoudFetch` está en el camino de TODAS las consultas de la aplicación.
 * Desde v1631 además retiene la primera de ellas hasta que la sesión esté
 * restaurada. Un fallo acá no rompe una pantalla: las rompe todas.
 *
 * Los tres modos de fallar son concretos:
 *   1. Bloquearse a sí misma — si esperase también las llamadas de `/auth/v1`,
 *      que son las que hace la propia restauración de sesión.
 *   2. Colgar la app — si la restauración no respondiera nunca.
 *   3. Reintentar sin fin — si quien no inició sesión repitiera el refresco en
 *      cada consulta.
 *
 * La prueba lee las funciones DEL PROPIO premium.js (no una copia), así que no
 * puede desincronizarse.
 */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'premium.js'), 'utf8');

function extraer(re) {
  const m = src.match(re);
  if (!m) throw new Error('No se encontró en premium.js: ' + re);
  return m[0];
}

let fallos = 0;
function comprobar(nombre, ok, detalle) {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${nombre}${detalle ? '  — ' + detalle : ''}`);
}

// Cada escenario arranca con el estado limpio, como una carga nueva de la app.
function escenario({ sesion, retrasoMs }) {
  const registro = { authFetch: 0, restFetch: 0, intentosSesion: 0 };

  let _sbSessionOk = false, _sbSessionP = null, _sbSessionDone = false, _sbSessionWaitP = null;

  // Simula a `_ensureSbSession`: consulta a /auth/v1 y devuelve si hay sesión.
  function _ensureSbSession() {
    registro.intentosSesion++;
    return new Promise((resolve) => {
      fetchSimulado('https://x.supabase.co/auth/v1/token');
      if (retrasoMs === Infinity) return;           // nunca responde
      setTimeout(() => resolve(sesion), retrasoMs);
    });
  }

  function fetchSimulado(url) {
    if (url.indexOf('/auth/v1') >= 0) registro.authFetch++;
    else registro.restFetch++;
    return Promise.resolve({ ok: true, url });
  }

  eval(extraer(/function _sessionReady\(\)\{[\s\S]*?\n\}/));
  eval(extraer(/function _sbWaitForSession\(\)\{[\s\S]*?\n\}/));

  // Réplica de la guarda de `_veloLoudFetch`, con el mismo criterio de URL.
  function llamar(url) {
    if (!_sbSessionDone && url.indexOf('/rest/v1') >= 0) {
      return _sbWaitForSession().then(() => fetchSimulado(url));
    }
    return fetchSimulado(url);
  }

  return { llamar, registro, estado: () => ({ _sbSessionDone, _sbSessionOk }) };
}

(async function () {
  console.log('Espera de sesión antes de la primera consulta\n');

  // ── 1. Con sesión: la consulta REST no sale hasta que la sesión está lista ──
  {
    const e = escenario({ sesion: true, retrasoMs: 40 });
    const orden = [];
    const p = e.llamar('https://x.supabase.co/rest/v1/help_posts_feed').then(() => orden.push('rest'));
    setTimeout(() => orden.push('sesion-lista'), 40);
    await p;
    comprobar('la consulta REST espera a la sesión',
      orden[0] === 'sesion-lista' || e.registro.authFetch > 0,
      `orden: ${orden.join(' → ') || '(sin marcas)'}`);
    comprobar('la sesión se resolvió como válida', e.estado()._sbSessionOk === true);
  }

  // ── 2. Las llamadas de /auth/v1 NO esperan (si no, se bloquearía a sí misma) ──
  {
    const e = escenario({ sesion: true, retrasoMs: Infinity });   // sesión colgada
    let resuelta = false;
    e.llamar('https://x.supabase.co/auth/v1/token').then(() => { resuelta = true; });
    await new Promise(r => setTimeout(r, 30));
    comprobar('/auth/v1 pasa sin esperar', resuelta === true,
      'si esperase, la restauración de sesión se bloquearía a sí misma');
  }

  // ── 3. Si la sesión no responde nunca, se sigue igual a los 3 s ──────────────
  {
    const e = escenario({ sesion: true, retrasoMs: Infinity });
    const t0 = Date.now();
    let resuelta = false;
    e.llamar('https://x.supabase.co/rest/v1/vibes').then(() => { resuelta = true; });
    await new Promise(r => setTimeout(r, 3200));
    const ms = Date.now() - t0;
    comprobar('con la sesión colgada, sigue a los ~3 s', resuelta === true && ms < 4000,
      `tardó ${ms} ms`);
  }

  // ── 4. Sin sesión: se intenta UNA vez, no en cada consulta ───────────────────
  {
    const e = escenario({ sesion: false, retrasoMs: 10 });
    await e.llamar('https://x.supabase.co/rest/v1/momentos');
    await e.llamar('https://x.supabase.co/rest/v1/vibes');
    await e.llamar('https://x.supabase.co/rest/v1/circles');
    await e.llamar('https://x.supabase.co/rest/v1/daily_responses_feed');
    comprobar('sin cuenta, la sesión se intenta una sola vez',
      e.registro.intentosSesion === 1, `intentos: ${e.registro.intentosSesion}`);
    comprobar('las 4 consultas REST se hicieron igual',
      e.registro.restFetch === 4, `consultas: ${e.registro.restFetch}`);
  }

  // ── 5. Tras la primera, las siguientes no vuelven a esperar ──────────────────
  {
    const e = escenario({ sesion: true, retrasoMs: 30 });
    await e.llamar('https://x.supabase.co/rest/v1/help_posts_feed');
    const t0 = Date.now();
    await e.llamar('https://x.supabase.co/rest/v1/happy_posts_full');
    const ms = Date.now() - t0;
    comprobar('la segunda consulta no espera', ms < 10, `tardó ${ms} ms`);
    comprobar('la sesión no se reintenta', e.registro.intentosSesion === 1,
      `intentos: ${e.registro.intentosSesion}`);
  }

  console.log('');
  if (fallos) {
    console.error(`✗ ${fallos} fallo(s). NO desplegar sin revisarlo.`);
    process.exit(1);
  }
  console.log('✓ Todo correcto.');
})();
