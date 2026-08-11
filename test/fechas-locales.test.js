/**
 * Prueba de las claves de día.
 *
 *     node test/fechas-locales.test.js
 *
 * POR QUÉ EXISTE
 * Los ánimos se guardan con `velo_mood_<AAAA-MM-DD>`, y esa fecha se calcula
 * con `_dateKey()`, que usa la hora LOCAL. Tres sitios de la tarjeta semanal
 * los leían con `toISOString()`, que usa UTC.
 *
 * En el Río de la Plata (UTC−3) las dos coinciden 21 horas al día y difieren
 * las otras 3: de 21:00 a medianoche, en UTC ya es el día siguiente. En esa
 * franja la tarjeta buscaba cada día corrido uno — el emoji que aparecía bajo
 * «Lun» era el del domingo, y el ánimo registrado ese mismo día salía vacío.
 *
 * Por eso había pasado desapercibido meses: de día funciona bien.
 *
 * Esta prueba fija ese contrato. Lee `_dateKey` del propio premium.js.
 */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'premium.js'), 'utf8');
eval(src.match(/function _dateKey\(d\)\{[\s\S]*?\n\}/)[0]);

let fallos = 0;
function comprobar(nombre, ok, detalle) {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${nombre}${detalle ? '  — ' + detalle : ''}`);
}

console.log('Claves de día\n');

if (process.env.TZ !== 'America/Argentina/Buenos_Aires') {
  console.log('  (se relanza con TZ=America/Argentina/Buenos_Aires)\n');
  const r = require('child_process').spawnSync(
    process.execPath, [__filename],
    { stdio: 'inherit', env: { ...process.env, TZ: 'America/Argentina/Buenos_Aires' } });
  process.exit(r.status === null ? 1 : r.status);
}

// ── El caso que rompía: de noche, UTC ya cambió de día ──────────────────────
const noche = new Date('2026-08-10T22:30:00-03:00');
comprobar('de noche, _dateKey da el día local', _dateKey(noche) === '2026-08-10',
  `_dateKey=${_dateKey(noche)}`);
comprobar('y UTC da el siguiente (por eso no sirve como clave)',
  noche.toISOString().slice(0, 10) === '2026-08-11');

// ── De día las dos coinciden: por eso el fallo pasó meses inadvertido ───────
const mediodia = new Date('2026-08-10T12:00:00-03:00');
comprobar('de día ambas coinciden', _dateKey(mediodia) === mediodia.toISOString().slice(0, 10),
  'de ahí que el fallo sólo apareciera de 21:00 a medianoche');

// ── La semana de la tarjeta tiene que salir alineada ────────────────────────
const etiquetas = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
let desalineados = 0, desalineadosAntes = 0;
for (let i = 6; i >= 0; i--) {
  const d = new Date(noche); d.setDate(d.getDate() - i);
  // La etiqueta sale del día LOCAL; la clave tiene que salir del mismo día.
  if (_dateKey(d) !== _dateKey(d)) desalineados++;
  const claveLocal = _dateKey(d);
  const claveUtcAntigua = d.toISOString().slice(0, 10);
  if (claveLocal !== claveUtcAntigua) desalineadosAntes++;
  // comprobación real: la clave debe corresponder al día que dice la etiqueta
  const diaDeLaClave = new Date(claveLocal + 'T12:00:00-03:00').getDay();
  if (etiquetas[diaDeLaClave] !== etiquetas[d.getDay()]) desalineados++;
}
comprobar('los 7 días de la tarjeta quedan alineados', desalineados === 0,
  `${desalineados} desalineados`);
comprobar('con el método antiguo se desalineaban los 7 (era el bug)',
  desalineadosAntes === 7, `${desalineadosAntes} de 7`);

// ── Ningún sitio puede volver a leer un ánimo con clave UTC ─────────────────
const reincidencias = [];
src.split('\n').forEach((l, i) => {
  if (/velo_mood_/.test(l) && /toISOString\(\)\.(slice\(0,\s*10\)|split\('T'\)\[0\])/.test(l))
    reincidencias.push(i + 1);
});
comprobar('ninguna lectura de ánimo usa UTC', reincidencias.length === 0,
  reincidencias.length ? 'líneas ' + reincidencias.join(', ') : 'revisado todo premium.js');

// ── Cambio de mes y de año, que es donde suele fallar el padStart ───────────
comprobar('fin de mes', _dateKey(new Date('2026-01-31T23:59:00-03:00')) === '2026-01-31');
comprobar('fin de año', _dateKey(new Date('2026-12-31T23:00:00-03:00')) === '2026-12-31');
comprobar('un dígito lleva cero delante', _dateKey(new Date('2026-03-05T10:00:00-03:00')) === '2026-03-05');

console.log('');
if (fallos) {
  console.error(`✗ ${fallos} fallo(s).`);
  process.exit(1);
}
console.log('✓ Todo correcto.');
