/**
 * Prueba de la red local de crisis.
 *
 *     node test/crisis-red-local.test.js
 *
 * POR QUÉ EXISTE
 * `_geminiCrisisCheck` es quien abre el SOS, deja el aviso en el Buzón y
 * registra el evento para moderación. Empieza así:
 *
 *     var result = await _geminiCall(prompt);
 *     if(!result) return;          ← si la IA no responde, no pasa NADA
 *
 * Se llama desde tres sitios. Hasta v1648 sólo uno —publicar en la Sala de
 * Ayuda— tenía además el detector local, que corre en el navegador y no
 * depende de nada. Los otros dos son **chats**: el del guardián y el del
 * acompañante de IA. Justamente donde alguien escribe «me quiero matar»,
 * porque se siente una conversación.
 *
 * Con el crédito de Gemini agotado —es prepago— o la API caída, en esos dos
 * caminos la persona no veía ninguna línea de crisis.
 *
 * Esta prueba comprueba que la red local actúe SIN IA, que no se convierta en
 * ruido repitiéndose en cada mensaje, y que los tres caminos la tengan puesta.
 *
 * Lee las funciones DEL PROPIO premium.js, así que no puede desincronizarse.
 */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'premium.js'), 'utf8');

let fallos = 0;
function comprobar(nombre, ok, detalle) {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${nombre}${detalle ? '  — ' + detalle : ''}`);
}

function montar() {
  const estado = { sos: 0, avisos: [], registrados: [] };
  const ctx = {
    _crisisSOSUltimo: 0,
    pOpenSOS: () => estado.sos++,
    pToast: (e, m) => estado.avisos.push(m),
    _sbSaveCrisisEvent: (n, r, d) => estado.registrados.push({ nivel: n, razon: r }),
    setTimeout: (f) => f(),          // sin esperas en la prueba
    Date: Date,
  };
  const codigo =
    src.match(/var _CRISIS_FIGURADO = [\s\S]*?;/)[0] + '\n' +
    src.match(/var _CRISIS_RE = new RegExp\([\s\S]*?\n\);/)[0] + '\n' +
    src.match(/function _localCrisisCheck\(msg\)\{[\s\S]*?\n\}/)[0] + '\n' +
    src.match(/function _crisisRedLocal\(texto\)\{[\s\S]*?\n\}/)[0] + '\n' +
    'return { _crisisRedLocal, avanzar: (ms) => { _crisisSOSUltimo -= ms; } };';
  const api = new Function('ctx', `with (ctx) { ${codigo} }`)(ctx);
  return { api, estado };
}

console.log('Red local de crisis (sin IA)\n');

// ── Actúa sin ninguna llamada a la IA ───────────────────────────────────────
{
  const { api, estado } = montar();
  const r = api._crisisRedLocal('no doy más, me quiero matar');
  comprobar('ante una crisis, abre el SOS sin IA', r === true && estado.sos === 1);
  comprobar('  …y avisa que no es un servicio de emergencia',
    estado.avisos.some(a => /emergencia/i.test(a)), estado.avisos[0] || '');
  comprobar('  …y lo registra para moderación',
    estado.registrados.length === 1 && estado.registrados[0].nivel === 'local');
}

// ── Lenguaje cotidiano no dispara nada ──────────────────────────────────────
{
  const { api, estado } = montar();
  const frases = ['me muero de risa', 'estoy cansado del trabajo', 'me mata la curiosidad'];
  frases.forEach(f => api._crisisRedLocal(f));
  comprobar('el lenguaje cotidiano no abre nada', estado.sos === 0,
    frases.length + ' frases, 0 SOS');
}

// ── No se repite en cada mensaje del chat ───────────────────────────────────
{
  const { api, estado } = montar();
  for (let i = 0; i < 5; i++) api._crisisRedLocal('me quiero morir');
  comprobar('en un chat no repite el cartel', estado.sos === 1,
    `5 mensajes seguidos → ${estado.sos} SOS`);
}

// ── Pero vuelve a ofrecerlo si pasa el tiempo ───────────────────────────────
{
  const { api, estado } = montar();
  api._crisisRedLocal('me quiero morir');
  api.avanzar(11 * 60 * 1000);          // 11 minutos después
  api._crisisRedLocal('sigo igual, no quiero seguir viviendo');
  comprobar('pasados 10 min vuelve a ofrecerlo', estado.sos === 2,
    `${estado.sos} SOS`);
}

// ── Los tres caminos tienen la red puesta ───────────────────────────────────
{
  const llamadas = (src.match(/_crisisRedLocal\(/g) || []).length - 1;   // menos la definición
  comprobar('los chats la tienen enchufada', llamadas >= 2, llamadas + ' puntos de llamada');
  const salaDeAyuda = /if\(_risky\)\{[\s\S]{0,400}pOpenSOS\(\)/.test(src);
  comprobar('la Sala de Ayuda conserva la suya (v1506)', salaDeAyuda);
}

console.log('');
if (fallos) {
  console.error(`✗ ${fallos} fallo(s). Esto es la red de seguridad de la app.`);
  process.exit(1);
}
console.log('✓ Todo correcto.');
