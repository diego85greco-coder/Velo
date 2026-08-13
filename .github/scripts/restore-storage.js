/**
 * Devuelve los archivos de una copia a Storage.
 *
 *     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node .github/scripts/restore-storage.js ./backup/storage [--commit]
 *
 * POR DEFECTO NO SUBE NADA. Sin `--commit` compara la copia con lo que hay en
 * Storage y dice qué faltaría, igual que `restore.js` con las filas. Es la
 * forma de comprobar que una restauración funcionaría sin tocar nada.
 *
 * Cada archivo vuelve a su cubo con la MISMA ruta, porque la URL pública se
 * arma con la ruta: así las filas que ya apuntan ahí vuelven a funcionar solas.
 *
 * NO PISA lo que ya existe (`upsert: false`). Restaurar es recuperar lo
 * perdido, no revertir lo que la gente subió después.
 */

const fs = require('fs');
const path = require('path');

const SUPA_URL = process.env.SUPABASE_URL;
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dir      = process.argv[2];
const COMMIT   = process.argv.includes('--commit');

if (!SUPA_URL || !SERVICE) { console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!dir || !fs.existsSync(dir)) {
  console.error('Uso: node restore-storage.js <carpeta-storage-del-backup> [--commit]');
  process.exit(1);
}

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const TIPOS = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4'
};

function archivosDe(base, prefijo = '') {
  const salida = [];
  for (const e of fs.readdirSync(path.join(base, prefijo), { withFileTypes: true })) {
    const rel = prefijo ? `${prefijo}/${e.name}` : e.name;
    if (e.isDirectory()) salida.push(...archivosDe(base, rel));
    else if (e.name !== '_manifest.json') salida.push(rel);
  }
  return salida;
}

async function existe(bucket, ruta) {
  const r = await fetch(`${SUPA_URL}/storage/v1/object/info/${bucket}/${encodeURI(ruta)}`, { headers: H });
  return r.ok;
}

async function subir(bucket, ruta, absoluto) {
  const ext = path.extname(ruta).toLowerCase();
  const r = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${encodeURI(ruta)}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': TIPOS[ext] || 'application/octet-stream', 'x-upsert': 'false' },
    body: fs.readFileSync(absoluto)
  });
  if (!r.ok && r.status !== 409) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 150)}`);
}

(async () => {
  const cubos = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  console.log(COMMIT ? 'RESTAURANDO archivos\n' : 'SIMULACRO (sin --commit no se sube nada)\n');

  let faltan = 0, subidos = 0, ya = 0, fallos = 0;

  for (const cubo of cubos) {
    const base = path.join(dir, cubo);
    const rutas = archivosDe(base);
    for (const ruta of rutas) {
      const hay = await existe(cubo, ruta);
      if (hay) { ya++; continue; }
      faltan++;
      if (!COMMIT) { console.log(`  faltaría subir  ${cubo}/${ruta}`); continue; }
      try { await subir(cubo, ruta, path.join(base, ruta)); subidos++; console.log(`  ✓ ${cubo}/${ruta}`); }
      catch (e) { fallos++; console.error(`  ✗ ${cubo}/${ruta}: ${e.message}`); }
    }
    console.log(`  · ${cubo}: ${rutas.length} archivos en la copia`);
  }

  console.log(`\n${ya} ya estaban, ${faltan} faltan${COMMIT ? `, ${subidos} subidos, ${fallos} fallos` : ''}.`);
  if (fallos) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });
