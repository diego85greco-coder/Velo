# Checklist para lanzar Velo públicamente

Estado verificado contra el código el **24/07/2026** (v1613).
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

### 1. Los analytics cargan ANTES del consentimiento
`app-premium.html:202,205` carga Vercel Insights y Speed Insights en el `<head>`,
sin esperar al banner. El banner además afirma *"No usamos cookies de rastreo"*.

**Por qué importa:** el banner registra la respuesta en `velo_cookie_consent`
pero **no bloquea nada** — es decorativo. Cualquier medición que no sea
estrictamente necesaria requiere consentimiento previo (ePrivacy + RGPD).

**Arreglo:** cargar esos scripts sólo tras aceptar, o quitarlos. Si se quitan,
el banner pasa a ser correcto tal como está redactado.

### 2. No hay verificación de edad
Los Términos dicen 16 años (correcto para Portugal), pero **el registro no lo
comprueba**: no hay casilla ni fecha de nacimiento.

**Arreglo:** casilla obligatoria "Declaro tener 16 años o más" junto a la de
términos, guardando la marca temporal.

### 3. Falta el Registro de Actividades de Tratamiento (art. 30)
Documento **interno** obligatorio: qué datos tratás, con qué base legal, cuánto
los conservás, con quién los compartís y a qué países.

**Arreglo:** documento aparte (no va en la app). La Política de Privacidad ya
tiene casi toda la información — hay que volcarla al formato del art. 30.

### 4. Faltan los DPA firmados con los proveedores
Hay un modal que los menciona, pero hacen falta los **acuerdos reales** con:
Supabase, Vercel, Google (Gemini), Cloudinary, Resend y Stripe.

**Arreglo:** casi todos publican un DPA estándar que se acepta desde el panel de
la cuenta. Es trámite, pero hay que hacerlo y guardar la constancia.

### 5. Evaluación de Impacto (DPIA, art. 35) — muy probablemente obligatoria
Se dispara por combinar: **datos de categoría especial** (ánimo), a escala, con
**perfilado por IA** (resúmenes) y usuarios en situación vulnerable.

**Arreglo:** es el punto que más conviene hacer con el abogado. Si el criterio es
que no aplica, hay que dejar constancia escrita del razonamiento.

---

## 🟠 IMPORTANTES — poco trabajo, evitan problemas

### 6. Procedimiento de brechas de seguridad (art. 33)
Ante una filtración hay **72 horas** para notificar a la CNPD. Hoy no hay
procedimiento escrito ni forma de saber a quién avisar.

### 7. Plazos de conservación concretos
La política dice "los mínimos exigidos legalmente". Debería decir cuántos años y
para qué (ej.: logs 12 meses; registro de aceptación de términos 5 años).

### 8. Re-consentimiento al cambiar los términos
Se guarda `terms_accepted_at`, pero no **qué versión** se aceptó. Si cambiás los
términos no hay forma de pedir la aceptación nueva.

**Arreglo:** guardar número de versión y volver a pedir aceptación al cambiarla.

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
- **De-anonimización pendiente:** en Sala de Ayuda, Muro y Bitácora, un usuario
  logueado todavía puede leer la tabla cruda y ligar publicaciones "anónimas" a
  su autor. Es el hueco de privacidad más relevante que queda abierto.
- **Página de estado / aviso de caídas.**
- **Accesibilidad** (contraste, lectores de pantalla) — exigible a servicios
  digitales en la UE desde 2025.

---

## Orden sugerido

1. **Analytics + consentimiento** y **casilla de edad** → son código, salen rápido
2. **DPA con proveedores** → trámite, se puede hacer en paralelo
3. **Registro de tratamiento + DPIA + brechas** → con el abogado
4. **De-anonimización** y **límites de uso** → deuda técnica de seguridad
5. Lo recomendable, después del lanzamiento
