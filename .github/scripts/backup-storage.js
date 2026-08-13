/**
 * Copia de seguridad de los ARCHIVOS (Storage).
 *
 * POR QUÉ EXISTE
 * `backup.js` guarda las filas y `dump-schema.js` la estructura, pero los
 * archivos que sube la gente vivían fuera de las dos. En la base sólo queda la
 * URL: si se pierde el proyecto, las filas se restauran apuntando a fotos y
 * audios que ya no existen. Una nota de voz de alguien contando cómo está no se
 * reconstruye desde su URL.
 *
 * Son tres cubos y hoy pesan 24 MB entre todos, así que entran de sobra en el
 * mismo artefacto que el resto de la copia:
 *
 *   vibes        — fotos y audios que publica la gente     ← lo que importa
 *   avatars      — fotos de perfil
 *   velo-assets  — imágenes de la propia aplicación (fondos, ilustraciones)
 *
 * El tercero se copia igual: es reponible a mano, pero reponerlo a mano el día
 * malo son horas, y pesa poco.
 *
 * SE RESTAURA volviendo a subir cada archivo a su cubo con la MISMA ruta: la
 * URL pública se arma con la ruta, así que las filas que ya apuntan ahí vuelven
 * a funcionar solas.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node .github/scripts/backup-storage.js
 */

const fs = require('fs');
const path = require('path');

const SUPA_URL = process.env.SUPABASE_URL;
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPA_URL || !SERVICE) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const HJ = { ...H, 'Content-Type': 'application/json' };

// Tope de cordura. Hoy son 24 MB; si un día son 2 GB, el artefacto no es el
// sitio y hay que decirlo en voz alta en vez de que el workflow tarde una hora
// y falle solo.
const TOPE_BYTES = 500 * 1024 * 1024;

async function cubos() {
  const r = await fetch(`${SUPA_URL}/storage/v1/bucket`, { headers: H });
  if (!r.ok) throw new Error(`listar cubos: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** Lista un cubo entero, entrando en las carpetas (la API no es recursiva). */
async function listar(bucket, prefijo = '') {
  const encontrados = [];
  for (let offset = 0; ; offset += 100) {
    const r = await fetch(`${SUPA_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST', headers: HJ,
      body: JSON.stringify({ prefix: prefijo, limit: 100, offset })
    });
    if (!r.ok) throw new Error(`listar ${bucket}/${prefijo}: HTTP ${r.status}`);
    const lote = await r.json();
    for (const o of lote) {
      const ruta = prefijo ? `${prefijo}/${o.name}` : o.name;
      // Sin `id` = es una carpeta, no un archivo.
      if (o.id === null || o.id === undefined) encontrados.push(...await listar(bucket, ruta));
      else encontrados.push({ ruta, size: (o.metadata && o.metadata.size) || 0 });
    }
    if (lote.length < 100) break;
  }
  return encontrados;
}

async function bajar(bucket, ruta, destino) {
  const r = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${encodeURI(ruta)}`, { headers: H });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, buf);
  return buf.length;
}

(async () => {
  const outDir = path.join(process.cwd(), 'backup', 'storage');
  fs.mkdirSync(outDir, { recursive: true });

  const lista = await cubos();
  console.log(`${lista.length} cubos\n`);

  const manifiesto = [];
  let totalBytes = 0, totalArchivos = 0, fallos = 0;

  for (const b of lista) {
    let objetos;
    try {
      objetos = await listar(b.id);
    } catch (e) {
      fallos++;
      console.error(`  ✗ ${b.id}: ${e.message}`);
      continue;
    }

    const peso = objetos.reduce((n, o) => n + (o.size || 0), 0);
    if (totalBytes + peso > TOPE_BYTES) {
      console.error(`  ✗ ${b.id}: ${objetos.length} archivos, ${(peso/1048576).toFixed(1)} MB —`);
      console.error(`     se pasa del tope de ${TOPE_BYTES/1048576} MB. El artefacto ya no es el sitio`);
      console.error('     para estos archivos: hace falta un bucket externo o el plan Pro.');
      fallos++;
      continue;
    }

    let ok = 0, bytes = 0;
    for (const o of objetos) {
      try {
        bytes += await bajar(b.id, o.ruta, path.join(outDir, b.id, o.ruta));
        ok++;
      } catch (e) {
        fallos++;
        console.error(`  ✗ ${b.id}/${o.ruta}: ${e.message}`);
      }
    }
    totalBytes += bytes; totalArchivos += ok;
    manifiesto.push({ cubo: b.id, publico: b.public, archivos: ok, esperados: objetos.length, bytes });
    console.log(`  ${ok === objetos.length ? '✓' : '✗'} ${b.id}: ${ok}/${objetos.length} archivos, ${(bytes/1048576).toFixed(1)} MB`);
  }

  fs.writeFileSync(path.join(outDir, '_manifest.json'), JSON.stringify({
    generado: new Date().toISOString(),
    cubos: manifiesto,
    archivos_totales: totalArchivos,
    bytes_totales: totalBytes,
    nota: 'Se restaura volviendo a subir cada archivo a su cubo con la MISMA ruta: la URL publica se arma con la ruta.'
  }, null, 2));

  console.log(`\n${totalArchivos} archivos, ${(totalBytes/1048576).toFixed(1)} MB.`);

  if (fallos) {
    console.error(`${fallos} fallo(s) — la copia de archivos no está entera.`);
    process.exit(1);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
