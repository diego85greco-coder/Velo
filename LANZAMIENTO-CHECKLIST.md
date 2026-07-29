# Checklist para lanzar Velo públicamente

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

⚠️ **Falta aplicar la migración en la base** (la conexión a Supabase estaba caída
el 29/07). Verificación incluida al final del archivo `.sql`.

---

## 🟠 IMPORTANTES — poco trabajo, evitan problemas

### 6. Procedimiento de brechas de seguridad (art. 33)
Ante una filtración hay **72 horas** para notificar a la CNPD. Hoy no hay
procedimiento escrito ni forma de saber a quién avisar.

### 7. Plazos de conservación concretos
La política dice "los mínimos exigidos legalmente". Debería decir cuántos años y
para qué (ej.: logs 12 meses; registro de aceptación de términos 5 años).

### ~~8. Re-consentimiento al cambiar los términos~~ ✅ RESUELTO (v1614)
Se guarda `terms_version` además de la fecha. Al publicar textos nuevos, basta
subir `VELO_TERMS_VERSION` en `premium.js` para poder identificar quién aceptó
qué versión. *(Falta implementar el aviso de re-aceptación en sí.)*

### 9. Sin límite de uso en los endpoints de IA y email
Ya exigen sesión (arreglado hoy), pero un usuario autenticado puede llamarlos en
bucle y quemar la cuota de Gemini/Resend. El límite de 25 IA/día es sólo del
cliente: el proxy nunca lo consulta.

### 10. Obligaciones de moderación (DSA)
Con usuarios en la UE y contenido publicado por terceros, conviene: explicar por
qué se retira un contenido, permitir apelar, y publicar un punto de contacto.
Ya existe el sistema de reportes — falta el circuito de respuesta.

---

## 🟡 RECOMENDABLES

- **Backups y recuperación:** verificar que Supabase los tenga activos y probar
  una restauración. Hoy nadie lo comprobó.
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
4. Aplicar `20260729_anon_posts_deanon_fix.sql` en la base (código ya desplegado)
5. Límites de uso por usuario en los endpoints de IA y correo
6. Procedimiento de brechas (art. 33) y plazos de conservación concretos
7. Verificar backups y probar una restauración

**Ya cerrado el 24/07:** encuadre de la app, textos legales, transparencia de IA,
consentimiento de analytics, edad mínima, constancia de consentimiento,
procedimiento de crisis, eliminación de Groq, y el cierre de las policies de
escritura de diario/ánimos y de moderación en la base.
