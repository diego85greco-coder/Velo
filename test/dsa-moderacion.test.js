/**
 * Prueba del circuito de moderación del DSA.
 *
 *     node test/dsa-moderacion.test.js
 *
 * POR QUÉ EXISTE
 * Con usuarios en la UE, retirar contenido publicado por terceros obliga a tres
 * cosas: decir POR QUÉ se retiró, dejar APELAR, y publicar un punto de contacto.
 *
 * Hasta v1647 el aro se cerraba en el panel de administración: se marcaba el
 * reporte como resuelto y la persona a la que le retiraban algo no se enteraba
 * de nada. No había explicación ni forma de pedir revisión.
 *
 * Lo que se comprueba acá:
 *   1. Que al moderar se avise al AUTOR, no a quien reportó ni a nadie más.
 *   2. Que «contenido OK» no genere aviso (no pasó nada que explicar).
 *   3. Que la apelación se guarde de verdad — y que si NO se guarda, la persona
 *      se entere en vez de recibir un «gracias» falso. Es el mismo fallo de
 *      fondo del proyecto (HANDOVER §3) y acá no se repite.
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

function extraer(re) {
  const m = src.match(re);
  if (!m) throw new Error('No se encontró en premium.js: ' + re);
  return m[0];
}

// ── Banco de pruebas ────────────────────────────────────────────────────────
function montar({ falloAlGuardar = false, autor = 'autor-uid' } = {}) {
  const estado = { avisos: [], guardado: [], toasts: [] };
  const ctx = {
    _DSA_MOTIVOS: null,
    sbClient: {
      from: (t) => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
          data: autor ? { user_id: autor, section: 'Bitácora', tipo: 'texto' } : null }) }) }),
        insert: (row) => {
          if (falloAlGuardar) return Promise.resolve({ error: { message: 'RLS' } });
          estado.guardado.push({ tabla: t, row });
          return Promise.resolve({ error: null });
        }
      }),
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'quien-apela' } } }) }
    },
    _initSupabase: () => {},
    _createVeloNotif: (dest, tipo, titulo, cuerpo) => estado.avisos.push({ dest, tipo, titulo, cuerpo }),
    pToast: (e, m) => estado.toasts.push(m),
    document: {
      getElementById: (id) => id === 'dsaApelacionTexto'
        ? { value: 'Publiqué una reflexión sobre mi terapia y no creo que incumpla nada.' }
        : null
    }
  };
  const codigo =
    extraer(/var _DSA_MOTIVOS = \{[\s\S]*?\n\};/) + '\n' +
    extraer(/async function _dsaAvisarModeracion\(flagId, action\)\{[\s\S]*?\n\}/) + '\n' +
    extraer(/async function pApelarModeracion\(\)\{[\s\S]*?\n\}/) + '\n' +
    'return { _dsaAvisarModeracion, pApelarModeracion };';
  const fn = new Function('ctx', `with (ctx) { ${codigo} }`);
  return { api: fn(ctx), estado };
}

(async function () {
  console.log('Circuito de moderación (DSA)\n');

  // ── 1. Al retirar contenido se avisa al autor, con motivo ────────────────
  for (const accion of ['delete', 'alert', 'alertdelete']) {
    const { api, estado } = montar();
    await api._dsaAvisarModeracion('flag-1', accion);
    const a = estado.avisos[0];
    comprobar(`«${accion}» avisa al autor`, !!a && a.dest === 'autor-uid',
      a ? a.titulo : '(sin aviso)');
    comprobar(`  …y explica por qué`, !!a && a.cuerpo.length > 40 && /revis/i.test(a.cuerpo),
      a ? 'menciona que se puede pedir revisión' : '');
  }

  // ── 2. «Contenido OK» no genera aviso ───────────────────────────────────
  {
    const { api, estado } = montar();
    // pAdminModerateFlag sólo llama al circuito cuando action !== 'accept';
    // se comprueba que esa guarda esté escrita en el archivo.
    const guarda = /if\(action !== 'accept'\) _dsaAvisarModeracion\(id, action\);/.test(src);
    comprobar('«contenido OK» no avisa a nadie', guarda,
      guarda ? 'la guarda está en pAdminModerateFlag' : 'FALTA la guarda');
  }

  // ── 3. Sin autor identificado no se inventa destinatario ────────────────
  {
    const { api, estado } = montar({ autor: null });
    await api._dsaAvisarModeracion('flag-2', 'delete');
    comprobar('sin autor no se avisa a nadie', estado.avisos.length === 0);
  }

  // ── 4. La apelación se guarda donde el panel ya mira ─────────────────────
  {
    const { api, estado } = montar();
    await api.pApelarModeracion();
    const g = estado.guardado[0];
    comprobar('la apelación se guarda', !!g, g ? 'en ' + g.tabla : '(no se guardó)');
    comprobar('  …en la bandeja que el panel revisa',
      !!g && g.tabla === 'reportes' && g.row.categoria === 'apelacion' && g.row.estado === 'abierto',
      g ? `categoria=${g.row.categoria} estado=${g.row.estado}` : '');
    comprobar('  …y se le confirma a la persona',
      estado.toasts.some(t => /revisar/i.test(t)), estado.toasts.join(' | '));
  }

  // ── 5. Si NO se guarda, no se le miente ─────────────────────────────────
  {
    const { api, estado } = montar({ falloAlGuardar: true });
    await api.pApelarModeracion();
    comprobar('si falla el guardado, avisa del fallo',
      estado.toasts.some(t => /No se pudo/i.test(t)), estado.toasts.join(' | '));
    comprobar('  …y NO dice que se va a revisar',
      !estado.toasts.some(t => /revisar/i.test(t)),
      'es el fallo de fondo del proyecto; acá no se repite');
  }

  // ── 6. El botón de apelar existe en el aviso ────────────────────────────
  {
    const hay = /n\.type==='moderacion'[\s\S]{0,400}pAbrirApelacion\(\)/.test(src);
    comprobar('el aviso lleva el botón de apelar', hay);
  }

  console.log('');
  if (fallos) {
    console.error(`✗ ${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log('✓ Todo correcto.');
})();
