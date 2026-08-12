# Traspaso de Velo — lo que hay que saber antes de tocar nada

Documento para quien retome el desarrollo de esta aplicación (otra persona, otro
asistente). Escrito el 07/08/2026, actualizado el 11/08/2026.
Versión en producción **v1648**.

Está ordenado por lo que más caro sale ignorar.

---

## 1. El ritual de despliegue — si esto se hace mal, la app entra en bucle

La versión vive en **cinco** sitios y **todos** tienen que subir juntos:

| Archivo | Qué cambiar |
|---|---|
| `version.json` | `{"v":NNNN}` |
| `premium.js` | `var _BUILT_V = NNNN;` (cerca del final, ~línea 38700) |
| `app-premium.html` | **4** referencias `?v=20260626-NNNN` (2 css + 2 js) |
| `sw.js` | `var CACHE = 'velo-vNNN';` (número distinto, propio) |

**Por qué importa:** el cliente compara `_BUILT_V` con `version.json`. Si
`version.json` va adelante, la app se recarga sola para actualizarse — y si
`_BUILT_V` no subió, vuelve a compararse y se recarga otra vez. **Bucle infinito
para todos los usuarios.** Pasó dos veces. Hay un cortacircuitos desde v1597,
pero no confíes en él.

**Flujo:**

```bash
git add -A && git commit -m "..."
git push -u origin claude/premium-web-app-design-gZlbk
git checkout main && git merge --ff-only claude/premium-web-app-design-gZlbk
git push origin main          # Vercel despliega solo desde main
git checkout claude/premium-web-app-design-gZlbk
```

**Verificar siempre** — no dar por hecho que salió:

```bash
curl -s "https://heyvelo.app/version.json?cb=$RANDOM"   # hasta que diga NNNN
```

Tarda entre 40 s y 2 min.

---

## 2. La regla que más veces se rompió: auditar antes de cerrar una policy

La base usa RLS (permisos por fila) de Supabase. **Antes de cambiar una policy,
hay que buscar TODAS las lecturas y escrituras del cliente sobre esa tabla y
clasificarlas una por una.**

```bash
grep -n "from('tabla')" premium.js
```

Cada sitio es: dato propio, dato comunitario, o de moderación. Si se cierra sin
mirar, algo se rompe **en silencio**, porque casi todas las llamadas están
dentro de un `try/catch` mudo.

> Ejemplo real: se cerró `daily_responses` a lectura propia sin auditar. El
> Pulso de Comunidad leía la tabla cruda para contar cuánta gente había
> respondido, y pasó a contar 1 — la propia. Nadie lo vio hasta revisarlo.

Después de cualquier cambio en la base, **revisar los avisos**:
`get_advisors` en el MCP de Supabase, o la pestaña Advisors del panel. Eso fue
lo que destapó 15 tablas con permisos abiertos.

Para verificar una policy, simular un usuario normal:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid>","email":"x@y.com","role":"authenticated"}';
select count(*) from public.la_tabla;   -- ¿ve lo que debería y nada más?
rollback;
```

---

## 3. El problema de fondo: los fallos no se ven

Casi todas las llamadas a la base están así:

```js
try{ await sbClient.from('x').insert({...}); }catch(e){}
```

Si falla, **la app dice que sí y no pasa nada**. Por eso convivieron durante
meses cosas como:

- El **formulario de contacto** no guardaba nada (columnas inexistentes). La
  tabla tenía 0 filas: nunca funcionó.
- **Buscar en Bitácora** nunca devolvía resultados (pedía columnas con el nombre
  viejo).
- **Borrar un momento** no borraba nada (no había policy de DELETE).
- **Responder una reseña** siempre fallaba.
- El informe de una solicitud RGPD decía siempre "0 registros de ánimo" (leía
  una tabla que no existe).

### ✅ Ya resuelto (v1627) — pero hay que saber usarlo

En vez de tocar cientos de `catch`, se envolvió el `fetch` que usa supabase-js:
**toda respuesta que no sea 2xx queda registrada**, con tabla, código y mensaje
de Postgres. Un solo punto, sin cambiar el comportamiento de ninguna llamada.

- En la consola del navegador, buscar **`[velo-db]`**.
- **`veloDbErrors()`** devuelve los últimos 50 fallos con hora y detalle.
- Los códigos que más aparecen:

| Código | Significa | Consecuencia |
|---|---|---|
| `42703` / `PGRST204` | columna inexistente | **La operación no se guardó** |
| `42501` | RLS lo bloqueó | Falta permiso, o la policy está mal |
| `23505` | clave duplicada | |

⚠️ **Lo que esto NO detecta:** un DELETE o UPDATE que devuelve 200 con **0
filas** no es un error HTTP. Para esos hay que encadenar `.select()` y
comprobar que volvió alguna fila — ver `_btDeletePost` como ejemplo. Así fue
como se descubrió que borrar un momento no borraba nada.

### La técnica que encontró la mayoría de esos bugs

Cruzar lo que el código escribe contra el esquema real. Cuando una columna no
existe, PostgREST **rechaza la operación entera** — no guarda a medias.

```sql
-- Esquema real, para comparar contra el código
select json_object_agg(t, cols) from (
  select c.relname t, array_agg(a.attname order by a.attnum) cols
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  where n.nspname='public' and c.relkind in ('r','v') group by 1
) s;
```

Después buscar en `premium.js` cada `.insert({...})`, `.update({...})`,
`.select('a,b,c')` y `.eq('col',...)` y comprobar que las columnas existen.
Aplicar la misma idea a: RPC que no existen, tablas que no existen, y columnas
pedidas en `select` de las **vistas** (tienen nombres distintos del crudo:
`author_name`, no `user_name`).

---

## 4. Arquitectura, en dos minutos

```
heyvelo.app  →  Vercel (estático + funciones en /api)
                   ├── api/gemini.js      proxy a Gemini (exige sesión + cupo)
                   └── api/send-email.js  proxy a Resend (exige sesión + cupo)
                ↓
                Supabase (UE) — Postgres + Auth + Storage + Realtime
                   ├── 56 tablas, RLS en todas
                   ├── 9 vistas que enmascaran identidad en contenido anónimo
                   ├── RPC security-definer para lo que el cliente no debe poder
                   └── 5 edge functions (send-dm-push, stripe-*, delete-account)
                ↓
                GitHub Actions
                   ├── daily-push.yml   notificaciones, 5 franjas horarias
                   └── backup.yml       copia nocturna (¡el plan de Supabase es gratuito!)
```

**Archivos:**

| Archivo | Qué es |
|---|---|
| `premium.js` | ~38.700 líneas. **Toda** la lógica. Sin módulos ni build |
| `app-premium.html` | ~4.600 líneas. Todas las pantallas + los modales legales |
| `sw.js` | Service worker: caché y notificaciones push |
| `supabase/migrations/*.sql` | Cada una explica el fallo, el arreglo y su verificación |
| `LEGAL-*.md`, `LANZAMIENTO-CHECKLIST.md` | Estado legal y de lanzamiento |

No hay build ni linter: se edita y se despliega. **Sí hay pruebas**, y son
rápidas — conviene correrlas antes de cada despliegue:

```bash
for t in test/*.test.js; do node "$t" || break; done
```

| Prueba | Qué protege |
|---|---|
| `crisis-detector` | 36 formas de expresar una crisis. Es la red de seguridad de la app |
| `session-gate` | la espera de sesión que envuelve TODAS las consultas (v1631) |
| `fechas-locales` | que los ánimos no se lean con la fecha en UTC |
| `restore-order` | que la restauración no falle por claves ajenas |
| `wrapped-paralelo` | que las consultas del Wrapped no vuelvan a ir en cadena |
| `reacciones` | que ninguna reacción se quede sin su emoji |
| `escritura-fallida` | que un guardado que falla se VEA, y que no avise de más |
| `dsa-moderacion` | el circuito de moderación: aviso al autor y apelación |

Todas leen el código **del propio `premium.js`** en vez de una copia, así que no
pueden desincronizarse.

---

## 5. Cosas que parecen bugs y no lo son

- **Vistas «Security Definer»**: el analizador de Supabase las marca en rojo. Es
  intencional: es lo que les permite leer todas las filas y devolverlas
  enmascaradas. Si se «arreglan», las publicaciones anónimas dejan de verse.
- **2 policies de UPDATE con `USING(true)`** en `help_posts` y `happy_posts`:
  a propósito. El guardián cierra el pedido de otra persona y las reacciones se
  escriben en el post ajeno.
  ⚠️ **Corregido el 11/08 a medias, y hay que entender por qué.** El `USING(true)`
  sigue —hace falta— pero esas policies estaban declaradas `to {anon,
  authenticated}` y `anon` tenía el grant de UPDATE: sin cuenta se podía
  reescribir el texto de los 22 pedidos de la Sala de Ayuda. Ahora son sólo para
  `authenticated`, y **el permiso se limita por columna** (`taken`, `taken_by`,
  `closed` en `help_posts`; `reactions`, `comments` en `happy_posts`). Así el
  tercero puede hacer lo que necesita sin poder tocar el texto ajeno. Si alguna
  vez el cliente necesita escribir otra columna de esas tablas, hay que añadirla
  al `grant update (...)` — si no, falla con `42501`.
- **`momentos` sin permiso de UPDATE para `authenticated`**: los corazones van
  por el RPC `increment_momento_hearts`. El update directo del cliente es código
  muerto.
- **9 avisos `auth_rls_initplan` que quedan**: son las policies de `help_posts`,
  `guardian_requests` e `ia_usage`, dejadas **planas a propósito**. Los otros
  104 se optimizaron el 07/08. Ver el punto 5bis: optimizarlas rompe la app.
- **`urgencia` en `help_posts` siempre NULL**: decisión deliberada del 24/07. No
  se conserva quién expresó señales de crisis. El triaje se recalcula en el
  cliente.

---

## 5bis. ⚠️ Las 3 tablas que NO admiten la optimización de policies

`help_posts`, `guardian_requests` e `ia_usage` tienen policies de INSERT cuya
condición hace una **subconsulta sobre su propia tabla** (los topes diarios del
plan gratuito: «¿cuántas filas mías hay en las últimas 24 h?»).

Esa subconsulta dispara, a su vez, la policy de SELECT de la misma tabla. Si
alguna de las policies de esas tablas envuelve `auth.uid()` en un subselect,
Postgres no puede aplanar la cadena y aborta:

```
ERROR 42P17: infinite recursion detected in policy for relation "help_posts"
```

**Efecto: publicar en la Sala de Ayuda deja de funcionar.** Pasó el 07/08 al
optimizar las 113 policies de golpe; se detectó y revirtió el mismo día.

Revertir sólo la policy del tope **no alcanza**: hay que dejar planas TODAS las
policies de esas tres tablas.

Antes de tocar policies en masa, excluirlas:

```sql
select distinct tablename from pg_policies
 where coalesce(qual,'')||coalesce(with_check,'') like '%FROM '||tablename||' %';
```

---

## 6. Errores que ya se cometieron — para no repetirlos

1. Cerrar una policy sin auditar los usos → rompió el Pulso de Comunidad.
2. Subir `version.json` sin subir `_BUILT_V` → bucle de recargas para todos.
3. Poner un estilo en línea sin `!important` cuando el CSS sí lo tenía → el
   cambio no se aplicaba y parecía que no había pasado nada.
4. Afirmar que `plus_grants` permitía darse Plus gratis. **Falso**: nada lee esa
   tabla para autorizar; quien decide es `profiles.role`, protegido por trigger.
   Verificar antes de afirmar.
5. Mover el tope de IA al servidor sin separar las llamadas del sistema → la
   moderación consumía el cupo del chat y **el clasificador de crisis dejaba de
   ejecutarse**. Corregido en v1625 con dos cupos.
6. Asumir que los nombres de policies de los archivos `.sql` coinciden con los
   de producción. **No coinciden.** Consultar siempre `pg_policies` primero.
7. Optimizar las 113 policies de golpe sin excluir las tablas con subconsultas
   auto-referentes → recursión infinita, y **publicar en Sala de Ayuda dejó de
   funcionar**. Ver el punto 5bis. Lo que permitió revertir en minutos fue haber
   copiado antes las 174 policies a una tabla de respaldo. **Hacer siempre esa
   copia antes de un cambio masivo.**
8. Quitar una policy `FOR ALL` sin reponer la de UPDATE: era la única que
   autorizaba editar. Se detectó a tiempo al consolidar diario y ánimos.
9. Escribir una policy que consulte `auth.users`. El rol `authenticated` no
   tiene permiso sobre esa tabla y la consulta entera aborta con «permission
   denied for table users». Para el email usar siempre
   `auth.jwt() ->> 'email'`, que viene en el token. Esto tuvo los **Círculos
   completamente rotos** hasta el 07/08.
10. Añadir opciones en el cliente (reacciones, categorías) sin actualizar la
    restricción CHECK correspondiente en la base. Pasó con las reacciones de
    Vibes: 16 de 24 fallaban en silencio.
11. Usar `upsert` con `onConflict` sobre columnas que no tienen una restricción
    única. Postgres rechaza la operación entera. Pasó con la cola de
    sincronización del diario, que por eso **nunca** funcionó.
12. Subir a Storage sin respetar la forma de ruta que exige la regla del bucket.
    Las de `avatars` y `vibes` piden que el primer tramo sea el uuid
    (`uid/archivo`). El cliente subía el avatar como `uid.jpg`, sin carpeta →
    rechazado siempre, y caía al respaldo de guardar la imagen como base64 en
    `profiles.avatar` (~31 kB por persona, leídos en cada consulta de perfil).
13. Poner una operación que puede fallar **antes** del trabajo real de una
    función, sin protegerla. `delete_my_account` registraba la baja en su
    primera línea y eso tumbaba el borrado entero. Lo que puede fallar y no es
    esencial va envuelto en su propio `begin/exception`.

---

## 7. Secretos: dónde vive cada uno

Ninguno está en el repositorio (**el repositorio es público**).

| Secreto | Dónde |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Actions + edge functions |
| `GEMINI_API_KEY` | Vercel + GitHub Actions |
| `RESEND_API_KEY` | Vercel |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Vercel + edge functions |
| `VAPID_PRIVATE_KEY` | GitHub Actions + edge functions |
| `CLOUDINARY_API_KEY/SECRET` | GitHub Actions |

⚠️ **La VAPID privada actual está en el historial de git, en un repo público.**
Hay un par nuevo generado y ambos remitentes ya saben firmar con las dos a la
vez, para que rotar no corte las notificaciones. Falta poner
`VAPID_PRIVATE_KEY_NEW` en GitHub y en Supabase, y luego cambiar la pública en
los tres sitios donde está escrita.

Comprobado que la clave filtrada **no es explotable hoy**: hacen falta también
los endpoints de suscripción, y ésos no son legibles.

---

## 8. Qué queda pendiente

**Requiere las cuentas del titular:** → consolidado en
`PENDIENTE-DEL-TITULAR.md`, con qué hay que hacer y dónde va cada dato.
Se deja el resumen acá:

1. Fijar en `GEMINI_API_KEY` (Vercel + GitHub) la clave del proyecto **Velo
   app2** (`…TtNk`, nivel Pagado). Hay otras claves en nivel **gratuito**, y en
   ese nivel Google puede usar el contenido para entrenar modelos.
2. **Activar la recarga automática** del crédito de Gemini. Es prepago, quedan
   ~9 €. Al agotarse dejan de funcionar el acompañante, la moderación, **el
   clasificador de crisis** y los resúmenes — sin aviso.
3. Aceptar los DPA de Supabase, Vercel, Stripe, Cloudinary y Resend.
4. Rellenar los `[COMPLETAR]` de `LEGAL-DPIA.md` y del registro de tratamiento
   (datos societarios) y firmar la DPIA.

**Técnico:**
5. Terminar la rotación VAPID (punto 7).
6. Decidir y activar los plazos de conservación: están implementados pero
   desactivados a propósito. `select * from public.velo_retention_report();`
   dice qué se borraría.
7. ~~Circuito de respuesta y apelación de moderación (DSA)~~ — hecho en v1648.
   Al moderar se avisa al AUTOR con el motivo, y desde ese mismo aviso puede
   pedir revisión. La apelación entra en `reportes` con `categoria:'apelacion'`,
   que es la bandeja que el panel ya lista — sin tabla ni pantalla nuevas.
   `test/dsa-moderacion.test.js` lo cubre, incluido que un guardado fallido NO
   se celebre.
8. Probar la app **usándola**. Todo lo verificado hasta ahora fue contra la base
   de datos. Bugs visuales, de flujo o del PWA en iPhone: sin cubrir.
9. ~~Cerrar a los anónimos Momentos, Vibes y Círculos~~ — hecho el 11/08.
10bis. ~~`script.js`, `app.html` y `velo.js` huérfanos~~ — hecho en v1648.
   `velo.js` y `script.js` se eliminaron (11.645 líneas). `app.html` no se borró:
   quedó como redirección de 1 KB a `app-premium.html`, para no romper un
   marcador viejo. Antes se comprobó que nada los enlazara: ni el HTML, ni el
   service worker, ni los enlaces de las notificaciones o los correos.

11. ~~El límite diario de la Sala de Ayuda no funciona.~~ **FALSO — lo comprobé
   mal el 11/08 y lo dejé escrito acá.** Sí funciona: al quinto pedido en 24 h
   la base lo rechaza con
   `new row violates row-level security policy "help_posts_daily_limit"`.

   **La lección importa más que el dato.** Yo razoné que `help_posts_daily_limit`
   convivía con `help_insert_auth` (que permite `true`) y que, como las policies
   se combinan con OR, el límite quedaba anulado. Eso vale para las
   **PERMISSIVE**. `help_posts_daily_limit` es **RESTRICTIVE**, y las
   restrictivas se combinan con **AND**: acotan aunque otra permita.

   Antes de afirmar que una policy no se aplica, mirar la columna `permissive`
   de `pg_policies` — y mejor todavía, probarlo:

   ```sql
   set local role authenticated;
   perform set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true);
   insert into public.help_posts(...) values (...);   -- ¿al quinto falla?
   ```

   Lo mismo pasa con `ia_usage_daily_limit` (25 llamadas de IA al día): también
   es RESTRICTIVE, también se aplica.

---

## 8bis. Lentes de revisión ya aplicadas (y su resultado)

Para no repetir trabajo. Todas se pasaron entre el 29/07 y el 07/08:

| Lente | Resultado |
|---|---|
| Policies con `USING(true)` | 15 tablas cerradas. Quedan 0 en ALL y DELETE |
| De-anonimización de publicaciones anónimas | Cerrada y verificada |
| Columnas escritas que no existen en la base | 9 operaciones rotas, arregladas |
| Columnas pedidas en `select` que no existen | 4 consultas rotas, arregladas |
| RPC invocadas que no existen | ninguna |
| Tablas usadas que no existen | 7 — 3 creadas, 4 de módulos retirados |
| Funciones JS declaradas dos veces | ninguna |
| Handlers del HTML que llaman funciones inexistentes | ninguno real |
| Filtros `.or()` con columnas inexistentes | ninguno |
| Buckets de Storage y edge functions referenciados | todos existen |
| Suscripciones en vivo a tablas no publicadas | ninguna |
| **Contenido de usuarios sin escapar en HTML (XSS)** | **limpio** — usa `_escHtml` |
| Claves foráneas sin índice | 8, indexadas |
| Secretos en el historial de git | 1 (VAPID privada) — rotación preparada |

**Segunda tanda de lentes (07/08), tras el traspaso:**

| Lente | Resultado |
|---|---|
| Botones construidos en JS que llaman funciones inexistentes | limpio |
| IDs duplicados en el HTML | limpio |
| `getElementById` sobre elementos que no existen | 19, todos con `if(el)` — dead code inofensivo |
| Claves de `localStorage` escritas con un nombre y leídas con otro | limpio |
| Contenido de usuario en `onclick` sin `_jsAttr` | limpio |
| Parámetros de las funciones del servidor vs. su firma real | limpio |
| **`upsert` con columnas que no son únicas** | **1 — el diario** |
| **Policies que consultan `auth.users`** | **5 — los Círculos no funcionaban** |
| **Valores permitidos (CHECK) vs. los que envía el cliente** | **1 — 16 reacciones de Vibes** |
| Lectura de las 34 secciones como usuario normal | todas responden |
| Escritura en las 27 secciones como usuario normal | todas pasan |

**Tercera tanda (07/08), lentes nuevas:**

| Lente | Resultado |
|---|---|
| **Reglas del almacenamiento vs. la ruta que sube el cliente** | **1 — los avatares nunca se subieron** |
| **Cobertura real del borrado de cuenta** | **2 — abortaba en la 1ª línea, y dejaba 17 columnas** |
| Historial de los trabajos programados | 43 ejecuciones, 0 fallos |
| Restricciones de valores (CHECK) vs. lo que envía el cliente | ya cubierto en la 2ª tanda |

**Cuarta tanda (10/08) — 10 lentes de código, sin conexión a la base:**

| Lente | Resultado |
|---|---|
| **Detector de crisis vs. formas reales de expresarlo** | **fallaba en 13 de 21 — incluida «me quiero matar»** |
| **Llamadas al proxy de IA sin declarar su cupo** | **3 — regresión propia de v1625** |
| Claves duplicadas en objetos literales | limpio |
| Temporizadores sin cancelar / listeners duplicados en renders | limpio |
| `JSON.parse` sin protección | limpio |
| `case` repetidos en un switch · `return` dentro de forEach | limpio |
| Funciones async usadas sin `await` | limpio |
| `Promise.all` sin captura de error | limpio |
| Coherencia de las 5 versiones · precache del service worker | limpio |
| **Exposición sin sesión (por REST, con la clave pública)** | **ver abajo** |

### ✅ RESUELTO (11/08) — la API pública estaba abierta de par en par

Lo que empezó como «cerrar tres vistas a los anónimos» destapó, al auditar los
permisos que se iban a tocar, cuatro agujeros de los que **tres eran graves**.
Todo comprobado contra producción con la clave pública del repositorio y sin
ninguna cuenta, y todo verificado después por HTTP.

**1. Se podía vaciar la base entera.** Las vistas son auto-actualizables,
pertenecen a `postgres` y las tablas base no tienen `FORCE ROW LEVEL SECURITY`,
así que escribir a través de ellas **no evaluaba ninguna política RLS**. Medido
con rollback: `delete from help_posts_feed` habría borrado 22 filas;
`happy_posts_full` 10; `daily_responses_feed` 23; `momento_comments_feed` 7;
`dq_comments_feed` 4. Una sola petición HTTP, sin registrarse.
→ `20260811_revoke_write_on_views.sql`

**2. Se podía reescribir toda la Sala de Ayuda.** `help_update_auth` y
`happy_update_auth` estaban `to {anon,authenticated} using (true)`. Medido:
`update help_posts set preview='VANDALIZADO'` → 22 filas; marcar los 22 pedidos
como atendidos → 22 filas. También se podía publicar sin cuenta.
El `true` existía por una razón real (las reacciones del Muro viven en columnas
de la propia publicación, y otra persona marca tu pedido como tomado), así que
la solución no fue «sólo el dueño» sino **limitar qué columnas** se pueden
tocar: `taken/taken_by/closed` y `reactions/comments`, nada más. Ahora ni una
cuenta registrada puede reescribir el texto de una publicación ajena.
→ `20260811b_cerrar_escritura_anonima.sql`

**3. El directorio de usuarios era público.** `profiles_select` incluía a
`anon`: nombre, usuario, lema, avatar, estado, a quién bloqueó cada persona, su
buddy — y el `role`, o sea qué cuenta es la de administración. `email` y
`push_subscription` **no** estaban expuestos (la migración de julio ya los había
protegido por columna).
→ `20260811c_cerrar_directorio_usuarios.sql`

**4. Funciones `SECURITY DEFINER` llamables sin cuenta.** La única con impacto
real era `increment_momento_hearts`, que no comprueba nada: se podían inflar
corazones en bucle. Las demás eran funciones de trigger expuestas de más.
→ `20260811d_revocar_funciones_a_anonimos.sql`

**Y lo que motivó todo:** las tres vistas de contenido ya no se leen sin sesión.
→ `20260811_cerrar_vistas_a_anonimos.sql`

**Cómo se verificó sin poder abrir la app.** Simulando lo que hace PostgREST:
`set local role anon|authenticated` + `set_config('request.jwt.claims', …)` con
un id de usuario real, y las escrituras dentro de un bloque que lanza una
excepción al final, de modo que la subtransacción **revierte y no se toca ni una
fila**. Es la forma de medir «cuántas filas habría borrado» sin borrarlas.
Después de cada migración: recuento de filas intacto (22/10/3/11/23/15/17/5).

### ✅ v1631 (11/08) — XSS almacenado, y la carrera de sesión resuelta de raíz

**XSS almacenado en Círculos y en los perfiles profesionales.** El nombre y la
descripción de un círculo —que escribe quien lo crea— y el nombre, la biografía
y la especialidad de un profesional se insertaban en `innerHTML` **sin
escapar**. Un círculo llamado `<img src=x onerror=…>` ejecutaba código en el
navegador de todas las personas que abrieran la lista. Con el token de sesión
en el almacenamiento, eso es tomar la cuenta entera: mensajes privados
incluidos. Se corrigieron 8 sitios (perfiles profesionales, círculos, buzón y
cuerpo de notificaciones) y se comprobó con cuatro cargas de ataque reales que
quedan inertes. El resto de lo que marcaba el escáner eran valores de color
(`col.label`, `hCol.label`), no contenido de personas.

**La carrera de sesión, arreglada en un solo sitio.** v1630 había puesto
`_sessionReady()` en tres pantallas, pero los puntos de lectura son ~100. Como
`_veloLoudFetch` ya envuelve el `fetch` de supabase-js —y sólo ése—, la espera
se puso ahí: la **primera** consulta a `/rest/v1` aguarda a que la sesión esté
restaurada, y con eso quedan cubiertas todas las secciones a la vez.

Tres cuidados, porque está en el camino de toda consulta: las llamadas a
`/auth/v1` pasan derecho (si no, la restauración se bloquearía a sí misma); se
espera una sola vez por carga, con o sin éxito (si no, quien no tiene cuenta
reintentaría en cada consulta); y hay tope de 3 s (si la restauración se
colgara, la app sigue como antes en vez de quedarse esperando).

`test/session-gate.test.js` cubre los cuatro modos de fallar. **Correrlo antes
de tocar `_veloLoudFetch` o `_sessionReady`.**

Con esto, cerrar las secciones que faltan ya no necesita cambiar el cliente.

### ✅ (11/08) — el backup decía «54/54» y dejaba fuera lo más sensible

`backup.js` tenía la lista de tablas escrita a mano. Una lista a mano no avisa
cuando se queda corta: dejaba fuera **`pro_patient_notes`** —las notas clínicas
que los profesionales escriben sobre sus pacientes—, `data_requests` (las
peticiones de acceso y borrado del RGPD), `deleted_accounts` y
`velo_retention_policy`. Ahora las descubre del esquema que publica PostgREST,
así que cualquier tabla nueva entra sola; sólo se excluye lo listado, con su
motivo escrito, y si el descubrimiento fallara usa la lista de reserva **y
avisa** en vez de guardar un backup incompleto en silencio.

### ✅ v1632 (11/08) — dos funciones que nunca funcionaron, y la semana emocional corrida

**«Vela por ti» no guardaba nada.** `pSendVela` inserta en
`solidarity_requests`… que **no existe en la base** (`PGRST205`). El `insert`
está dentro de un `try/catch` que se traga el error y a continuación muestra
«Solicitud enviada. Te contactaremos en 7-14 días 💚». Alguien que pide terapia
que no puede pagar se queda esperando una respuesta que nadie va a poder dar,
porque el panel lee esa misma tabla y siempre la ve vacía. Lo mismo con
`pro_patient_notes`: las notas clínicas de los profesionales nunca se
sincronizaron, viven sólo en el navegador.

Se detectó **de rebote**: al pasar el backup a descubrir las tablas del esquema
en vez de una lista a mano, avisó de que esas dos «ya no existen». Nunca
existieron. Migración escrita con las columnas sacadas del propio cliente y
probada en un PostgreSQL local: `PENDIENTE_crear_tablas_que_faltan.sql`.

**La semana emocional se veía corrida.** Los ánimos se guardan con `_dateKey()`
—hora local— y tres sitios de la tarjeta semanal los leían con `toISOString()`
—UTC—. En el Río de la Plata coinciden 21 horas al día y difieren las otras 3:
de 21:00 a medianoche, el emoji que salía bajo «Lun» era el del domingo, y el
ánimo registrado ese mismo día aparecía vacío. Por eso llevaba meses sin que
nadie lo viera: de día funciona. `test/fechas-locales.test.js` lo fija.

### ✅ (11/08) — reacciones de las vibes instantáneas

`supabase/migrations/20260811i_reacciones_vibes_instantaneas.sql`. Probada en
local y aplicada desde el editor SQL, porque el conector MCP estaba caído.

Al abrir «Quién te acompañó» en un momento, quien había reaccionado salía en
«pasaron a verla» y no en «te acompañaron». No era el cliente: RLS filtraba la
consulta entera.

Las vibes nacieron sólo dentro de grupos, así que todas las políticas hacían
`join vibe_groups on g.id = v.group_id`. Cuando se añadieron las **instantáneas**
—que no tienen grupo y dejan `group_id` en NULL— la migración 20260703b
actualizó `vibes_select` y `vibes_insert`, y las de comentarios nacieron ya
contemplándolas. **`vibe_reactions_select` fue la única que se quedó atrás.**
Con `group_id` NULL el INNER JOIN no devuelve nada y las reacciones quedan
invisibles para todos, incluida la autora. Efecto curioso: en un momento
instantáneo se ven los comentarios, e incluso las reacciones *a* los
comentarios, pero no las reacciones al momento.

El arreglo no copia los tres casos de `vibes_select` —duplicar esa lógica es lo
que produjo el desajuste—: pregunta «¿puedo ver la vibe?» y deja que RLS de
`vibes` responda. Probado con seis combinaciones; la de «ajena en instantánea
privada» sigue dando 0, o sea que no abre nada.

### ✅ CERRADO DEL TODO (11/08) — sin cuenta ya no se lee nada

Los cuatro SQL pendientes se aplicaron y se verificaron contra producción:
crear `solidarity_requests` y `pro_patient_notes`, completar el borrado de
cuenta, poner techo al cupo de IA, y cerrar las 18 cosas que seguían abiertas
(Momentos, Vibes, Círculos, respuestas del día, feeds de comentarios, reseñas,
presencia de guardianes y reacciones).

**Barrido final como `anon`: no queda ninguna tabla ni vista de `public` que
devuelva una sola fila.** Y por HTTP con la clave pública del repositorio, 401
en todo.

Lo que sigue funcionando sin cuenta, comprobado uno por uno porque tiene que
seguir así: el formulario de contacto (`contacts`), el registro anti-bot
(`bot_attempts`) y la aceptación de términos al darse de alta
(`terms_acceptance`).

«Vela por ti» ya guarda: se probó el `insert` con el payload exacto que manda
`pSendVela`, y el intento de escribir una nota clínica a nombre de otro
profesional se rechaza. Recuentos intactos: 22/10/3/15/17/5/11.

### 📖 Cómo se verificó, para repetirlo

Cada cierre de permiso se midió **antes y después, con los dos roles**,
simulando lo que hace PostgREST:

```sql
set local role anon;              -- o authenticated
perform set_config('request.jwt.claims',
  json_build_object('sub','<uid real>','role','authenticated')::text, true);
select count(*) from public.<lo_que_sea>;
```

Y las escrituras se midieron dentro de un bloque que lanza una excepción al
final, de modo que la subtransacción revierte: así se sabe **cuántas filas
habría borrado** un ataque sin borrar ninguna. Ese es el método; si hay que
tocar permisos otra vez, usarlo.

Cuando el conector de Supabase no esté disponible, se puede probar SQL
levantando un PostgreSQL local (`initdb` + `pg_ctl`, hay que correrlo como el
usuario `postgres`) y replicando las tablas implicadas más `auth.uid()` y
`auth.jwt()`. Así se probaron estas cuatro migraciones antes de aplicarlas.

### ~~🟡 QUEDA ABIERTO — la misma exposición en las secciones que faltan~~ (resuelto arriba)

Sin cuenta todavía se pueden leer: `momentos` (15), `vibes` (17),
`vibe_comments`, `vibe_groups`, `vibe_reactions`, `circles` (5),
`daily_responses_feed` (23), `dq_comments_feed`, `momento_comments_feed`,
`bitacora_comments_full`, `reviews`, `guardian_presence` y las tablas de
reacciones. Lo privado **sí** está protegido: mensajes directos, sesiones,
notificaciones, peticiones de guardián, bloqueos y perfiles dan 0 filas.

**El cambio de cliente que hacía falta ya está hecho** (la espera en
`_veloLoudFetch`, v1631). Sólo queda aplicar el SQL, cuando v1631 lleve un rato
desplegado y se haya comprobado que las secciones cargan:

```sql
revoke select on public.momentos, public.vibes, public.vibe_comments,
                 public.vibe_groups, public.vibe_reactions, public.circles,
                 public.daily_responses_feed, public.dq_comments_feed,
                 public.momento_comments_feed, public.bitacora_comments_full,
                 public.reviews, public.guardian_presence,
                 public.bitacora_reactions, public.bitacora_comment_reactions,
                 public.dq_reactions, public.news_reactions,
                 public.quote_reactions, public.bottle_reactions
  from anon;
```

Verificar después con la clave pública: las 18 deben dar 401, y con sesión los
feeds tienen que seguir completos. Se revierte con un `grant select` si algo
apareciera vacío.

### ✅ Primera prueba automática del proyecto

`node test/crisis-detector.test.js` — 36 formas de expresar una crisis y 21
frases cotidianas que se le parecen. Lee el detector del propio `premium.js`,
así que no puede desincronizarse. **Pasarla siempre que se toque
`_localCrisisCheck`.**

**Lentes que siguen sin aplicarse:** usar la app de verdad (iPhone/PWA),
accesibilidad, y qué pasa con la interfaz cuando la base responde lento o falla.

---

## 9. Verificaciones útiles

```sql
-- ¿Queda alguna policy que deje leer, alterar o borrar filas ajenas sin condición?
select cmd, count(*), string_agg(tablename||'.'||policyname, ', ')
from pg_policies
where schemaname='public' and permissive='PERMISSIVE'
  and cmd in ('ALL','SELECT','UPDATE','DELETE') and coalesce(qual,'')='true'
group by cmd;
-- Esperado: 0 en ALL y DELETE; 2 UPDATE (intencionales); ~18 SELECT (contenido público)

-- ¿Las publicaciones anónimas siguen siendo anónimas?  (como usuario normal → 0)
select count(*) from public.help_posts where anon and user_id <> auth.uid()::text;
```

**Copias de seguridad:** el proyecto de Supabase está en **plan gratuito, que no
las incluye**. Hay un volcado nocturno propio a artefacto de GitHub
(`.github/workflows/backup.yml`). La restauración está **probada**: ciclo
completo con 0 filas distintas. Script: `.github/scripts/restore.js` — por
defecto simula, sólo escribe con `--commit`.

---

## 10. Para retomarlo con otro asistente

El repositorio es público: `github.com/diego85greco-coder/Velo`. Cualquier
herramienta con acceso a GitHub puede leerlo entero.

**Lo mínimo que hay que darle:** este archivo, `LANZAMIENTO-CHECKLIST.md` y los
`LEGAL-*.md`. Con eso tiene el estado completo.

**Diferencia práctica a tener en cuenta:** buena parte del trabajo de este mes
se hizo con conexión directa a Supabase (aplicar migraciones, consultar la base
de producción, desplegar edge functions) y a Vercel y GitHub. Si el asistente
que lo retome no tiene esas conexiones, va a poder escribir el SQL pero **no
aplicarlo**: eso habrá que pegarlo a mano en el editor SQL de Supabase. Lo mismo
con los despliegues. No es mejor ni peor — pero conviene saberlo antes, para no
descubrirlo a mitad de un cambio.

Sea quien sea: **el punto 2 y el punto 3 de este documento son los que evitan
romper la aplicación.** El resto es contexto.
