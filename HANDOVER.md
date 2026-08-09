# Traspaso de Velo — lo que hay que saber antes de tocar nada

Documento para quien retome el desarrollo de esta aplicación (otra persona, otro
asistente). Escrito el 07/08/2026, versión en producción **v1626**.

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

No hay build, ni tests, ni linter. Se edita y se despliega.

---

## 5. Cosas que parecen bugs y no lo son

- **Vistas «Security Definer»**: el analizador de Supabase las marca en rojo. Es
  intencional: es lo que les permite leer todas las filas y devolverlas
  enmascaradas. Si se «arreglan», las publicaciones anónimas dejan de verse.
- **2 policies de UPDATE con `USING(true)`** en `help_posts` y `happy_posts`:
  a propósito. El guardián cierra el pedido de otra persona y las reacciones se
  escriben en el post ajeno.
- **`momentos` sin permiso de UPDATE para `authenticated`**: los corazones van
  por el RPC `increment_momento_hearts`. El update directo del cliente es código
  muerto.
- **113 avisos `auth_rls_initplan`**: rendimiento, no seguridad. El arreglo es
  mecánico pero toca 113 policies; con 19 MB no cambia nada medible.
- **`urgencia` en `help_posts` siempre NULL**: decisión deliberada del 24/07. No
  se conserva quién expresó señales de crisis. El triaje se recalcula en el
  cliente.

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

**Requiere las cuentas del titular:**
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
7. Circuito de respuesta y apelación de moderación (obligación DSA).
8. Probar la app **usándola**. Todo lo verificado hasta ahora fue contra la base
   de datos. Bugs visuales, de flujo o del PWA en iPhone: sin cubrir.

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

**Lentes que NO se aplicaron y valdría la pena:** usar la app de verdad
(iPhone/PWA), accesibilidad, y qué pasa con la interfaz cuando la base
responde lento o falla.

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
