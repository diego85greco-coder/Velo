/**
 * Prueba del orden de restauración.
 *
 *     node test/restore-order.test.js
 *
 * POR QUÉ EXISTE
 * `restore.js` es el plan de contingencia: el proyecto está en el plan gratuito
 * de Supabase, que no incluye copias automáticas. Si la base se pierde, esto es
 * lo único que hay.
 *
 * Restauraba en orden alfabético. Hay 15 tablas con clave ajena contra
 * `profiles`, y alfabéticamente `profiles` va después de casi todas — habrían
 * fallado todas por violación de clave ajena. Igual en la cadena de Vibes:
 * `vibe_comment_reactions` → `vibe_comments` → `vibes`, que alfabéticamente
 * viene justo al revés.
 *
 * Se descubrió leyendo las claves ajenas de las migraciones, no probándolo: una
 * restauración de verdad nunca se había hecho. Esta prueba existe para que el
 * orden no vuelva a romperse en silencio.
 *
 * Lee la función DEL PROPIO restore.js (no una copia), así que no puede
 * desincronizarse.
 */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'scripts', 'restore.js'), 'utf8');

// Se evalúan juntos: `ordenar` cierra sobre `PRIMERO`, y un `const` dentro de
// un eval no sale de su propio bloque.
// Se envuelven en una función para que sus declaraciones no choquen con las de
// acá, y se devuelve `ordenar` ya cerrada sobre `PRIMERO`.
const ordenar = eval('(function(){' +
  src.match(/const PRIMERO = \[[\s\S]*?\];/)[0] + '\n' +
  src.match(/function ordenar\(files\)\s*\{[\s\S]*?\n\}/)[0] +
  '\nreturn ordenar; })()');

// Dependencias reales, sacadas de las migraciones (`references public.X`).
const DEPENDE_DE = {
  bookings: 'profiles', circles: 'profiles', contacts: 'profiles',
  diary_entries: 'profiles', direct_messages: 'profiles', momentos: 'profiles',
  bitacora_posts: 'profiles', help_posts: 'profiles', mood_entries: 'profiles',
  bottle_reactions: 'profiles', bottle_replies: 'profiles',
  content_reports: 'profiles', dq_reactions: 'profiles',
  vibe_reactions: 'profiles', vibe_comments: 'vibes',
  vibe_comment_reactions: 'vibe_comments', vibes: 'vibe_groups',
  bitacora_comments: 'bitacora_posts', momento_comments: 'momentos',
  circle_members: 'circles', circle_messages: 'circles',
};

const TABLAS = [...new Set([
  ...Object.keys(DEPENDE_DE), ...Object.values(DEPENDE_DE),
  'admin_news', 'broadcasts', 'donations', 'surveys', 'reviews', 'sessions',
  'pro_patient_notes', 'data_requests', 'deleted_accounts', 'user_blocks',
])].sort();

const archivos = TABLAS.map(t => t + '.json');

let fallos = 0;
function comprobar(nombre, ok, detalle) {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${nombre}${detalle ? '  — ' + detalle : ''}`);
}

function violaciones(orden) {
  const vistas = new Set(), malas = [];
  for (const f of orden) {
    const t = f.replace(/\.json$/, '');
    const dep = DEPENDE_DE[t];
    if (dep && !vistas.has(dep)) malas.push(`${t} antes que ${dep}`);
    vistas.add(t);
  }
  return malas;
}

console.log('Orden de restauración\n');

// ── El orden alfabético (el de antes) tiene que fallar ──────────────────────
const alfabetico = violaciones([...archivos].sort());
comprobar('el orden alfabético rompe claves ajenas (era el bug)',
  alfabetico.length > 0, `${alfabetico.length} violaciones, p. ej. ${alfabetico[0]}`);

// ── El orden nuevo no puede tener ninguna ───────────────────────────────────
const nuevo = violaciones(ordenar(archivos));
comprobar('el orden corregido no rompe ninguna', nuevo.length === 0,
  nuevo.length ? nuevo.join(' · ') : 'las ' + archivos.length + ' tablas en orden válido');

// ── No se puede perder ni duplicar ninguna tabla ────────────────────────────
const salida = ordenar(archivos);
comprobar('no se pierde ninguna tabla', salida.length === archivos.length,
  `entraron ${archivos.length}, salieron ${salida.length}`);
comprobar('no se duplica ninguna', new Set(salida).size === salida.length);

// ── Debe aguantar que falte un archivo del backup ───────────────────────────
const sinProfiles = archivos.filter(f => f !== 'profiles.json');
const parcial = ordenar(sinProfiles);
comprobar('tolera que falte una tabla de la cabecera',
  parcial.length === sinProfiles.length && !parcial.includes('profiles.json'));

// ── Y que aparezca una tabla nueva que nadie previó ─────────────────────────
const conNueva = archivos.concat(['tabla_nueva.json']);
comprobar('una tabla nueva entra igual', ordenar(conNueva).includes('tabla_nueva.json'));

console.log(`\n${archivos.length} tablas · ${Object.keys(DEPENDE_DE).length} dependencias comprobadas`);
if (fallos) {
  console.error(`\n✗ ${fallos} fallo(s). La restauración no es fiable.`);
  process.exit(1);
}
console.log('\n✓ Todo correcto.');
