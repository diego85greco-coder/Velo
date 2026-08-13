# Traspaso de Velo a otro asistente

Este archivo existe para que otra IA pueda tomar el control del proyecto sin
romper nada y sin volver a descubrir lo ya descubierto. Está escrito para
leerse **entero y primero**. Fecha del corte: **13/08/2026, versión 1652**.

El repositorio es **público**: `github.com/diego85greco-coder/Velo`. Cualquier
herramienta con acceso a GitHub puede leerlo entero, incluidos los archivos que
se citan acá. Si podés navegar, empezá por este archivo y seguí por
`HANDOVER.md`.

---

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

Están en `HANDOVER.md` §11 a §14 con más detalle. Resumen operativo:

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

Está todo en `PENDIENTE-DEL-TITULAR.md`, ordenado por lo que cuesta dejarlo.

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

Ver `LANZAMIENTO-CHECKLIST.md` y los `LEGAL-*.md`. Quedan tres, todos del
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
  Está explicado en `HANDOVER.md` §5bis.

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

## 11. Los otros documentos

> **Si vas a dárselo a otra IA de una sola vez**, usá
> [`MIGRACION-A-CHATGPT.md`](MIGRACION-A-CHATGPT.md): es este mismo documento
> con el HANDOVER, lo pendiente del titular y el checklist de lanzamiento
> incorporados como anexos, sin remitir a ningún archivo externo.


| Archivo | Qué tiene |
|---|---|
| `HANDOVER.md` | **el documento largo**: arquitectura, historial, 14 lecciones, verificaciones útiles |
| `PENDIENTE-DEL-TITULAR.md` | las 9 cosas que sólo puede hacer Diego, ordenadas |
| `LANZAMIENTO-CHECKLIST.md` | qué falta para poder lanzar |
| `LEGAL-*.md` | RGPD: registro de tratamiento, DPIA, DPA, brechas, procedimiento de crisis |
| `README.md` | descripción del producto |

Si sólo vas a leer dos: **éste y `HANDOVER.md`**. Y dentro del HANDOVER, los
puntos 1, 2 y 3 son los que evitan romper la aplicación; el resto es contexto.
