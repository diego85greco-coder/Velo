/**
 * Prueba del detector local de expresiones de crisis.
 *
 *     node test/crisis-detector.test.js
 *
 * POR QUÉ EXISTE
 * `_localCrisisCheck` (premium.js) es la red de seguridad de la app: de ahí
 * salen el triaje de la Sala de Ayuda y la derivación al directorio SOS. Corre
 * en el navegador, sin enviar nada a ningún lado, así que sigue funcionando
 * aunque la IA esté caída o sin cupo.
 *
 * El 10/08/2026 se descubrió que fallaba en 13 de 21 formas habituales de
 * decirlo en rioplatense — incluida la más directa de todas, «me quiero matar».
 * Había convivido meses con eso porque nadie lo había probado nunca.
 *
 * Esta prueba lee el detector DEL PROPIO premium.js (no una copia), así que no
 * puede desincronizarse. Si se toca la expresión regular, hay que volver a
 * pasarla — y añadir acá cualquier forma nueva que aparezca.
 *
 * CRITERIO: ante la duda, marcar. Un falso positivo sólo muestra líneas de
 * ayuda a alguien que estaba cansado. Un falso negativo es no ver a alguien
 * que lo está pasando mal.
 */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'premium.js'), 'utf8');
// Se extraen las tres piezas tal cual están en el archivo y se evalúan.
eval(src.match(/var _CRISIS_FIGURADO = [\s\S]*?;/)[0]);
eval(src.match(/var _CRISIS_RE = new RegExp\([\s\S]*?\n\);/)[0]);
eval(src.match(/function _localCrisisCheck\(msg\)\{[\s\S]*?\n\}/)[0]);

// ── Formas reales de expresar una crisis. TODAS deben detectarse ───────────
const DEBE_DETECTAR = [
  'me quiero matar', 'quiero matarme', 'me voy a matar',
  'pienso en suicidarme', 'estoy pensando en matarme',
  'no quiero vivir mas', 'no quiero seguir viviendo', 'me quiero morir',
  'no quiero despertar mañana', 'no quiero estar más acá',
  'quiero desaparecer', 'tengo ganas de desaparecer', 'estoy pensando en desaparecer',
  'me quiero ir para siempre', 'quiero dejar de existir', 'preferiría no existir',
  'ojalá no hubiera nacido', 'estoy mejor muerto',
  'voy a hacerme daño', 'me voy a hacer daño', 'tengo pensamientos de hacerme daño',
  'me quiero cortar', 'me corto los brazos',
  'ya no aguanto más', 'no doy más, quiero terminar con esto',
  'no puedo más con la vida', 'no vale la pena seguir',
  'no le encuentro sentido a nada', 'la vida no tiene sentido',
  'estoy pensando en terminar con todo', 'quiero sacarme la vida',
  'me voy a quitar del medio', 'me voy a tirar del balcón',
  'me quiero tirar por la ventana', 'pienso en saltar al vacío',
  'pensé en tomarme todas las pastillas',
];

// ── Lenguaje cotidiano que se le parece. NINGUNA debe marcarse ─────────────
const NO_DEBE_MARCAR = [
  'estoy triste', 'me siento solo', 'tuve un día horrible',
  'estoy cansado de todo', 'estoy agotado del trabajo',
  'tengo mucha ansiedad', 'me siento perdido', 'hoy lloré bastante',
  'me muero de risa', 'me muero de hambre', 'me muero de ganas de verte',
  'me quiero morir de vergüenza', 'me mata la curiosidad',
  'esta serie me mata', 'mi jefe me mata',
  'saltar de alegría', 'saltar la cuerda', 'vamos a saltar de tema',
  'me tiré de cabeza al proyecto', 'me quiero tirar un rato a descansar',
  'tengo que quitar del medio esa caja',
];

let fallos = 0;

console.log('Detector de crisis — expresiones que DEBE detectar\n');
for (const f of DEBE_DETECTAR) {
  const ok = _localCrisisCheck(f);
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${f}`);
}

console.log('\nLenguaje cotidiano que NO debe marcar\n');
for (const f of NO_DEBE_MARCAR) {
  const marca = _localCrisisCheck(f);
  if (marca) fallos++;
  console.log(`  ${marca ? 'FALSO+' : 'OK    '}  ${f}`);
}

console.log(`\n${DEBE_DETECTAR.length} expresiones de crisis · ${NO_DEBE_MARCAR.length} frases cotidianas`);
if (fallos) {
  console.error(`\n✗ ${fallos} fallo(s). NO desplegar sin revisarlo.`);
  process.exit(1);
}
console.log('\n✓ Todo correcto.');
