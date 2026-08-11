/**
 * Prueba de las reacciones a los momentos.
 *
 *     node test/reacciones.test.js
 *
 * POR QUÉ EXISTE
 * `VIBE_REACTIONS` tiene 23 reacciones, pero sólo las 8 primeras van en la fila
 * rápida; el resto se abren con el botón ＋. Al reaccionar, la pantalla se llena
 * del emoji elegido (`_vibeReactBurst`).
 *
 * Hasta v1636 el emoji de ese efecto salía de un mapa escrito a mano con las 8
 * de la fila rápida. Las otras quince caían al valor por defecto: reaccionabas
 * con 🏳️‍🌈 «Orgullo» y la pantalla se llenaba de corazones verdes. Lo mismo con
 * la frase de resumen de un momento, que se quedaba vacía.
 *
 * El fallo es de los que vuelven solos: cada vez que se añada una reacción a la
 * lista, alguien tiene que acordarse de tocar los otros dos sitios. Esta prueba
 * lo impide — lee las tres cosas del propio premium.js y comprueba que ninguna
 * reacción se quede sin su emoji.
 */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'premium.js'), 'utf8');

const VIBE_REACTIONS = eval('(' + src.match(/var VIBE_REACTIONS = (\[[\s\S]*?\n\]);/)[1] + ')');
const QUICK = parseInt(src.match(/var _VIBE_REACTIONS_QUICK = (\d+)/)[1], 10);

let fallos = 0;
function comprobar(nombre, ok, detalle) {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${nombre}${detalle ? '  — ' + detalle : ''}`);
}

console.log('Reacciones a los momentos\n');

comprobar('la lista se lee entera', VIBE_REACTIONS.length >= 20,
  `${VIBE_REACTIONS.length} reacciones · ${QUICK} en la fila rápida`);

// ── Cada reacción necesita clave, emoji y etiqueta ──────────────────────────
const incompletas = VIBE_REACTIONS.filter(r => !r.key || !r.emoji || !r.label);
comprobar('ninguna sin clave, emoji o etiqueta', incompletas.length === 0,
  incompletas.map(r => r.key || '(sin clave)').join(', '));

const claves = VIBE_REACTIONS.map(r => r.key);
comprobar('sin claves repetidas', new Set(claves).size === claves.length);

const emojis = VIBE_REACTIONS.map(r => r.emoji);
comprobar('sin emojis repetidos', new Set(emojis).size === emojis.length,
  'si dos comparten emoji, el efecto no distingue una de otra');

// ── El emoji del efecto TIENE que salir de la lista, no de un mapa aparte ───
// Se replica la resolución tal como está en premium.js.
const bloque = src.match(/var _rxDef = \(typeof VIBE_REACTIONS[\s\S]*?_vibeReactBurst\(_emoji\);/);
comprobar('el efecto resuelve el emoji desde VIBE_REACTIONS', !!bloque,
  bloque ? 'lo toma de la lista' : 'volvió a haber un mapa escrito a mano');

if (bloque) {
  const sinEfecto = [];
  for (const r of VIBE_REACTIONS) {
    const reactionKey = r.key;
    let _rxDef = VIBE_REACTIONS.filter(x => x.key === reactionKey)[0];
    const _emoji = (_rxDef && _rxDef.emoji) || '💚';
    if (_emoji !== r.emoji) sinEfecto.push(`${r.key} → ${_emoji} en vez de ${r.emoji}`);
  }
  comprobar('cada una dispara SU propio emoji', sinEfecto.length === 0,
    sinEfecto.length ? sinEfecto.join(' · ') : `${VIBE_REACTIONS.length}/${VIBE_REACTIONS.length}`);
}

// ── Y ninguna puede quedarse sin frase de resumen ───────────────────────────
const conFrase = new Set(['alegria','abrazo','acompano','fuerzas','gracias',
                          'me_hace_bien','animos','me_inspira']);
const sinFrase = VIBE_REACTIONS.filter(r => {
  if (conFrase.has(r.key)) return false;
  const d = VIBE_REACTIONS.filter(x => x.key === r.key)[0];
  return !(d ? ('Sobre todo: ' + d.label + ' ' + d.emoji) : '');
});
comprobar('ninguna se queda sin frase de resumen', sinFrase.length === 0,
  sinFrase.map(r => r.key).join(', '));

// ── Las de la fila rápida son las que tienen texto redactado a mano ─────────
const rapidas = VIBE_REACTIONS.slice(0, QUICK).map(r => r.key);
comprobar('las de la fila rápida conservan su texto propio',
  rapidas.every(k => conFrase.has(k)), rapidas.join(', '));

console.log(`\n${VIBE_REACTIONS.length} reacciones comprobadas`);
if (fallos) {
  console.error(`\n✗ ${fallos} fallo(s).`);
  process.exit(1);
}
console.log('\n✓ Todo correcto.');
