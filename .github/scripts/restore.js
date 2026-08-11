/**
 * Restauración a partir de una copia de seguridad generada por backup.js.
 *
 * Un backup que nunca se restauró no es un backup: es un archivo. Este script
 * es la contraparte de `backup.js` y existe para que la restauración sea un
 * procedimiento probado y no una improvisación el peor día.
 *
 * USO
 *   1. Descargar el artefacto del workflow "Copia de seguridad de la base"
 *      (GitHub → Actions → la ejecución → Artifacts) y descomprimirlo.
 *   2. SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *      node .github/scripts/restore.js ./backup [--commit] [--only tabla1,tabla2]
 *
 * POR DEFECTO NO ESCRIBE NADA. Sin `--commit` hace un simulacro: compara el
 * contenido del backup con lo que hay en la base y dice qué haría. Es la forma
 * de comprobar que una restauración funcionaría sin arriesgar los datos vivos.
 *
 * Con `--commit` inserta las filas del backup que no existan (por `id`). NO
 * borra ni pisa lo que ya está: una restauración es para recuperar lo perdido,
 * no para revertir el trabajo de la gente. Si hace falta volver a un punto
 * exacto en el tiempo, hay que vaciar la tabla a mano antes, con criterio.
 *
 * LIMITACIONES (heredadas de backup.js): no restaura los archivos de Storage
 * (audios e imágenes) ni las credenciales de acceso de auth.users.
 */

const fs = require('fs');
const path = require('path');

const SUPA_URL = process.env.SUPABASE_URL;
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dir      = process.argv[2];
const COMMIT   = process.argv.includes('--commit');
const onlyArg  = process.argv.indexOf('--only');
const ONLY     = onlyArg > -1 && process.argv[onlyArg + 1]
  ? process.argv[onlyArg + 1].split(',').map(s => s.trim())
  : null;

if (!SUPA_URL || !SERVICE) { console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!dir || !fs.existsSync(dir)) {
  console.error('Uso: node restore.js <carpeta-del-backup> [--commit] [--only t1,t2]');
  process.exit(1);
}

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

async function countLive(table) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=*`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' }
  });
  if (!r.ok) return null;
  const cr = r.headers.get('content-range') || '';   // "0-0/123"
  const n = cr.split('/')[1];
  return n === '*' ? null : parseInt(n, 10);
}

async function existingIds(table, ids) {
  // Consulta en lotes para no armar una URL infinita
  const found = new Set();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200).map(v => `"${String(v).replace(/"/g, '\\"')}"`);
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=id&id=in.(${chunk.join(',')})`, { headers: H });
    if (!r.ok) return null;
    (await r.json()).forEach(row => found.add(String(row.id)));
  }
  return found;
}

async function insertRows(table, rows) {
  let ok = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal,resolution=ignore-duplicates' },
      body: JSON.stringify(rows.slice(i, i + 200))
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status} ${body.slice(0, 200)}`);
    }
    ok += Math.min(200, rows.length - i);
  }
  return ok;
}

/**
 * EL ORDEN DE RESTAURACIÓN IMPORTA  (corregido 11/08/2026)
 *
 * Antes se restauraba en orden alfabético (`files.sort()`). Hay 15 tablas con
 * clave ajena contra `profiles`, y alfabéticamente `profiles` va DESPUÉS de casi
 * todas: bookings, circles, contacts, diary_entries, direct_messages, momentos…
 * Todas habrían fallado con violación de clave ajena. Lo mismo en la cadena de
 * Vibes: `vibe_comments` depende de `vibes`, que alfabéticamente va última, y
 * `vibe_comment_reactions` depende de `vibe_comments`.
 *
 * O sea: la restauración se rompía justo el día que hiciera falta usarla, que es
 * el único día que importa. Nadie lo había notado porque restaurar de verdad no
 * se había probado nunca.
 *
 * Las que no dependen de nadie van primero, en el orden en que hay que
 * insertarlas; el resto sigue alfabético. Como la inserción usa
 * `resolution=ignore-duplicates`, volver a pasar una tabla es inofensivo.
 */
// El orden de esta lista ES la dependencia: cada una antes de las que la citan.
// `vibe_groups` va antes que `vibes`, y `vibes` antes que `vibe_comments`.
const PRIMERO = ['profiles', 'vibe_groups', 'vibes', 'vibe_comments',
                 'bitacora_posts', 'momentos', 'circles'];

function ordenar(files) {
  const nombre = f => f.replace(/\.json$/, '');
  const cabeza = PRIMERO.map(t => t + '.json').filter(f => files.includes(f));
  const resto  = files.filter(f => !cabeza.includes(f)).sort();
  return cabeza.concat(resto);
}

(async function main() {
  const manifestPath = path.join(dir, '_manifest.json');
  if (fs.existsSync(manifestPath)) {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`Backup del ${m.generado} · ${m.filas_totales} filas en ${m.tablas} tablas\n`);
  }

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && f !== '_manifest.json')
    .filter(f => !ONLY || ONLY.includes(f.replace(/\.json$/, '')));

  console.log(COMMIT ? '⚠️  MODO ESCRITURA — se insertarán las filas que falten\n'
                     : '🔍 SIMULACRO — no se escribe nada. Añadí --commit para restaurar de verdad.\n');

  let totalFaltan = 0, totalRestauradas = 0, errores = 0;

  for (const f of ordenar(files)) {
    const table = f.replace(/\.json$/, '');
    let rows;
    try { rows = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { console.error(`  ✗ ${table}: backup ilegible — ${e.message}`); errores++; continue; }
    if (!Array.isArray(rows) || !rows.length) { console.log(`  · ${table}: vacío`); continue; }

    const live = await countLive(table);
    if (live === null) { console.error(`  ✗ ${table}: no se pudo leer la tabla`); errores++; continue; }

    const ids = rows.map(r => r.id).filter(v => v !== undefined && v !== null);
    let faltan = rows.length;
    if (ids.length === rows.length) {
      const have = await existingIds(table, ids);
      if (have === null) { console.error(`  ✗ ${table}: no se pudo comparar`); errores++; continue; }
      faltan = rows.filter(r => !have.has(String(r.id))).length;
    }
    totalFaltan += faltan;

    const estado = faltan === 0 ? '✓ al día' : `⟳ faltan ${faltan}`;
    console.log(`  ${faltan === 0 ? '✓' : '⟳'} ${table}: backup ${rows.length} · en la base ${live} · ${estado}`);

    if (COMMIT && faltan > 0) {
      // Se envían TODAS las filas del backup: `resolution=ignore-duplicates`
      // hace que las que ya existan se descarten en el servidor. Así no hay que
      // volver a calcular cuáles faltan, y no se pisa nada que esté vivo.
      try { totalRestauradas += await insertRows(table, rows); }
      catch (e) { console.error(`      ✗ error al restaurar: ${e.message}`); errores++; }
    }
  }

  console.log(`\nFilas del backup que NO están en la base: ${totalFaltan}`);
  if (COMMIT) console.log(`Filas enviadas para restaurar: ${totalRestauradas}`);
  if (errores) { console.error(`${errores} tabla(s) con error.`); process.exit(1); }
  console.log(totalFaltan === 0
    ? '\nLa base contiene todo lo que hay en el backup. Restauración verificada.'
    : '\nHay filas en el backup que no están en la base. Con --commit se restauran.');
})().catch(e => { console.error(e); process.exit(1); });
