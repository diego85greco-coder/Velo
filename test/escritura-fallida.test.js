/**
 * Prueba del aviso de escritura fallida.
 *
 *     node test/escritura-fallida.test.js
 *
 * POR QUÉ EXISTE
 * Es el fallo de fondo de esta aplicación (HANDOVER §3). Repartidos por
 * `premium.js` hay 57 sitios que escriben en la base y avisan de éxito sin
 * mirar el resultado:
 *
 *     await sbClient.from('x').insert({...});
 *     pToast('✓','Publicado');
 *
 * supabase-js NO lanza excepción cuando PostgREST devuelve error: entrega
 * `{data, error}`. Así estuvo meses el formulario de contacto diciendo
 * «enviado» sin guardar una sola fila.
 *
 * Arreglar los 57 a mano sería un diff enorme. Como el registro de errores ya
 * pasa por `_veloFetchAndLog`, el aviso también: un solo sitio los cubre todos.
 *
 * Lo delicado es que ese punto está en el camino de TODA petición. Si avisara
 * de más, la app se llenaría de carteles falsos. Esta prueba fija los límites:
 * sólo escrituras, sólo errores de verdad, y como mucho uno cada 6 s.
 *
 * Lee la función DEL PROPIO premium.js, así que no puede desincronizarse.
 */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'premium.js'), 'utf8');

let fallos = 0;
function comprobar(nombre, ok, detalle) {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${nombre}${detalle ? '  — ' + detalle : ''}`);
}

// ── Banco de pruebas: se ejecuta la función real contra respuestas simuladas ──
function escenario({ metodo, url, status, esperaDelay }) {
  const avisos = [];
  const registro = [];
  const contexto = {
    _veloDbErrLog: registro,
    _veloUltimoAvisoEscritura: esperaDelay ? Date.now() : 0,
    pToast: (e, m) => avisos.push(m),
    console: { error: () => {}, warn: () => {} },
    fetch: () => Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      clone: () => ({ text: () => Promise.resolve('{"message":"fallo simulado"}') })
    })
  };
  const fn = src.match(/function _veloFetchAndLog\(input, init, _url\)\{[\s\S]*?\n\}/)[0];
  const runner = new Function('ctx', `
    with (ctx) {
      ${fn}
      return _veloFetchAndLog(null, { method: ${JSON.stringify(metodo)} }, ${JSON.stringify(url)});
    }
  `);
  return runner(contexto).then(() => new Promise(r => setTimeout(() => r({ avisos, registro }), 20)));
}

const REST = 'https://x.supabase.co/rest/v1/help_posts';
const RPC  = 'https://x.supabase.co/rest/v1/rpc/velo_create_notif';
const AUTH = 'https://x.supabase.co/auth/v1/token';

(async function () {
  console.log('Aviso de escritura fallida\n');

  // ── Lo que SÍ debe avisar ────────────────────────────────────────────────
  for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const r = await escenario({ metodo: m, url: REST, status: 400 });
    comprobar(`${m} fallido avisa`, r.avisos.length === 1, r.avisos[0] || '(sin aviso)');
  }
  {
    const r = await escenario({ metodo: 'POST', url: RPC, status: 400 });
    comprobar('una RPC fallida también avisa', r.avisos.length === 1);
  }

  // ── Lo que NO debe avisar ────────────────────────────────────────────────
  {
    const r = await escenario({ metodo: 'GET', url: REST, status: 400 });
    comprobar('una LECTURA fallida no avisa', r.avisos.length === 0,
      'la pantalla ya se ve vacía; un cartel ahí sería ruido');
  }
  {
    const r = await escenario({ metodo: 'POST', url: REST, status: 409 });
    comprobar('un 409 no avisa', r.avisos.length === 0, 'es el conflicto normal de un upsert');
  }
  {
    const r = await escenario({ metodo: 'POST', url: REST, status: 201 });
    comprobar('una escritura correcta no avisa', r.avisos.length === 0);
  }
  {
    const r = await escenario({ metodo: 'POST', url: AUTH, status: 400 });
    comprobar('los fallos de /auth/v1 no avisan', r.avisos.length === 0,
      'el login ya muestra su propio mensaje');
  }

  // ── La telemetría no le habla al usuario ─────────────────────────────────
  for (const t of ['usage_events', 'ia_usage', 'vibe_views', 'bot_attempts']) {
    const r = await escenario({ metodo: 'POST', url: `https://x.supabase.co/rest/v1/${t}`, status: 500 });
    comprobar(`${t} falla en silencio`, r.avisos.length === 0,
      'se escribe sola, en segundo plano: nadie pidió nada');
    comprobar(`  …pero queda registrada`, r.registro.length === 1);
  }

  // ── El acelerador ────────────────────────────────────────────────────────
  {
    const r = await escenario({ metodo: 'POST', url: REST, status: 500, esperaDelay: true });
    comprobar('una ráfaga no encadena carteles', r.avisos.length === 0,
      'con un aviso reciente, el siguiente se calla');
  }

  // ── El registro sigue funcionando pase lo que pase ───────────────────────
  {
    const r = await escenario({ metodo: 'GET', url: REST, status: 500 });
    comprobar('la lectura fallida SÍ queda registrada', r.registro.length === 1,
      'veloDbErrors() la sigue viendo aunque no se avise');
  }

  console.log('');
  if (fallos) {
    console.error(`✗ ${fallos} fallo(s). NO desplegar sin revisarlo.`);
    process.exit(1);
  }
  console.log('✓ Todo correcto.');
})();
