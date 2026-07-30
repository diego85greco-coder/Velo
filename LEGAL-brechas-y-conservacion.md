# Procedimiento de brechas y plazos de conservación

**Responsable:** HeyVelo · Oporto, Portugal · privacidad-datos@heyvelo.app
**Autoridad de control:** CNPD (Comissão Nacional de Proteção de Dados) — Portugal
**Última revisión:** 30/07/2026

> Documento interno. Redactado a partir de cómo está construida la app. Los
> campos **[COMPLETAR]** dependen de decisiones del responsable.

---

# Parte 1 · Qué hacer ante una brecha de seguridad (art. 33 y 34 RGPD)

Una brecha es cualquier incidente que haga que datos personales se **pierdan**,
se **alteren**, se **divulguen** o queden **accesibles** para quien no debía.
No hace falta que haya mala intención: un fallo de configuración cuenta.

**El reloj empieza cuando tenés conocimiento del incidente, y son 72 horas.**
No cuando lo terminás de investigar.

## Ejemplos concretos en Velo

- Una policy de la base queda abierta y alguien puede leer datos ajenos
  *(exactamente lo que se encontró y se cerró el 24, 29 y 30 de julio)*
- Se filtra una clave: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
  `RESEND_API_KEY`, `STRIPE_SECRET_KEY` o la VAPID privada
- Alguien accede a la cuenta de Supabase, Vercel o al repositorio
- Un fallo hace que a una persona le aparezcan mensajes o el diario de otra
- Se pierden datos sin poder recuperarlos (borrado accidental, sin backup)

## Los 5 pasos

### 1. Contener (primero, antes que nada)
- Revocar y rotar la clave comprometida
- Si es un problema de permisos: cerrar la policy y verificar con una consulta,
  simulando un usuario normal (ver los `.sql` de julio como modelo)
- Si es una cuenta: cambiar la contraseña, activar 2FA, cerrar las sesiones
- Anotar la hora exacta en que te enteraste ⏱️

### 2. Evaluar el alcance — anotar por escrito
| Pregunta | Respuesta |
|---|---|
| ¿Qué datos? | ¿Ánimos, diario, mensajes privados, emails, publicaciones anónimas? |
| ¿Cuántas personas? | Número aproximado de cuentas afectadas |
| ¿Desde cuándo? | Fecha en que se abrió el hueco |
| ¿Alguien lo explotó? | Revisar los logs de Supabase (`get_logs`) |
| ¿Hay datos del art. 9? | Los ánimos y el diario **lo son** — sube la gravedad |

### 3. ¿Hay que notificar a la CNPD?

**SÍ, dentro de 72 h**, salvo que sea improbable que suponga un riesgo para las
personas. Con datos de ánimo, diario o mensajes privados de por medio,
**asumí que sí hay que notificar**.

- Formulario: https://www.cnpd.pt/organizacoes/notificacao-de-violacoes/
- Si a las 72 h todavía no sabés todo: **notificá igual** con lo que tengas y
  completá después. El retraso hay que justificarlo.

### 4. ¿Hay que avisar a las personas usuarias? (art. 34)

**SÍ** cuando el riesgo para sus derechos es **alto**: contenido del diario,
ánimos, mensajes privados, o la identidad detrás de publicaciones anónimas.

Se avisa **directamente** (email + aviso dentro de la app), en lenguaje claro:
qué pasó, qué datos, qué estás haciendo, qué pueden hacer ellas, y a quién
escribir (`privacidad-datos@heyvelo.app`).

No hace falta avisar si los datos estaban cifrados de forma que sean
ilegibles, o si ya tomaste medidas que eliminan el riesgo.

### 5. Registrar — obligatorio siempre

**Toda** brecha se anota, se notifique o no. Si no se notificó, hay que dejar
por escrito **por qué**. Archivo sugerido: `LEGAL-registro-brechas.md`, con:

```
Fecha y hora de detección · Cómo se detectó · Qué pasó · Datos afectados ·
Personas afectadas · Medidas de contención · ¿Se notificó a la CNPD? (sí/no
+ motivo) · ¿Se avisó a las personas? (sí/no + motivo) · Medidas para que no
se repita
```

## Datos de contacto — [COMPLETAR]

| | |
|---|---|
| Responsable de gestionar la brecha | **[COMPLETAR: nombre]** |
| Teléfono de contacto | **[COMPLETAR]** |
| ¿Hay DPO designado? | **[COMPLETAR]** — si lo hay, hay que comunicárselo a la CNPD |

## Prevención — lo que ya está hecho y lo que falta

**Hecho:** RLS por fila en las tablas privadas · publicaciones anónimas
realmente anónimas *(29/07)* · 0 policies abiertas de lectura, alteración o
borrado *(30/07)* · endpoints de IA y correo con sesión obligatoria y tope de
uso *(v1597 y v1621)* · borrado de cuenta que borra de verdad.

**Falta:**
- **Rotar la VAPID privada** — estuvo en el repositorio y queda en el historial
- **Verificar los backups** de Supabase y probar una restauración
- Revisar los avisos de seguridad de Supabase **cada vez que se cambie la base**
  (`get_advisors`) — es lo que destapó los huecos del 30/07

---

# Parte 2 · Plazos de conservación

La Política de Privacidad dice hoy "los mínimos exigidos legalmente", que no
significa nada concreto. El RGPD (art. 5.1.e) pide un plazo o, al menos, el
criterio para determinarlo. Propuesta:

| Dato | Plazo propuesto | Por qué |
|---|---|---|
| Perfil y cuenta | Mientras la cuenta esté activa | Ejecución del contrato |
| **Cuenta inactiva** | **[COMPLETAR: sugerido 24 meses]** sin entrar → aviso por email y borrado | Minimización (art. 5.1.c) |
| Ánimos y diario | Hasta que la persona los borre o borre su cuenta | Es su historial; el valor está en conservarlo |
| Publicaciones comunitarias | Íd. | |
| Mensajes privados | Íd. | |
| Momentos | 24 h (ya expiran solos) | Por diseño |
| Muro de la Felicidad | 24 h en el muro; el historial propio queda | Por diseño |
| Pedidos de Sala de Ayuda | 48 h visibles · **[COMPLETAR: ¿borrado a los X días?]** | Hoy quedan indefinidamente |
| Marcas de crisis | **No se conservan** | Decisión del 24/07 (opción 2) |
| Reportes de moderación | **[COMPLETAR: sugerido 12 meses]** desde su resolución | Reincidencia y DSA |
| Suscripciones a push | Hasta desactivarlas o borrar la cuenta | Consentimiento |
| Registros contables (Stripe) | **[COMPLETAR: años según ley portuguesa — habitualmente 10]** | Obligación legal |
| Constancia de aceptación de términos | **[COMPLETAR: sugerido 5 años]** desde la baja | Prueba del consentimiento (art. 7.1) |
| Logs de acceso e IP | **[COMPLETAR: sugerido 12 meses]** | Interés legítimo (seguridad) |
| Contador de uso de IA y correo | 48 h (se borra solo cada noche) | Sólo sirve para el tope de 24 h |
| Estadísticas de uso | Sólo con consentimiento del banner | ePrivacy |

## Cómo aplicarlos

Los tres plazos que hoy **no** se cumplen solos y necesitarían un trabajo
programado en la base (como el que ya limpia el contador de IA cada noche):

1. Cuentas inactivas
2. Pedidos viejos de Sala de Ayuda
3. Reportes de moderación ya resueltos

Los demás se cumplen porque el dato expira solo o porque lo borra la persona.

**Una vez fijados los plazos, hay que copiarlos a la Política de Privacidad**
(modal `privacyOv` en `app-premium.html`) y al Registro de Actividades
(`LEGAL-registro-tratamiento.md`), que hoy los tiene como `[COMPLETAR]`.
