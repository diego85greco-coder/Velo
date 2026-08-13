/**
 * Guarda la ESTRUCTURA de la base en `supabase/schema.sql`.
 *
 * POR QUÉ EXISTE
 * `backup.js` guarda los datos. Esto guarda dónde van. Hasta el 13/08/2026 lo
 * segundo no existía: 27 de las 61 tablas —incluidas `profiles`, `momentos`,
 * `circles`, `daily_responses` y `reviews`— se habían creado a mano en el panel
 * de Supabase y no tenían ningún `create table` en el repositorio. Perder el
 * proyecto significaba tener 1231 filas de diarios y ánimos sin ningún sitio
 * donde volcarlas, y las policies, los índices y los triggers perdidos.
 *
 * El plan gratuito no da `pg_dump` ni la contraseña de la base, así que el
 * volcado lo genera la propia base con `velo_dump_schema()` (SECURITY DEFINER,
 * sólo service_role) y esto lo escribe en el repositorio.
 *
 * VA A GIT, a diferencia del backup de datos: el DDL no contiene nada de nadie,
 * y un respaldo de la estructura sólo sirve si está en un sitio distinto del
 * que se puede perder.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node .github/scripts/dump-schema.js
 */

const fs = require('fs');
const path = require('path');

const SUPA_URL = process.env.SUPABASE_URL;
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPA_URL || !SERVICE) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

async function rpc(nombre) {
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${nombre}`, {
    method: 'POST', headers: H, body: '{}'
  });
  if (!r.ok) throw new Error(`${nombre}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

(async () => {
  const ddl = await rpc('velo_dump_schema');

  if (typeof ddl !== 'string' || ddl.length < 10000) {
    // Un volcado corto es un volcado roto. Antes que pisar el bueno con basura,
    // el proceso se cae y el workflow se pone en rojo.
    console.error(`El volcado vino corto (${typeof ddl}, ${(ddl || '').length} caracteres). No se pisa el archivo.`);
    process.exit(1);
  }

  const cuenta = (re) => (ddl.match(re) || []).length;
  const tablas   = cuenta(/^create table if not exists/gm);
  const policies = cuenta(/^create policy /gm);
  const vistas   = cuenta(/^create or replace view /gm);

  if (tablas < 50 || policies < 100) {
    console.error(`Faltan piezas: ${tablas} tablas, ${policies} policies. No se pisa el archivo.`);
    process.exit(1);
  }

  const destino = path.join(__dirname, '..', '..', 'supabase', 'schema.sql');
  const antes = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : '';
  fs.writeFileSync(destino, ddl);

  console.log(`schema.sql — ${tablas} tablas, ${policies} policies, ${vistas} vistas, ${ddl.length} caracteres`);
  console.log(antes === ddl ? 'Sin cambios desde el último volcado.' : 'La estructura cambió desde el último volcado.');
})().catch(e => { console.error(e.message); process.exit(1); });
