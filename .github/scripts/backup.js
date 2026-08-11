/**
 * Copia de seguridad nocturna de la base.
 *
 * POR QUÉ EXISTE: el proyecto de Supabase está en plan gratuito, y el plan
 * gratuito NO incluye copias de seguridad automáticas. Si la base se pierde o
 * se corrompe, hoy no hay de dónde restaurarla: se pierden los diarios, los
 * ánimos y las conversaciones de todo el mundo, sin vuelta atrás. Además el
 * RGPD (art. 32.1.c) pide poder restaurar la disponibilidad de los datos.
 *
 * QUÉ HACE: lee todas las tablas por PostgREST con la service role key (que ya
 * es un secreto del repositorio, el mismo que usa el envío de notificaciones),
 * las escribe como JSON y las comprime.
 *
 * DÓNDE VA: el workflow la sube como ARTEFACTO de GitHub Actions, nunca al
 * repositorio. Un volcado con el diario íntimo de la gente commiteado en git
 * quedaría en el historial para siempre y sería una brecha, no un backup.
 *
 * LIMITACIÓN: no incluye los archivos de Storage (audios e imágenes) ni los
 * usuarios de auth.users, que PostgREST no expone. Para eso hace falta el plan
 * Pro o un pg_dump con la contraseña de la base.
 */

const SUPA_URL = process.env.SUPABASE_URL;
const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPA_URL || !SERVICE) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const fs = require('fs');
const path = require('path');

/**
 * LAS TABLAS SE DESCUBREN SOLAS  (corregido 11/08/2026)
 *
 * Antes había acá una lista escrita a mano de 54 nombres. El problema de una
 * lista a mano es que no avisa cuando se queda corta: se comprobó que dejaba
 * fuera `pro_patient_notes` —las notas clínicas que los profesionales escriben
 * sobre sus pacientes, el dato más sensible de la aplicación—, `data_requests`
 * (las peticiones de acceso y borrado del RGPD), `deleted_accounts` (el
 * registro de bajas, que es la prueba de que se atendió un borrado) y
 * `velo_retention_policy`. El backup decía «54/54 tablas» y parecía completo.
 *
 * Ahora se lee el esquema que PostgREST publica en su raíz, así que cualquier
 * tabla nueva entra sola. Sólo se excluye lo que está listado abajo, y el
 * motivo queda escrito. Si el descubrimiento fallara, se usa la lista de
 * reserva y el proceso avisa — pero nunca se guarda un backup incompleto
 * creyendo que está entero.
 */

// Vistas: no son datos, son consultas sobre las tablas que ya se copian.
const ES_VISTA = /(_full|_feed|_ids)$/;

// Excluidas a propósito, con su motivo.
const EXCLUIR = new Set([
  'ia_usage',            // contador efímero, se borra solo a las 48 h
  'velo_api_usage',      // idem
  '_policy_backup_'      // copia temporal de policies del incidente del 07/08
]);

// Sólo se usa si el descubrimiento falla. No hace falta mantenerla al día:
// existe para que un fallo de red no deje la noche sin copia.
const RESERVA = [
  'admin_news', 'bitacora_comment_reactions', 'bitacora_comments', 'bitacora_posts',
  'bitacora_reactions', 'bitacora_reports', 'bookings', 'bottle_reactions',
  'bottle_replies', 'bottles', 'broadcasts', 'buddy_requests', 'circle_members',
  'circle_messages', 'circles', 'contacts', 'content_reports', 'daily_responses',
  'data_requests', 'deleted_accounts', 'diary_entries', 'direct_messages',
  'donations', 'dq_comments', 'dq_reactions', 'guardian_presence',
  'guardian_requests', 'happy_history', 'happy_posts', 'help_posts',
  'moderation_flags', 'momento_comments', 'momentos', 'mood_entries',
  'news_reactions', 'plus_grants', 'pro_patient_notes', 'profiles', 'push_history',
  'quote_reactions', 'referrals', 'reportes', 'reviews', 'sessions',
  'solidarity_requests', 'support_matches', 'surveys', 'terms_acceptance',
  'usage_events', 'user_blocks', 'user_favorites', 'velo_notifications',
  'velo_retention_policy', 'vibe_comment_reactions', 'vibe_comments',
  'vibe_groups', 'vibe_reactions', 'vibe_views', 'vibes'
];

async function descubrirTablas() {
  const r = await fetch(`${SUPA_URL}/rest/v1/`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Accept: 'application/openapi+json' }
  });
  if (!r.ok) throw new Error(`raíz de PostgREST: HTTP ${r.status}`);
  const spec = await r.json();
  const defs = spec.definitions || (spec.components && spec.components.schemas) || {};
  const nombres = Object.keys(defs).filter(n => !ES_VISTA.test(n) && !EXCLUIR.has(n));
  if (nombres.length < 20) throw new Error(`sólo ${nombres.length} tablas descubiertas, parece incompleto`);
  return nombres.sort();
}

const PAGE = 1000;

async function dumpTable(name) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const url = `${SUPA_URL}/rest/v1/${name}?select=*`;
    const r = await fetch(url, {
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        Range: `${from}-${from + PAGE - 1}`,
        'Range-Unit': 'items'
      }
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`${name}: HTTP ${r.status} ${body.slice(0, 200)}`);
    }
    const batch = await r.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

(async function main() {
  const outDir = path.join(process.cwd(), 'backup');
  fs.mkdirSync(outDir, { recursive: true });

  let TABLES, origen;
  try {
    TABLES = await descubrirTablas();
    origen = 'descubiertas de PostgREST';
    const nuevas = TABLES.filter(t => !RESERVA.includes(t));
    if (nuevas.length) console.log(`  · tablas nuevas desde la última revisión: ${nuevas.join(', ')}`);
    const idas = RESERVA.filter(t => !TABLES.includes(t));
    if (idas.length) console.log(`  · ya no existen: ${idas.join(', ')}`);
  } catch (e) {
    TABLES = RESERVA;
    origen = 'lista de reserva (falló el descubrimiento: ' + e.message + ')';
    console.error(`  ⚠️  ${origen}`);
  }
  console.log(`${TABLES.length} tablas — ${origen}\n`);

  const summary = [];
  let failed = 0;

  for (const t of TABLES) {
    try {
      const rows = await dumpTable(t);
      fs.writeFileSync(path.join(outDir, `${t}.json`), JSON.stringify(rows));
      summary.push({ tabla: t, filas: rows.length });
      console.log(`  ✓ ${t}: ${rows.length}`);
    } catch (e) {
      failed++;
      summary.push({ tabla: t, error: e.message });
      console.error(`  ✗ ${t}: ${e.message}`);
    }
  }

  const total = summary.reduce((n, s) => n + (s.filas || 0), 0);
  fs.writeFileSync(path.join(outDir, '_manifest.json'), JSON.stringify({
    generado: new Date().toISOString(),
    tablas: summary.length,
    filas_totales: total,
    tablas_con_error: failed,
    origen_del_listado: origen,
    nota: 'No incluye Storage (audios/imagenes) ni auth.users.',
    detalle: summary
  }, null, 2));

  console.log(`\n${total} filas en ${TABLES.length - failed}/${TABLES.length} tablas.`);

  // Si falla más de un tercio de las tablas, algo está mal de verdad (clave
  // revocada, proyecto pausado) y conviene que el workflow se ponga en rojo en
  // vez de guardar un backup incompleto en silencio.
  if (failed > TABLES.length / 3) {
    console.error('Demasiadas tablas fallaron — el backup no es fiable.');
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
