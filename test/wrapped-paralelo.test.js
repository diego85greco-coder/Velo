/**
 * Prueba de las consultas del Wrapped mensual.
 *
 *     node test/wrapped-paralelo.test.js
 *
 * POR QUÉ EXISTE
 * Al abrir el Wrapped, `pOpenMonthlyWrapped` consulta a Supabase cuántas
 * publicaciones, momentos, respuestas, acompañamientos y vibes hizo la persona
 * ese mes. Hasta v1633 esas consultas iban EN CADENA: cada una esperaba a la
 * anterior aunque no dependen entre sí. Siete idas y vueltas en fila, desde el
 * Río de la Plata hasta Supabase en Europa, son un par de segundos con el botón
 * mudo — que fue justamente lo que se notó al usarlo.
 *
 * Ahora salen a la vez. Sólo hay dos dependencias reales, y se encadenan dentro
 * de su propia rama: hacen falta los ids de las publicaciones para contar sus
 * reacciones, y lo mismo con las vibes.
 *
 * La prueba lee el bloque DEL PROPIO premium.js y lo corre contra un cliente
 * simulado, así que no puede desincronizarse. Comprueba las cuatro cosas que
 * importan: que salgan en paralelo, que las dependientes sigan encadenadas, que
 * lleguen todos los datos, y que una consulta caída no deje el resto sin nada.
 */

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'premium.js'), 'utf8');

// el bloque real, tal cual está en el archivo
const bloque = src.match(/var _rama = function\(consulta, alLlegar\)\{[\s\S]*?\n    \]\);/)[0];

const RETARDO=100;               // cada ida y vuelta simulada
let enVuelo=0, maxEnVuelo=0, total=0;
function consulta(tabla, fallar){
  total++; enVuelo++; maxEnVuelo=Math.max(maxEnVuelo,enVuelo);
  return new Promise((res,rej)=>setTimeout(()=>{
    enVuelo--;
    if(fallar) return rej(new Error('caída simulada de '+tabla));
    res({ error:null, data:[{id:1},{id:2}], count:2 });
  }, RETARDO));
}
function hacerCliente(tablaQueFalla){
  const q = (tabla) => ({
    select:()=>q(tabla), eq:()=>q(tabla), gte:()=>q(tabla), lte:()=>q(tabla), in:()=>q(tabla),
    then:(f,r)=>consulta(tabla, tabla===tablaQueFalla).then(f,r),
    catch:(r)=>consulta(tabla, tabla===tablaQueFalla).catch(r)
  });
  return { from:(t)=>q(t) };
}

let fallos=0;
const ok=(n,c,d)=>{ if(!c) fallos++; console.log(`  ${c?'OK   ':'FALLA'}  ${n}${d?'  — '+d:''}`); };

(async function(){
  console.log('Wrapped mensual — consultas a la comunidad\n');

  // ── caso normal ──
  let comm={btPosts:0,momentos:0,helped:0,dqAnswered:0,vibes:0,vibeRx:0,btRx:0};
  let sbClient=hacerCliente(null), uid='u1', yr=2026, mo=6;
  enVuelo=0; maxEnVuelo=0; total=0;
  let t0=Date.now();
  await eval('(async function(){ var monthStart="a", monthEnd="b";'+bloque+'})()');
  let ms=Date.now()-t0;

  ok('salen en paralelo, no en fila', maxEnVuelo>=5, `${maxEnVuelo} a la vez de 5 ramas`);
  ok('tarda lo que la rama mas lenta', ms < RETARDO*3.5,
     `${ms} ms (en cadena serian ~${RETARDO*7})`);
  ok('las dependientes se encadenan', total===7, `${total} consultas (5 + 2 dependientes)`);
  ok('se recogen todos los datos',
     comm.btPosts===2 && comm.momentos===2 && comm.dqAnswered===2 && comm.helped===2 && comm.vibes===2,
     JSON.stringify(comm));
  ok('cuenta las reacciones recibidas', comm.btRx===2 && comm.vibeRx===2);

  // ── una rama caida no puede tumbar el resto ──
  comm={btPosts:0,momentos:0,helped:0,dqAnswered:0,vibes:0,vibeRx:0,btRx:0};
  sbClient=hacerCliente('momentos');
  let reventó=false;
  try{ await eval('(async function(){ var monthStart="a", monthEnd="b";'+bloque+'})()'); }
  catch(e){ reventó=true; }
  ok('si una consulta falla, no lanza', !reventó);
  ok('y el resto de los datos llega igual',
     comm.btPosts===2 && comm.vibes===2 && comm.momentos===0,
     'momentos=0 (la caida), el resto intacto');

  console.log('');
  if(fallos){ console.error(`✗ ${fallos} fallo(s).`); process.exit(1); }
  console.log('✓ Todo correcto.');
})();
