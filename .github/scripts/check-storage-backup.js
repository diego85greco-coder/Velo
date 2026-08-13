/**
 * Comprueba que la copia de Storage esté entera.
 *
 *     node .github/scripts/check-storage-backup.js ./backup/storage
 *
 * No se restauran los archivos a un Storage de mentira, porque no hay uno que
 * levantar en el runner. Lo que sí se puede comprobar, y es lo que de verdad
 * falla en silencio, es que la copia tenga TODOS los archivos que dice tener y
 * que ninguno esté vacío: un archivo de 0 bytes dentro de un backup es peor que
 * uno que falta, porque parece que está.
 *
 * EXCEPCIÓN: `.emptyFolderPlaceholder` pesa 0 bytes a propósito — es el
 * marcador con el que Supabase representa una carpeta vacía. La primera versión
 * de esta comprobación puso el workflow en rojo por él.
 */

const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || './backup/storage';
const manifiesto = path.join(dir, '_manifest.json');

if (!fs.existsSync(manifiesto)) {
  console.error('✗ No hay copia de Storage: falta ' + manifiesto);
  process.exit(1);
}

const VACIO_A_PROPOSITO = new Set(['.emptyFolderPlaceholder']);

function recorrer(d) {
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? recorrer(path.join(d, e.name)) : [path.join(d, e.name)]);
}

const m = JSON.parse(fs.readFileSync(manifiesto, 'utf8'));
const problemas = [];
let enDisco = 0;

for (const c of m.cubos) {
  if (c.archivos !== c.esperados) {
    problemas.push(`${c.cubo}: se bajaron ${c.archivos} de ${c.esperados} archivos`);
  }
  for (const f of recorrer(path.join(dir, c.cubo))) {
    enDisco++;
    if (fs.statSync(f).size === 0 && !VACIO_A_PROPOSITO.has(path.basename(f))) {
      problemas.push(`archivo vacío: ${f}`);
    }
  }
}

if (enDisco !== m.archivos_totales) {
  problemas.push(`${enDisco} archivos en disco vs ${m.archivos_totales} en el manifiesto`);
}

console.log(`${enDisco} archivos, ${(m.bytes_totales / 1048576).toFixed(1)} MB en ${m.cubos.length} cubos`);

if (problemas.length) {
  console.error('\n✗ La copia de archivos no está entera:');
  problemas.forEach(p => console.error('   · ' + p));
  process.exit(1);
}
console.log('✓ Todos los archivos de Storage están en la copia.');
