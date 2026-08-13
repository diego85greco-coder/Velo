/**
 * Restaura una copia de seguridad en un PostgreSQL vacío y comprueba que entró
 * TODO. Es la prueba de que las copias sirven.
 *
 *     DATABASE_URL=postgres://... node .github/scripts/restore-local.js ./backup
 *
 * POR QUÉ EXISTE
 * Las copias nocturnas llevaban meses en verde y nadie había restaurado
 * ninguna. Un backup que no restauraste no es un backup: es una hipótesis. Y
 * esta hipótesis tenía dos agujeros que sólo aparecieron al probarla:
 *
 *   1. No existía la estructura. 27 tablas se habían creado a mano en el panel.
 *      (resuelto: `supabase/schema.sql`, que genera dump-schema.js)
 *   2. Faltaba `auth.users`. Cinco tablas —ánimos, diarios, respuestas diarias,
 *      reacciones y reportes— apuntan ahí con clave ajena, y PostgREST no
 *      expone esa tabla, así que el backup nunca la incluyó. Las filas más
 *      personales de la aplicación se habrían quedado fuera, en silencio.
 *      (resuelto: `velo_dump_auth_users()` → `auth_users.json`)
 *
 * EL ORDEN NO ESTÁ ESCRITO A MANO. Se calcula ordenando las tablas por sus
 * claves ajenas (orden topológico) leyendo la base recién creada. Una lista a
 * mano se queda vieja al primer `alter table` y falla el peor día.
 *
 * NO ES `restore.js`. Aquél restaura sobre un Supabase vivo por PostgREST y es
 * el que se usaría de verdad. Éste habla SQL directo contra una base desechable
 * y existe para probar, cada noche, que la copia de esa noche se puede volcar
 * entera.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const dir = process.argv[2];
if (!process.env.DATABASE_URL) { console.error('Falta DATABASE_URL'); process.exit(1); }
if (!dir || !fs.existsSync(dir)) { console.error('Uso: node restore-local.js <carpeta-del-backup>'); process.exit(1); }

const cli = new Client({ connectionString: process.env.DATABASE_URL });

/** Ordena las tablas para que ninguna entre antes que aquella a la que apunta. */
async function ordenPorDependencias(tablas) {
  const { rows } = await cli.query(`
    select c.relname as hija, rc.relname as padre
    from pg_constraint con
    join pg_class c   on c.oid  = con.conrelid
    join pg_class rc  on rc.oid = con.confrelid
    join pg_namespace n  on n.oid  = c.relnamespace
    join pg_namespace rn on rn.oid = rc.relnamespace
    where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
      and c.relname <> rc.relname`);   // las autorreferencias no ordenan nada

  const pendientes = new Set(tablas);
  const padresDe = new Map(tablas.map(t => [t, new Set()]));
  for (const { hija, padre } of rows) {
    if (pendientes.has(hija) && pendientes.has(padre)) padresDe.get(hija).add(padre);
  }

  const orden = [];
  const puestas = new Set();
  while (pendientes.size) {
    const listas = [...pendientes].filter(t => [...padresDe.get(t)].every(p => puestas.has(p)));
    if (!listas.length) {
      // Ciclo de claves ajenas: se meten las que quedan y que fallen ruidosamente
      // si de verdad no se puede, en vez de quedarse colgado acá.
      orden.push(...[...pendientes].sort());
      break;
    }
    for (const t of listas.sort()) { orden.push(t); puestas.add(t); pendientes.delete(t); }
  }
  return orden;
}

async function tiposDe(tabla) {
  const { rows } = await cli.query(
    `select column_name, data_type, udt_name, is_identity, identity_generation
       from information_schema.columns
      where table_schema='public' and table_name=$1`, [tabla]);
  return new Map(rows.map(r => [r.column_name, r]));
}

/** node-postgres manda los objetos JS como literal de array; para json/jsonb hay
 *  que darle el texto ya serializado o guarda `{"a":1}` como array de Postgres. */
function valorPara(v, col) {
  if (v === null || v === undefined) return null;
  if (!col) return v;
  const t = col.data_type;
  if (t === 'json' || t === 'jsonb') return typeof v === 'string' ? v : JSON.stringify(v);
  if (t === 'ARRAY') return Array.isArray(v) ? v : [v];
  return v;
}

(async () => {
  await cli.connect();

  // Las cuentas primero: cinco tablas les apuntan con clave ajena.
  const fAuth = path.join(dir, 'auth_users.json');
  let cuentas = 0;
  if (fs.existsSync(fAuth)) {
    const users = JSON.parse(fs.readFileSync(fAuth, 'utf8'));
    for (const u of users) {
      await cli.query(
        `insert into auth.users(id,email,created_at,last_sign_in_at,email_confirmed_at)
         values ($1,$2,$3,$4,$5) on conflict (id) do nothing`,
        [u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at]);
      cuentas++;
    }
    console.log(`auth.users: ${cuentas} cuentas`);
  } else {
    console.error('⚠️  No hay auth_users.json en la copia: las tablas con clave ajena a auth.users van a fallar.');
  }

  const archivos = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && f !== '_manifest.json' && f !== 'auth_users.json')
    .map(f => f.replace(/\.json$/, ''));

  const { rows: existentes } = await cli.query(
    `select tablename from pg_tables where schemaname='public'`);
  const enLaBase = new Set(existentes.map(r => r.tablename));

  const sinTabla = archivos.filter(t => !enLaBase.has(t));
  const aCargar  = archivos.filter(t => enLaBase.has(t));
  const orden    = await ordenPorDependencias(aCargar);

  const problemas = [];
  let totalEsperado = 0, totalCargado = 0;

  for (const tabla of orden) {
    const filas = JSON.parse(fs.readFileSync(path.join(dir, `${tabla}.json`), 'utf8'));
    totalEsperado += filas.length;
    if (!filas.length) { console.log(`  · ${tabla}: 0`); continue; }

    const tipos = await tiposDe(tabla);
    const cols = Object.keys(filas[0]).filter(c => tipos.has(c));
    const ignoradas = Object.keys(filas[0]).filter(c => !tipos.has(c));
    if (ignoradas.length) problemas.push(`${tabla}: la copia trae columnas que la estructura no tiene (${ignoradas.join(', ')})`);

    // Una columna GENERATED ALWAYS AS IDENTITY rechaza cualquier valor, aunque
    // sea el suyo de siempre. Restaurar es precisamente devolverle el que tenía,
    // porque otras filas apuntan a él. En producción esas nueve columnas se
    // pasaron a BY DEFAULT (migración 20260813c) justamente por eso, pero acá se
    // contempla igual: si alguien crea mañana una tabla con ALWAYS, esta prueba
    // tiene que decir qué falta, no morirse.
    const hayAlways = cols.some(c => {
      const t = tipos.get(c);
      return t && t.is_identity === 'YES' && t.identity_generation === 'ALWAYS';
    });
    const overriding = hayAlways ? ' overriding system value' : '';
    if (hayAlways) problemas.push(`${tabla}: la columna id es GENERATED ALWAYS — por PostgREST (restore.js) no se podría restaurar con su id original`);

    let ok = 0;
    for (const fila of filas) {
      const vals = cols.map(c => valorPara(fila[c], tipos.get(c)));
      const ph = cols.map((_, i) => `$${i + 1}`).join(',');
      try {
        await cli.query(
          `insert into public."${tabla}" (${cols.map(c => `"${c}"`).join(',')})${overriding}
           values (${ph}) on conflict do nothing`, vals);
        ok++;
      } catch (e) {
        problemas.push(`${tabla}: ${e.message.split('\n')[0]}`);
        break;   // una fila rota suele significar que están todas rotas igual
      }
    }
    totalCargado += ok;
    console.log(`  ${ok === filas.length ? '✓' : '✗'} ${tabla}: ${ok}/${filas.length}`);
  }

  console.log(`\n${totalCargado}/${totalEsperado} filas en ${orden.length} tablas, más ${cuentas} cuentas.`);

  if (sinTabla.length) problemas.push(`la estructura no tiene estas tablas que sí están en la copia: ${sinTabla.join(', ')}`);
  if (totalCargado !== totalEsperado) problemas.push(`faltaron ${totalEsperado - totalCargado} filas`);

  await cli.end();

  if (problemas.length) {
    console.error('\n✗ La copia NO se restaura entera:');
    problemas.forEach(p => console.error('   · ' + p));
    process.exit(1);
  }
  console.log('\n✓ La copia se restaura entera en una base vacía.');
})().catch(e => { console.error(e); process.exit(1); });
