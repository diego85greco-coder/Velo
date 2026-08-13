# Velo — traspaso completo a otro asistente

**Este archivo se basta solo.** No hace falta abrir ningún otro: todo lo que
necesitás está acá dentro, incluidos los documentos que antes iban aparte
(están al final, como anexos A, B y C).

Corte: **13/08/2026, versión 1652.** Repositorio público:
`github.com/diego85greco-coder/Velo`.

## Cómo leerlo

La **parte 1** es el resumen de una sentada: qué es el proyecto, qué rompe la
aplicación, qué no hay que tocar. Con eso ya se puede trabajar sin hacer daño.

Los **anexos** son el detalle: el historial completo (A), lo que sólo puede
hacer el titular (B) y lo que falta para lanzar (C).

Si sólo vas a leer una cosa, que sea la **parte 1, punto 1** — el ritual de
despliegue. Es lo único que puede dejar la app inutilizable para todos.

---

# PARTE 1 — Lo esencial

## 0. Lo primero: qué es esto y para quién

**Velo** (heyvelo.app) es una PWA de salud mental en español rioplatense. Gente
que la está pasando mal escribe cómo se siente, pide ayuda a otras personas
(«guardianes»), lleva un diario, registra su ánimo y habla con un acompañante
de IA.

Tres consecuencias prácticas que cambian cómo hay que trabajar acá:

1. **Los datos son de los más sensibles que existen.** Diarios, estados de
   ánimo, notas clínicas de profesionales sobre sus pacientes. Una fuga no es
   un incidente técnico: es la peor cosa que le puede pasar a este proyecto.
2. **Hay una red de crisis.** Si alguien escribe que se quiere matar, la app
   tiene que abrir el SOS. Eso **no puede depender de que la IA responda**
   (ver §5).
3. **Todavía no se lanzó.** Es una prueba piloto con 11 personas registradas y
   3 activas en los últimos 7 días. No leas los números de uso como rechazo del
   mercado: no hay mercado todavía. (Yo cometí ese error y el titular tuvo que
   corregirme.)

El titular es Diego. Escribe en español; la app está en español rioplatense y
los comentarios del código también.

---

## 1. ⚠️ EL RITUAL DE DESPLIEGUE — si esto se hace mal, la app entra en bucle

Es lo único que puede dejar la aplicación inutilizable para todo el mundo.
**Leelo antes de tocar nada.**

Hay **cinco sitios** con el número de versión y tienen que coincidir SIEMPRE:

| Archivo | Qué hay que cambiar |
|---|---|
| `version.json` | `{"v":1652}` |
| `premium.js` | `var _BUILT_V = 1652;` |
| `app-premium.html` | `?v=20260626-1652` — **son 4 apariciones**, todas |
| `sw.js` | `var CACHE = 'velo-v219';` (sube de uno en uno, va por su cuenta) |

La app hace *polling* de `version.json` y recarga si `v > _BUILT_V`. Si subís
`version.json` sin subir `_BUILT_V`, cada cliente recarga, vuelve a leer el
mismo `_BUILT_V` viejo, y recarga otra vez: **bucle infinito de recargas para
todos los usuarios**. Si subís `_BUILT_V` sin cambiar los `?v=`, el navegador
sirve el JS cacheado y no pasa nada, que es menos grave pero igual de confuso.

Comprobación antes de empujar:

```bash
cat version.json
grep -n "var _BUILT_V = " premium.js
grep -c "v=20260626-1652" app-premium.html    # tiene que dar 4
grep -n "var CACHE" sw.js
```

### Flujo de despliegue completo

Se desarrolla en la rama `claude/premium-web-app-design-gZlbk` y se lleva a
`main`, que es lo que Vercel despliega:

```bash
git add -A && git commit -m "..."
git push -u origin claude/premium-web-app-design-gZlbk
git checkout main
git merge --ff-only claude/premium-web-app-design-gZlbk
git push origin main
git checkout claude/premium-web-app-design-gZlbk
# y comprobar que llegó:
curl -s https://heyvelo.app/version.json      # tiene que dar el número nuevo
```

Vercel tarda entre 1 y 3 minutos. **No des por desplegado nada que no hayas
visto en `version.json` de producción.**

---

## 2. Arquitectura en dos minutos

Es una aplicación de una sola página, sin framework, sin build. Se edita el
archivo y se despliega.

| Archivo | Qué es |
|---|---|
| `app-premium.html` | 4.639 líneas. Todas las pantallas, ocultas/mostradas por JS |
| `premium.js` | **39.702 líneas**. Toda la lógica. Es *el* archivo |
| `premium-redesign.css` | 15.877 líneas. Estilos y tokens de color |
| `sw.js` | Service worker: caché y notificaciones push |
| `index.html` | Redirige a `app-premium.html` |
| `app.html` | La app vieja; hoy sólo una redirección de 1 KB |

**Fuera del navegador:**

| Dónde | Qué |
|---|---|
| `api/` (Vercel) | `gemini.js` (proxy de IA), `send-email.js`, `verify-turnstile.js` |
| `supabase/functions/` | `send-dm-push`, `stripe-checkout`, `stripe-webhook`, `delete-account` |
| `.github/scripts/` | copias de seguridad, restauración, notificaciones diarias |
| `.github/workflows/` | `backup.yml`, `restore-test.yml`, `daily-push.yml` |
| `supabase/migrations/` | 87 migraciones |
| `supabase/schema.sql` | **la estructura completa de la base**, generada sola |
| `test/` | 9 pruebas en Node puro, sin dependencias |

**Servicios:** Vercel (hosting + funciones), Supabase (base, auth, storage,
realtime), Gemini 2.5 Flash (IA, vía el proxy), Stripe y PayPal (pagos),
Cloudinary, Resend (correo), Cloudflare Turnstile.

Proyecto de Supabase: **`yuravtnjvvztsxdtggod`**. Está en **plan gratuito**, que
no incluye copias de seguridad ni `pg_dump` ni la contraseña de la base. De ahí
sale medio §6.

Administradores (está escrito en `velo_is_admin()`): `consultas@heyvelo.app` y
`wearevelo.app@gmail.com`.

---

## 3. El problema de fondo del proyecto: los fallos no se ven

Si te llevás una sola idea de acá, que sea ésta.

**`supabase-js` no lanza excepciones.** Ante un error de PostgREST devuelve
`{ data: null, error: {...} }`. Un `try/catch` no atrapa nada. Durante meses la
app tuvo decenas de sitios así:

```js
try {
  await sbClient.from('tabla').insert({...});   // falla en silencio
  pToast('✓','¡Guardado!');                      // y le miente a la persona
} catch(e) {}
```

La persona veía «¡Guardado!» y su publicación no existía. Se encontraron y
arreglaron muchos casos, pero **asumí que quedan más**. La regla:

> Después de cada operación con Supabase, mirar `res.error`. Si hay error, la
> persona tiene que enterarse. Nunca celebrar antes de comprobar.

Hay un punto único por donde pasan todas las peticiones, `_veloLoudFetch` /
`_veloFetchAndLog` (alrededor de la línea 452 de `premium.js`), que:

- espera a que haya sesión antes de la primera petición a `/rest/v1`
  (había una carrera que rompía la primera carga), y
- muestra un aviso al usuario si **una escritura** falla.

Ese aviso tiene una lista de exclusión, `_enSilencio`, con las tablas de
telemetría (`usage_events`, `ia_usage`, `velo_api_usage`, `bot_attempts`,
`vibe_views`, `push_history`, `guardian_presence`, `circle_members`). **Si
agregás una tabla de fondo, agregala ahí**, o le vas a decir «No se pudo
guardar» a alguien que no hizo nada. Está cubierto por
`test/escritura-fallida.test.js`, que tiene 19 comprobaciones.

---

## 4. Seguridad: las cuatro lecciones que más caras salieron

Están en el **anexo A**, §11 a §14, con más detalle. Resumen operativo:

**a) PERMISSIVE vs RESTRICTIVE.** Las policies permisivas se combinan con OR,
las restrictivas con AND. Yo afirmé que un límite diario «no funcionaba»
razonando con OR sobre una policy que era RESTRICTIVE. Era falso.
**Mirá la columna `permissive` de `pg_policies` antes de afirmar nada, y mejor
probalo.**

**b) La RLS también se aplica dentro de la subconsulta de una policy.** El tope
de 25 mensajes de IA al día contaba `select count(*) from ia_usage where
user_id = auth.uid()`, pero `ia_usage` no tenía policy de SELECT: el count daba
0 siempre y no topaba nada. Consulta para detectar el caso:

```sql
select tablename, policyname,
       (select count(*) from pg_policies p
         where p.tablename = l.tablename and p.cmd in ('SELECT','ALL')) as lecturas
from pg_policies l
where schemaname='public' and coalesce(with_check,qual) ~* 'select count\(\*\)';
```
`lecturas = 0` es la señal.

**c) Revocar un permiso a `anon` no siempre surte efecto.** Las funciones nacen
con `EXECUTE` concedido a `PUBLIC` y `anon` lo hereda por ahí. Hay que quitarlo
de `PUBLIC` y devolvérselo explícitamente a `authenticated` y `service_role`.
**Comprobá siempre después de revocar**, y contra el endpoint público real:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/rest/v1/rpc/<fn>" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" -d '{}'
```
401 con `42501 permission denied` = cerrado de verdad.

**d) El linter de Supabase marca como ERROR nueve vistas que están bien.** Son
justamente las que **anonimizan** (`help_posts_feed`, `happy_posts_full`,
`bitacora_posts_full`, `daily_responses_feed`…). Tienen que saltarse la RLS de
la tabla cruda para devolver la fila con el `user_id` en NULL cuando el post es
anónimo. **Si les ponés `security_invoker=on`, los feeds anónimos dejan de
verse.** No las «arregles».

Comprobado el 12/08 que la máscara coincide con lo que la app escribe: los 15
posts anónimos guardan literalmente `"Usuario Anónimo"`, y los de la pregunta
diaria `"Anónimo"`, que es la cadena exacta que compara la vista.

**Regla general que se rompió varias veces:** antes de cerrar una policy, mirar
qué la usa. Cerrar de más rompe funciones que nadie recordaba.

---

## 5. La red de crisis — no la toques sin entender esto

Si alguien escribe que se quiere matar, la app abre el SOS con líneas de ayuda.
Hay **dos capas**:

1. `_geminiCrisisCheck` — clasificador con IA. Empieza con
   `var result = await _geminiCall(prompt); if(!result) return;` → **si la IA no
   responde, no pasa nada**.
2. `_crisisRedLocal(texto)` / `_localCrisisCheck` — detector local por
   expresiones regulares, corre en el navegador y **no depende de nada**.

Hasta v1648 sólo la Sala de Ayuda tenía la capa local. Los dos **chats** —el del
guardián y el del acompañante de IA— dependían únicamente de Gemini, que es
**prepago**. Con el crédito agotado, esa persona no veía ninguna línea de
crisis. Se arregló en v1649: los tres caminos tienen la red local.

Tiene un tope de 10 minutos para no repetir el cartel en cada mensaje del chat.
Está cubierto por `test/crisis-red-local.test.js`, que comprueba además que el
lenguaje cotidiano («me muero de risa») no dispare nada.

**Cualquier cambio en esta zona pasa por esa prueba.**

---

## 6. Copias de seguridad y restauración (todo esto es del 13/08)

Era el agujero más grande del proyecto y se cerró entero el último día. Vale la
pena entenderlo porque es lo que te salva el peor día.

**El punto de partida:** las copias llevaban meses en verde y **ninguna se había
restaurado nunca**. Al probarlo por primera vez aparecieron cuatro fallos, y los
cuatro eran reales:

1. **No existía la estructura en ninguna parte.** 27 de las 61 tablas —incluidas
   `profiles`, `momentos`, `circles`, `daily_responses`, `reviews`— se habían
   creado a mano en el panel de Supabase y no tenían ningún `create table` en el
   repositorio. Había 1.231 filas sin ningún sitio donde volcarlas.
2. **Faltaba `auth.users`.** PostgREST no la expone. Cinco tablas le apuntan con
   clave ajena: `mood_entries`, `diary_entries`, `daily_responses`,
   `dq_reactions`, `content_reports`. O sea que **los ánimos y los diarios** eran
   justo lo que no entraba.
3. **Faltaban las secuencias.** `circle_messages.id` es un serial clásico; sin su
   `create sequence` la tabla no se crea y detrás caen sus restricciones,
   policies y permisos. Los mensajes de los Círculos de Paz no se restauraban.
4. **Nueve columnas `id` eran `GENERATED ALWAYS AS IDENTITY`**, que rechazan
   cualquier valor, aunque sea el suyo. Por PostgREST no había forma de
   sortearlo. Pasadas a `BY DEFAULT`.

**Cómo quedó:**

| Pieza | Qué hace |
|---|---|
| `backup.yml` (03:40 UTC) | datos a artefacto (30 días) + `auth_users.json` + archivos de Storage + vuelca `supabase/schema.sql` y lo commitea si cambió |
| `dump-schema.js` | llama a `velo_dump_schema()` (SECURITY DEFINER, sólo service_role) |
| `backup-storage.js` | los 3 cubos: `vibes`, `avatars`, `velo-assets` (26 archivos, 24 MB) |
| `restore-test.yml` (04:20 UTC) | **la prueba**: PostgreSQL vacío → `schema.sql` → la copia de esa noche → cuenta fila por fila |
| `test/db/prelude.sql` | el andamio que Supabase da y un PostgreSQL pelado no: roles, `auth.uid/jwt/users`, `net.http_post` |
| `restore-local.js` | el cargador; ordena las tablas por sus claves ajenas, no por una lista a mano |
| `restore.js` | la restauración de verdad sobre Supabase. **Por defecto simula**; sólo escribe con `--commit` |
| `restore-storage.js` | los archivos, a su cubo con la MISMA ruta (la URL pública se arma con la ruta) |

**Última ejecución verde (13/08 14:04 UTC):** 1.306 de 1.306 filas en 60 tablas,
10 cuentas, 26 archivos, 62 tablas y 179 policies —las mismas que producción—,
cero errores, y todas las tablas conservando la RLS.

La prueba comprueba también que **la RLS quede puesta**: restaurar los datos con
las puertas abiertas sería el peor final posible.

> **`supabase/schema.sql` lo escribe una máquina.** No lo edites a mano. Si
> querés cambiar la base, escribí una migración; el archivo se actualiza solo
> esa noche. Si aparece un cambio que no esperabas, alguien tocó la base desde
> el panel en vez de escribir una migración.

**De paso, esto es el único aviso automático del proyecto.** No hay Sentry ni
nada parecido: si se revoca la clave de servicio, se pausa el proyecto o alguien
rompe el esquema, esto se pone en rojo esa noche y llega el correo de GitHub.

**Lo que sigue sin cubrirse:** las contraseñas (`encrypted_password`). Al
restaurar, cada persona vuelve a entrar con su correo y sus datos se reenlazan
por el id. Meter hashes en un artefacto de GitHub es una decisión del titular.

---

## 7. Las pruebas

Nueve, en Node puro, sin dependencias:

```bash
for t in test/*.test.js; do node "$t" || echo "FALLA $t"; done
```

| Prueba | Qué protege |
|---|---|
| `crisis-detector` / `crisis-red-local` | la red de crisis, con y sin IA |
| `escritura-fallida` | 19 comprobaciones del punto único de fallos |
| `dsa-moderacion` | avisar al autor y dejar apelar (obligación del DSA) |
| `fechas-locales` | la semana de ánimo se calculaba con fecha UTC |
| `reacciones` | emojis y etiquetas de las 23 reacciones |
| `restore-order` | el orden de restauración |
| `session-gate` | la carrera de sesión de la primera carga |
| `wrapped-paralelo` | el resumen mensual |

**Todas leen el código directamente de `premium.js` con expresiones regulares y
lo evalúan**, así que no pueden desincronizarse del código real. Si movés una
función, la prueba se rompe y te enterás.

---

## 8. Lo que queda pendiente

### Del titular — necesita sus cuentas, no se puede hacer desde el código

Está todo en el **anexo B**, ordenado por lo que cuesta dejarlo.

1. 🔴 **La clave de Gemini.** Hay dos dando vueltas; la del proyecto *Velo app2*
   (`…TtNk`) está en nivel **pagado**, las otras en gratuito — y en el gratuito
   Google puede usar el contenido para entrenar. Por esta app pasan
   conversaciones de gente contando por qué la está pasando mal. Va en Vercel y
   en GitHub Actions.
2. 🔴 **Recarga automática del crédito de Gemini.** Es prepago y quedaban ~9 €.
   Cuando llegue a cero se caen el acompañante, la moderación automática y los
   resúmenes, sin ningún aviso. (La red de crisis ya no depende de eso.)
3. 🟡 **Terminar el cambio de la clave VAPID.** La privada vieja está en el
   historial de un repo público (commit `91b34d3`). Toda la maquinaria está
   hecha: el servidor firma con las dos claves y la app re-suscribe sola a cada
   persona. Falta generar el par y poner la privada en el secreto
   `VAPID_PRIVATE_KEY_NEW`, y **después** cambiar `_VAPID_PUBLIC_KEY` en
   `premium.js` — en ese orden, o las notificaciones dejan de llegar.
   **Matiz importante, para no exagerarlo:** con la clave sola no alcanza, hacen
   falta también los endpoints de suscripción, que están en
   `profiles.push_subscription` y no son legibles por nadie más. Hay que rotarla,
   pero no es una puerta abierta hoy.
4. 🟡 Decidir si las copias guardan los hashes de contraseña.
5. 🟡 El interruptor de contraseñas filtradas (Supabase → Authentication →
   Passwords → HaveIBeenPwned). Hoy está apagado.
6. 🟢 Los plazos de conservación de datos.

### Legal — son los bloqueos de lanzamiento

Ver el **anexo C**. Quedan tres, todos del
titular: el registro de actividades del art. 30, aceptar 6 DPA, y firmar la DPIA
(tiene campos `[COMPLETAR]` con los datos societarios).

### Producto — preguntas abiertas, no decididas

- **Los cuatro feeds de contenido** (Bitácora, Sala de Ayuda, Alegrías,
  Momentos) compiten entre sí. Consolidarlos antes de lanzar es una decisión de
  producto pendiente.
- **Sólo 2 de 11 personas activaron las notificaciones**, con un alta de 3 pasos
  en iPhone. No es un bug; es el número que más predice si la gente vuelve.
- Qué hacer con los datos del piloto antes de que entre el primer usuario real.

---

## 9. Trampas concretas que ya quemaron a alguien

- **`toISOString()` para agrupar por día.** Da fecha UTC. La semana de ánimo
  salía corrida para quien vive en Europa. Usar `_dateKey(d)`, que es local.
- **PostgREST rechaza la operación ENTERA si pedís una columna que no existe**
  (42703 / PGRST204). Un `select('id')` sobre una tabla sin `id` no devuelve
  menos: no devuelve nada.
- **iOS Safari pinta el texto de los `<button>` con el color del sistema** salvo
  que lleven `-webkit-appearance:none`. Y `-webkit-text-fill-color` se hereda y
  le gana a `color`. Varios textos invisibles en modo oscuro salieron de ahí.
- **Medir contraste leyendo `backgroundColor` no sirve en esta app**, porque casi
  todo son degradados. Un auditor mío devolvió 266 hallazgos y **los 266 eran
  falsos**: una captura del titular mostró que el texto marcado con «1.4:1» se
  leía perfectamente. Si vas a auditar contraste, calculá sobre el color
  compuesto real.
- **Los `sleep` en primer plano están bloqueados** en el entorno de Claude Code;
  hay que usar tareas en segundo plano.
- **Tres tablas no admiten la optimización `(select auth.uid())` en policies.**
  Está explicado en el **anexo A**, §5bis.

---

## 10. Cómo se ha trabajado acá, y qué va a cambiar

Buena parte del trabajo de estas semanas se hizo con **conexión directa** a
Supabase (aplicar migraciones, consultar producción, desplegar edge functions),
a Vercel y a GitHub. Si el asistente que lo retome no tiene esas conexiones va a
poder **escribir** el SQL pero **no aplicarlo**: habrá que pegarlo a mano en el
editor SQL de Supabase. Lo mismo con los despliegues. No es mejor ni peor, pero
conviene saberlo antes y no descubrirlo a mitad de un cambio.

**Lo que más bugs encontró en todo el proyecto no fue el análisis estático: fue
el titular usando la app y mandando capturas de pantalla.** La reacción que no
se veía, el botón que faltaba, el texto ilegible sobre el fondo, el wrapped que
tardaba. Ninguno de ésos salió leyendo código. Si podés, pedile capturas.

**Y una advertencia sobre mí mismo, porque es el error que más repetí:** afirmé
varias veces cosas que resultaron falsas y que había «razonado» sin comprobar
—que una policy no se aplicaba, que una reacción se había revelado por un
arreglo mío, que los números de uso eran rechazo del mercado, que la clave VAPID
filtrada era explotable hoy—. En una base de datos casi todo se puede **probar**
en una transacción que se deshace:

```sql
do $$
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"<uid>","role":"authenticated"}',true);
  insert into public.<tabla>(...) values (...);
  raise exception 'probado, se deshace todo';
end $$;
```

Compruébalo. Este proyecto ya perdió tiempo con afirmaciones mías que sonaban
razonables y eran falsas.

---

## 11. Los anexos que vienen abajo

| Anexo | Qué tiene |
|---|---|
| **A** | El documento largo: arquitectura, historial de todo lo arreglado, las 14 lecciones, consultas de verificación útiles |
| **B** | Las 9 cosas que sólo puede hacer el titular (sus cuentas, sus secretos), ordenadas por coste de dejarlas |
| **C** | Qué falta para poder lanzar |

Los documentos legales (`LEGAL-DPIA.md`, `LEGAL-registro-tratamiento.md`,
`LEGAL-dpa-y-dpia.md`, `LEGAL-brechas-y-conservacion.md`,
`LEGAL-procedimiento-crisis.md`) **no van acá a propósito**: son para el titular
y su asesoría, no para quien programa, y sumarían 45 KB de texto jurídico que no
cambia ninguna decisión técnica. Están en el repositorio si hacen falta.



---
---

# ANEXO A — El documento largo (HANDOVER)

> Historial completo, arquitectura en detalle, las 14 lecciones y las consultas de verificación. Es el archivo de referencia del proyecto.

---

## Traspaso de Velo — lo que hay que saber antes de tocar nada

Documento para quien retome el desarrollo de esta aplicación (otra persona, otro
asistente). Escrito el 07/08/2026, actualizado el 13/08/2026.
Versión en producción al cierre: **v1652** (algunos párrafos de más abajo citan
la versión que era actual cuando se escribieron; el número que vale es 1652).

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
| `LEGAL-*.md` (en el repositorio), anexo C | Estado legal y de lanzamiento |

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
el **anexo B**, con qué hay que hacer y dónde va cada dato.
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

12. **Revocar un permiso a `anon` a secas no siempre surte efecto.** Las
   funciones nacen en Postgres con `EXECUTE` concedido a `PUBLIC`, y `anon` lo
   hereda por ahí. El 12/08, al cerrar `velo_is_premium(text)`, el
   `revoke ... from anon` se aplicó sin error y
   `has_function_privilege('anon', ...)` siguió devolviendo **true**. Hay que
   quitar el grant de `PUBLIC` y devolvérselo explícitamente a `authenticated`
   y `service_role`.

   Regla: después de cualquier revoke, comprobarlo. Y comprobarlo contra el
   endpoint público real, con la clave que va en el HTML, no sólo con
   `has_*_privilege`:

   ```
   curl -s -o /dev/null -w "%{http_code}\n" \
     -X POST "$SUPABASE_URL/rest/v1/rpc/<fn>" \
     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
     -H "Content-Type: application/json" -d '{}'
   ```
   401 con `42501 permission denied` = cerrado de verdad.

13. **El linter de Supabase (`get_advisors`) marca como ERROR vistas que están
   bien.** Los nueve `security_definer_view` de este proyecto son a propósito:
   son justamente las vistas que **anonimizan** (`help_posts_feed`,
   `happy_posts_full`, `bitacora_posts_full`, `daily_responses_feed`…). Tienen
   que saltarse la RLS de la tabla cruda para poder devolver la fila con el
   `user_id` puesto a NULL cuando el post es anónimo. Si se «arreglaran»
   poniéndoles `security_invoker=on`, los feeds anónimos dejarían de verse.

   Comprobado el 12/08 que la máscara coincide con lo que la app escribe: los
   15 posts anónimos de `help_posts`/`happy_posts` guardan literalmente
   `"Usuario Anónimo"` en `user_name` (ningún nombre real), y los 7 de
   `daily_responses` guardan `"Anónimo"`, que es exactamente la cadena que
   compara la vista. No hay de-anonimización por esta vía.

14. **Una policy que cuenta filas necesita poder VERLAS.** La RLS se aplica
   también dentro de la subconsulta de una policy. `ia_usage_daily_limit`
   contaba `select count(*) from ia_usage where user_id = auth.uid()` para topar
   en 25/día, pero `ia_usage` no tenía ninguna policy de SELECT: el count daba 0
   siempre y la restrictiva dejaba pasar todo. Entraban 26 de 26.

   Se arregló con `ia_usage_select_own` (13/08). La forma de detectarlo, por si
   aparece otra:

   ```sql
   -- policies que cuentan filas, y si su tabla es legible por su dueño
   select tablename, policyname,
          (select count(*) from pg_policies p
            where p.tablename = l.tablename and p.cmd in ('SELECT','ALL')) as lecturas
   from pg_policies l
   where schemaname='public' and coalesce(with_check,qual) ~* 'select count\(\*\)';
   ```
   `lecturas = 0` es la señal. De las tres del proyecto sólo `ia_usage` la tenía.

   Ojo con el tamaño real del problema: `ia_usage` es la tercera de tres capas.
   La que protege el saldo de Gemini es el 429 del proxy `/api/gemini`
   (`velo_consume_quota`, SECURITY DEFINER, sin esta ceguera), y el cliente ya
   lo entiende desde v1621. No hubo consecuencia visible. Los cuatro límites por
   trigger (bitácora, momentos, botellas, reacciones) tampoco sufren esto, por
   ser SECURITY DEFINER.

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
(`.github/workflows/backup.yml`).

> **Corrección (13/08).** Acá decía que la restauración estaba «probada: ciclo
> completo con 0 filas distintas». Eso era un **simulacro contra la base viva**
> —comparar la copia con lo que ya estaba— y una restauración de verdad es
> volcarla donde no hay nada. Al hacerlo por primera vez aparecieron dos
> agujeros que el simulacro no podía ver, porque comparaba contra una base que
> ya tenía la estructura y las cuentas:
>
> 1. **No existía la estructura en ninguna parte.** 27 de las 61 tablas —entre
>    ellas `profiles`, `momentos`, `circles`, `daily_responses`, `reviews`— se
>    habían creado a mano en el panel y no tenían ningún `create table` en el
>    repositorio. Había 1231 filas sin ningún sitio donde volcarlas.
> 2. **Faltaba `auth.users`.** PostgREST no la expone, así que el backup nunca
>    la tuvo — y cinco tablas le apuntan con clave ajena: `mood_entries`,
>    `diary_entries`, `daily_responses`, `dq_reactions` y `content_reports`. Los
>    ánimos y los diarios, o sea lo más personal que guarda la app, eran justo
>    lo que no entraba. Comprobado: falla con
>    `violates foreign key constraint "mood_entries_user_id_fkey"`.

Cómo quedó:

| Pieza | Qué hace |
|---|---|
| `.github/workflows/backup.yml` | 03:40 UTC — datos a artefacto (30 días) + estructura a `supabase/schema.sql`, que **sí se commitea** |
| `.github/scripts/dump-schema.js` | llama a `velo_dump_schema()` (SECURITY DEFINER, sólo service_role) y escribe el DDL |
| `.github/scripts/backup.js` | los datos, más `auth_users.json` vía `velo_dump_auth_users()` |
| `.github/workflows/restore-test.yml` | 04:20 UTC — **la prueba**: PostgreSQL vacío → `schema.sql` → la copia de esa noche → cuenta fila por fila |
| `test/db/prelude.sql` | el andamio que Supabase da y un PostgreSQL pelado no: roles, `auth.uid/jwt/users`, `net.http_post` |
| `.github/scripts/restore-local.js` | el cargador; ordena las tablas por sus claves ajenas, no por una lista a mano |
| `.github/scripts/restore.js` | la restauración de verdad sobre un Supabase vivo. Por defecto simula; sólo escribe con `--commit` |

**Primera restauración de verdad, verificada el 13/08 a las 12:33 UTC:**

```
Estructura restaurada: 62 tablas, 179 policies.   (producción: 62 y 179)
--- errores al aplicar la estructura --- 0
auth.users: 10 cuentas
  ✓ mood_entries: 32/32     ✓ diary_entries: 1/1    ✓ daily_responses: 23/23
  ✓ circle_messages: 23/23  ✓ profiles: 11/11       ✓ usage_events: 693/693
  …
1304/1304 filas en 60 tablas, más 10 cuentas.
✓ La copia se restaura entera en una base vacía.
✓ Todas las tablas restauradas conservan la RLS.
```

Antes de llegar a esto hicieron falta cuatro intentos, y los cuatro fallos
fueron reales. Están en el historial y en las migraciones `20260813c`.

La prueba también comprueba que las tablas restauradas **conserven la RLS**:
recuperar los datos con las puertas abiertas sería el peor final posible —cada
persona recupera su diario, y también el de los demás.

Y de paso es el único aviso automático del proyecto: si se revoca la clave de
servicio, si se pausa el proyecto o si alguien rompe el esquema desde el panel,
esto se pone en rojo esa misma noche.

**Los archivos de Storage también se copian** (desde el 13/08). Son tres cubos
—`vibes` (fotos y audios que publica la gente), `avatars` y `velo-assets`— y hoy
pesan 24 MB entre todos, así que caben en el mismo artefacto.
`backup-storage.js` los baja y `restore-storage.js` los devuelve a su cubo con
la MISMA ruta, que es lo que importa: la URL pública se arma con la ruta, así
que las filas restauradas vuelven a apuntar a algo que existe. La prueba
nocturna comprueba que estén todos y que ninguno pese 0 bytes — un archivo vacío
en un backup es peor que uno que falta, porque parece que está.

Si algún día se pasan de 500 MB, `backup-storage.js` se para y lo dice: a partir
de ahí el artefacto no es el sitio y hace falta un bucket externo.

**Lo que sigue sin cubrir:** las contraseñas (`encrypted_password`). Es una decisión del titular
—meter hashes en un artefacto de GitHub no es gratis— y está en
el **anexo B**. Sin ellas, al restaurar cada persona vuelve a entrar
con su correo y sus datos se reenlazan solos por el id.

---

## 10. Para retomarlo con otro asistente

Ese papel lo cumple **la parte 1 de este mismo documento**. Lo único que hace
falta añadir acá:

**Diferencia práctica según las herramientas que tenga quien lo retome.** Buena
parte del trabajo de estas semanas se hizo con conexión directa a Supabase
(aplicar migraciones, consultar la base de producción, desplegar edge
functions), a Vercel y a GitHub. Un asistente sin esas conexiones va a poder
**escribir** el SQL pero **no aplicarlo**: eso habrá que pegarlo a mano en el
editor SQL de Supabase. Lo mismo con los despliegues. No es mejor ni peor, pero
conviene saberlo antes y no descubrirlo a mitad de un cambio.

Sea quien sea: **los puntos 1, 2 y 3 de este anexo son los que evitan romper la
aplicación.** El resto es contexto.

---
---

# ANEXO B — Lo que sólo puede hacer el titular

> Necesita sus cuentas o datos que sólo tiene él. No se puede resolver desde el código.

---

## Lo que sólo podés hacer vos

Todo lo demás está hecho. Esto queda porque necesita **tus cuentas** o **datos
que sólo vos tenés** — no hay forma de resolverlo desde el código.

Está ordenado por lo que más caro sale dejarlo. Los tres primeros son los
urgentes; el resto puede esperar sin que se rompa nada.

---

## 🔴 1. La clave de Gemini — 2 minutos

Hay dos claves dando vueltas. La del proyecto **Velo app2** (`…TtNk`) está en
nivel **Pagado**; las otras están en nivel **gratuito**, y en el gratuito Google
puede usar el contenido para entrenar modelos. Por esta app pasan
conversaciones de gente contando por qué la está pasando mal.

Poné `…TtNk` en los dos sitios:

| Dónde | Variable |
|---|---|
| Vercel → Settings → Environment Variables | `GEMINI_API_KEY` |
| GitHub → Settings → Secrets → Actions | `GEMINI_API_KEY` |

---

## 🔴 2. Recarga automática del crédito de Gemini — 2 minutos

El crédito es **prepago** y quedaban ~9 €. Cuando llega a cero dejan de
funcionar, **sin ningún aviso**:

- el acompañante,
- la moderación automática,
- **el clasificador de crisis**,
- los resúmenes mensuales.

Lo importante es el tercero. En Google AI Studio → Billing, activá la recarga
automática. Es la diferencia entre que la red de seguridad esté puesta o no.

> El detector local de crisis (`_localCrisisCheck`) **sigue funcionando sin IA
> ni cupo** — corre en el navegador. La IA es la segunda capa, no la única.

---

## 🔴 3. Terminar el cambio de la clave de notificaciones — 5 minutos

**Sube de amarillo a rojo (13/08).** Comprobado hoy: el repositorio es público
(`"visibility": "public"`) y la clave privada vieja sigue siendo legible en el
commit `91b34d3`. Git no olvida lo que se borra.

Con esa clave, cualquiera puede firmar una notificación que el teléfono muestra
**como si fuera de Velo**. En una app de salud mental eso no es spam: es alguien
escribiéndole a una persona vulnerable con nuestra cara. Es lo más serio que
queda abierto en todo el proyecto.

Toda la maquinaria está hecha y probada. El servidor firma con las dos claves
durante la transición, y la app le borra la suscripción vieja a cada persona y
le crea una nueva sola al abrirse, sin pedirle nada. Falta un paso, y es tuyo
porque toca los secretos:

```
npx web-push generate-vapid-keys
```

1. La **privada** → GitHub → Settings → Secrets → Actions → `VAPID_PRIVATE_KEY_NEW`
2. La **pública** → decímela y la pongo en `premium.js` (la pública es pública,
   se puede pegar por acá sin problema; **la privada no me la mandes**)

**En ese orden.** Si cambia primero la constante de la app, el servidor no puede
firmar lo que el navegador exige y las notificaciones dejan de llegar. Para que
eso no pase en silencio, `send-push.js` ahora se pone en rojo si detecta a
alguien con la clave nueva y sin el secreto puesto.

---

## 🟡 4. Aceptar los DPA — 15 minutos

Contrato de encargado del tratamiento, art. 28 RGPD. Uno por proveedor:

| Proveedor | Para qué | Estado |
|---|---|---|
| Google (Gemini) | IA: acompañante, moderación, resúmenes | ⬜ |
| Supabase | Base de datos, cuentas, archivos | ⬜ |
| Vercel | Alojamiento y funciones | ⬜ |
| Stripe | Pagos | ⬜ |
| Cloudinary | Imágenes y vídeo | ⬜ |
| Resend | Correos | ⬜ |

Al aceptarlos, marcá la fila en `LEGAL-registro-tratamiento.md` (tabla de
transferencias internacionales).

---

## 🟡 5. Datos societarios — 10 minutos

Los documentos legales están escritos y completos **salvo** estos campos, que
sólo vos podés rellenar. Van todos juntos acá para que no los busques:

| Dato | Dónde va |
|---|---|
| Razón social | `LEGAL-registro-tratamiento.md` (responsable) |
| NIF / NIPC | idem |
| Domicilio fiscal | idem |
| Teléfono de contacto | `LEGAL-brechas-y-conservacion.md` |
| ¿Hay DPO designado? | `LEGAL-brechas-y-conservacion.md` — si lo hay, hay que comunicarlo a la CNPD |

Después: fechar y firmar `LEGAL-DPIA.md`, y copiar los mismos datos a la
Política de Privacidad de la app.

---

## 🟡 6. ¿Guardamos las contraseñas en las copias? — decisión de 1 minuto

Al probar una restauración de verdad por primera vez (13/08) apareció que las
copias no incluían la lista de cuentas. Ya se arregló: ahora guardan id, correo
y fechas, y con eso los ánimos y los diarios vuelven enlazados a su dueño.

Lo que **no** se guarda es `encrypted_password`. Sin esas contraseñas, en una
restauración cada persona tendría que volver a entrar con su correo (sus datos
siguen ahí y se reenlazan solos por el id).

Guardar los hashes haría la restauración transparente, pero mete material de
credenciales en un artefacto de GitHub. Es una decisión tuya, no algo que se
hace de oficio. **Si no hacés nada, se queda como está**, que es la opción
prudente.

---

## 🟡 7. El interruptor de contraseñas filtradas — 1 minuto

Supabase → Authentication → Passwords → activar la comprobación contra
HaveIBeenPwned. Rechaza contraseñas que ya aparecieron en filtraciones
conocidas. Hoy está apagado.

---

## 🟢 8. Decidir los plazos de conservación

Están implementados y **desactivados a propósito**: borrar datos de gente es
una decisión tuya, no técnica. Para ver qué se borraría con cada plazo:

```sql
select * from public.velo_retention_report();
```

Se activan uno por uno en `public.velo_retention_policy` (`enabled = true`).

---

## 🟢 9. Probar la app usándola

Es el único hueco que no se puede tapar desde acá. Todo lo verificado hasta
ahora fue contra la base de datos y renderizando piezas sueltas en un navegador.
Lo que **no** está cubierto: el PWA en iPhone, los flujos completos de punta a
punta, y cualquier cosa que sólo aparezca usándola de verdad.

De hecho, los últimos ocho bugs salieron de que vos abriste la app y miraste.
Ninguna revisión automática los habría encontrado.


---
---

# ANEXO C — Qué falta para lanzar

> Estado de los bloqueos de lanzamiento.

---

## Checklist para lanzar Velo públicamente

Estado verificado contra el código y la base el **24/07/2026** (v1617).
Velo = **red social de ayuda mutua**. No es servicio de salud.

> ⚠️ **No es asesoramiento legal.** Es una lista técnica de huecos detectados
> revisando la app. Tratás datos de ánimo (categoría especial, art. 9 RGPD), que
> es el escenario más exigente: esto lo tiene que validar un abogado de
> protección de datos en Portugal antes de abrir al público.

---

## ✅ Ya existe y funciona

| Item | Dónde |
|---|---|
| Términos y Condiciones | `app-premium.html` — modal `termsOv` |
| Política de Privacidad | modal `privacyOv` |
| Aviso Legal (titular, jurisdicción, propiedad intelectual) | portada |
| Casilla de aceptación en el registro | `regTcCheck` |
| **Exportar mis datos** (portabilidad, art. 20) | `pBackupMyData()` — JSON con perfil, ánimos y localStorage |
| **Borrar mi cuenta** (supresión, art. 17) | RPC `delete_my_account` — reescrito 24/07, borra 43 tablas + perfil + auth |
| Banner de cookies | `cookieBanner` |
| Modal de encargados / DPA | `dpaOv` |
| Emails de contacto y de privacidad | `consultas@` / `privacidad-datos@` |
| Directorio SOS (líneas de crisis) | sección SOS |
| Moderación (IA + reportes de usuarios) | `moderation_flags` |
| Transparencia de IA (Reglamento UE 2024/1689) | Términos §9 |

---

## 🔴 BLOQUEANTES — resolver antes de abrir

### ~~1. Los analytics cargan ANTES del consentimiento~~ ✅ RESUELTO (v1614)
Los scripts de Vercel ya no se cargan en el `<head>`: se inyectan por JS sólo si
el consentimiento guardado es `all`. Con "Solo esenciales" no se cargan nunca.
Texto del banner corregido.

### ~~2. No hay verificación de edad~~ ✅ RESUELTO (v1614)
Casilla obligatoria de 16+ con validación en `pSignUp`. Se registra la constancia
(`age_confirmed_at`) y la versión de términos aceptada (`terms_version`) —
columnas aplicadas en la base el 24/07.

### 3. Registro de Actividades de Tratamiento (art. 30) — 📄 BORRADOR LISTO
Ver `LEGAL-registro-tratamiento.md`: las 9 actividades documentadas desde el
código. Falta que el responsable complete los campos `[COMPLETAR]` (datos
societarios y plazos de conservación).

### 4. Faltan los DPA firmados con los proveedores — ⬜ ACCIÓN DEL TITULAR
6 proveedores: Supabase, Vercel, Stripe, Google (Gemini), Cloudinary y Resend.
Instrucciones de dónde aceptar cada uno en `LEGAL-dpa-y-dpia.md`.

⚠️ **Revisar primero el de Google:** si Gemini está en el tier gratuito, el
contenido enviado puede usarse para entrenar modelos. Con datos de ánimo y
conversaciones personales eso hay que descartarlo antes de abrir.

### 5. Evaluación de Impacto (DPIA, art. 35) — muy probablemente obligatoria
Se dispara por combinar: **datos de categoría especial** (ánimo), a escala, con
**perfilado por IA** (resúmenes) y usuarios en situación vulnerable.

**Arreglo:** borrador con la matriz de riesgos en `LEGAL-dpa-y-dpia.md`. La
decisión y la firma son del responsable con su abogado. Si el criterio es que no
aplica, hay que dejar constancia escrita del razonamiento.

---

### ~~De-anonimización de las publicaciones anónimas~~ ✅ RESUELTO (v1618)
Era el hueco de privacidad más grave que quedaba: cualquier persona con cuenta
podía pedir la tabla cruda (`GET /rest/v1/help_posts?select=user_id,preview`) y
obtener el autor real de cada publicación "anónima", cruzándolo con `profiles`
para ponerle nombre. Además, comentar cualquier post de Bitácora devolvía el
`user_id` de su autor.

**Arreglado en `20260729_anon_posts_deanon_fix.sql` + cliente v1618:**
- Las publicaciones anónimas ajenas ya no son legibles en la tabla cruda (ni por
  el websocket). El feed se sirve por las vistas enmascaradas.
- El aviso al autor de un comentario o reacción lo resuelve el servidor (RPC
  `velo_notify_bitacora_author`); el cliente nunca recibe su identificador.
- De paso: borrar una publicación de Bitácora vuelve a ser cosa del autor (o de
  moderación). Antes cualquier usuario podía borrar la de cualquiera.

✅ **Aplicada en la base el 29/07.** Verificado simulando un usuario cualquiera:
17 publicaciones anónimas (12 en Sala de Ayuda, 3 en Muro, 2 en Bitácora) dejaron
de ser rastreables; el feed sigue completo, el autor sigue viendo las suyas,
moderación sigue viendo todo, y publicar funciona en las tres secciones.

---

## 🟠 IMPORTANTES — poco trabajo, evitan problemas

### ~~Policies `USING(true)` en otras tablas~~ ✅ RESUELTO (v1620, 30/07)
Cerradas 15 tablas. Lo que estaba abierto y ya no:

| Tabla | Qué permitía |
|---|---|
| `reportes` | Leer **todos los reportes, incluidos los de crisis** — el dato más sensible de la app |
| `bitacora_reports` | Ver **quién reportó a quién** (material para represalias) |
| `happy_history` | Borrar el historial del Muro de todos |
| `contacts` | Leer los mensajes del formulario de contacto, con su email |
| `terms_acceptance` | Alterar la constancia de consentimiento (art. 7.1) |
| `user_blocks` | Leer y quitar los bloqueos de otra persona |
| `guardian_presence` | Cambiarle a otro el nombre, el estado o la valoración |
| `admin_news` | Publicar avisos con pinta de oficiales |
| `donations` | Ver quién donó y cuánto |
| `momentos`, `bitacora_reactions`, `reviews` | Editar o borrar contenido ajeno |
| `plus_grants`, `bookings`, `sessions` | Escribir en tablas internas o retiradas |

**Corrección:** el 29/07 se dijo que `plus_grants` permitía darse Velo Plus sin
pagar. Es falso — nada lee esa tabla para autorizar. Quien decide es
`profiles.role`, protegido por el trigger `trg_velo_protect_role`.

**Bug corregido de paso:** `momentos` no tenía policy de DELETE, así que borrar
un momento no borraba nada (decía "listo" y reaparecía al refrescar). Ahora sí.

Estado final en toda la base: **0 policies `ALL` y 0 `DELETE` con `USING(true)`**
(eran 13 y 3). Quedan 2 `UPDATE` abiertas a propósito (el guardián cierra el
pedido ajeno; las reacciones escriben en el post ajeno) y 18 `SELECT` de
contenido público por diseño.

### ~~6. Procedimiento de brechas de seguridad (art. 33)~~ 📄 ESCRITO
`LEGAL-brechas-y-conservacion.md`, parte 1: qué cuenta como brecha en Velo, los
5 pasos, cuándo hay que notificar a la CNPD y cuándo además a las personas, y
qué registrar siempre. Falta que el responsable complete el contacto.

### ~~7. Plazos de conservación concretos~~ 📄 PROPUESTOS
Mismo archivo, parte 2: una tabla con plazo y motivo para cada tipo de dato.
Falta que el responsable decida los `[COMPLETAR]` y copiarlos a la Política de
Privacidad.

### ~~8. Re-consentimiento al cambiar los términos~~ ✅ RESUELTO (v1614)
Se guarda `terms_version` además de la fecha. Al publicar textos nuevos, basta
subir `VELO_TERMS_VERSION` en `premium.js` para poder identificar quién aceptó
qué versión. *(Falta implementar el aviso de re-aceptación en sí.)*

### ~~9. Sin límite de uso en los endpoints de IA y email~~ ✅ RESUELTO (v1621)
El tope lo lleva ahora el **servidor**, no el cliente. Antes, el contador de 25
mensajes de IA lo insertaba el navegador, así que llamar a `/api/gemini`
directamente con el token lo salteaba entero y se podía quemar la clave de
Gemini en un bucle.

Ahora los dos proxies llaman al RPC `velo_consume_quota`, que cuenta y registra
en el mismo paso: **25 IA/día** (ilimitado con Plus) y **10 correos/día** (sin
tope para moderación, que responde consultas). La tabla del contador no es
accesible por REST — sólo entra por el RPC. Verificado: el mensaje 26 y el
correo 11 se cortan.

Si la base no responde, se **deja pasar**: no vale cortarle la IA a todo el
mundo por un fallo de conexión.

### ~~10. Obligaciones de moderación (DSA)~~ ✅ RESUELTO (v1648)
Al moderar se avisa al **autor** con el motivo, y desde ese mismo aviso puede
pedir revisión. «Contenido OK» no genera aviso; sin autor identificado no se
inventa destinatario. La apelación entra en `reportes` con
`categoria:'apelacion'`, que es la bandeja que el panel ya lista — sin tabla ni
pantalla nuevas. El punto de contacto (`consultas@heyvelo.app`) ya está
publicado en la pantalla de Contacto.

Cubierto por `test/dsa-moderacion.test.js`, incluido que un guardado fallido
**no** se celebre.

---

## 🟡 RECOMENDABLES

- 🔴 **Backups: el proyecto está en plan GRATUITO y NO tiene copias
  automáticas.** Verificado el 30/07. Si la base se pierde, se pierden los
  diarios, ánimos y conversaciones de todo el mundo, sin vuelta atrás.
  **Mitigación puesta hoy:** volcado nocturno a JSON como artefacto de GitHub
  (`.github/workflows/backup.yml`), usando el secreto que ya existía. Cubre las
  54 tablas pero **no** los audios/imágenes de Storage ni `auth.users`.
  Para eso hace falta el plan Pro (~25 USD/mes) o un `pg_dump` con la
  contraseña de la base. **Falta probar una restauración.**
- **Rotar el VAPID key:** estuvo en el repositorio (queda en el historial de git).
- ~~De-anonimización~~ ✅ **RESUELTO (v1618)** — ver abajo.
- **Página de estado / aviso de caídas.**
- **Accesibilidad** (contraste, lectores de pantalla) — exigible a servicios
  digitales en la UE desde 2025.

---

## Qué queda, por responsable

**Del titular (no requiere código):**
1. Aceptar los 6 DPA — empezando por Google/Gemini (ver aviso arriba)
2. Completar los `[COMPLETAR]` del registro de tratamiento
3. Consulta con abogado: DPIA, base legal de los datos de ánimo, postura ante
   crisis (las 5 preguntas están en `LEGAL-dpa-y-dpia.md`)

**Técnico pendiente:**
4. Rotar la VAPID privada (estuvo en el repositorio)
5. Probar una restauración a partir de un backup
6. Aplicar los plazos de conservación que decida el titular (3 necesitan un
   trabajo programado: cuentas inactivas, pedidos viejos, reportes resueltos)

**Ya cerrado el 24/07:** encuadre de la app, textos legales, transparencia de IA,
consentimiento de analytics, edad mínima, constancia de consentimiento,
procedimiento de crisis, eliminación de Groq, y el cierre de las policies de
escritura de diario/ánimos y de moderación en la base.
