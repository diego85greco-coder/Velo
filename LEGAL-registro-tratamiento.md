# Registro de Actividades de Tratamiento (art. 30 RGPD)

**Responsable:** HeyVelo · Oporto, Portugal · privacidad-datos@heyvelo.app
**Última revisión:** 24/07/2026
**Documento INTERNO** — no se publica; se presenta si lo requiere la CNPD.

> Borrador técnico redactado a partir del código de la aplicación. Los campos
> marcados **[COMPLETAR]** dependen de datos societarios o de decisiones del
> responsable, y todo el documento debería validarlo un abogado.

**Datos del responsable — [COMPLETAR]:** razón social, NIF/NIPC, domicilio fiscal
y representante legal. ¿Hay Delegado de Protección de Datos (DPO)? Con datos de
categoría especial a escala, conviene evaluarlo (art. 37).

---

## 1. Cuentas de usuario

| | |
|---|---|
| **Finalidad** | Crear y gestionar la cuenta, autenticar el acceso |
| **Categorías de interesados** | Personas usuarias registradas (16+) |
| **Datos** | Nombre, @usuario, email, contraseña (hash), avatar, fecha de alta |
| **Base legal** | Ejecución del contrato (art. 6.1.b) |
| **Conservación** | Mientras la cuenta esté activa. Al borrarla, eliminación completa |
| **Dónde** | Supabase (`profiles`, `auth.users`) — UE |

## 2. Registro de estados de ánimo y diario personal

| | |
|---|---|
| **Finalidad** | Que la persona registre y consulte su historial; generar estadísticas y resúmenes propios |
| **Datos** | Emoji/etiqueta de ánimo por día, notas, texto del diario, audios e imágenes adjuntas |
| **Categoría** | ⚠️ **CATEGORÍA ESPECIAL** — datos sobre salud emocional (art. 9) |
| **Base legal** | **Consentimiento explícito** (art. 9.2.a), otorgado al usar la función |
| **Conservación** | Hasta que la persona los borre o elimine su cuenta |
| **Dónde** | Supabase (`mood_entries`, `diary_entries`) — UE |
| **Medidas** | Acceso restringido por RLS a nivel de fila: sólo la propia cuenta puede leerlos |

## 3. Contenido comunitario

| | |
|---|---|
| **Finalidad** | Publicar y mostrar contenido entre usuarios (ayuda mutua) |
| **Datos** | Texto, imágenes y audios de Bitácora, Muro, Al Mar, Sala de Ayuda, Círculos, Vibes, Pregunta del Día |
| **Base legal** | Ejecución del contrato + consentimiento al publicar |
| **Observación** | Puede contener datos de categoría especial aportados voluntariamente por la persona al relatar su situación |
| **Conservación** | Hasta que se borre el contenido o la cuenta |
| **Dónde** | Supabase (UE); imágenes/vídeo en Cloudinary |

## 4. Mensajería privada

| | |
|---|---|
| **Finalidad** | Entregar mensajes directos, de acompañamiento y de círculos |
| **Datos** | Contenido del mensaje, remitente, destinatario, fecha; notas de voz e imágenes |
| **Base legal** | Ejecución del contrato |
| **Conservación** | Hasta que se borre la conversación o la cuenta |
| **Dónde** | Supabase (`direct_messages`, `circle_messages`); audios en Storage |

## 5. Notificaciones push

| | |
|---|---|
| **Finalidad** | Avisar de mensajes nuevos y recordatorios |
| **Datos** | Endpoint de suscripción del navegador, claves de cifrado, zona horaria |
| **Base legal** | Consentimiento (revocable desde la app) |
| **Conservación** | Hasta que se desactiven o se borre la cuenta |

## 6. Pagos (Velo Plus y donaciones)

| | |
|---|---|
| **Finalidad** | Cobrar la suscripción y gestionar donaciones |
| **Datos** | Email, identificador de cliente y suscripción, estado del plan. **No se reciben datos de tarjeta** |
| **Base legal** | Ejecución del contrato + obligación legal (contable/fiscal) |
| **Conservación** | Los registros contables, el plazo fiscal aplicable — **[COMPLETAR: años según ley portuguesa]** |
| **Dónde** | Stripe (responsable independiente para el pago) |

## 7. Moderación y seguridad

| | |
|---|---|
| **Finalidad** | Detectar contenido nocivo, atender reportes, prevenir abusos |
| **Datos** | Contenido analizado, marcas de moderación, autor, reportes recibidos |
| **Base legal** | Interés legítimo (art. 6.1.f) — comunidad segura. **[COMPLETAR: test de ponderación por escrito]** |
| **Conservación** | **[COMPLETAR: definir plazo]** |
| **Automatización** | Análisis por IA; puede ocultar contenido de forma preventiva. Se ofrece revisión humana a petición |

## 8. Resúmenes generados por IA

| | |
|---|---|
| **Finalidad** | Elaborar el resumen semanal/mensual a partir de la actividad propia |
| **Datos enviados** | Ánimos del período, conteos de actividad, nombre de pila |
| **Base legal** | Consentimiento (parte de la función de registro de ánimos) |
| **Encargado** | Google (Gemini). No se emplean para entrenar modelos |
| **Observación** | No es valoración clínica ni decisión automatizada del art. 22 |

## 9. Datos técnicos y estadísticas de uso

| | |
|---|---|
| **Finalidad** | Seguridad, diagnóstico de errores y mejora del servicio |
| **Datos** | IP, logs de acceso, marca de aceptación de términos; estadísticas de uso agregadas |
| **Base legal** | Interés legítimo (seguridad) / **Consentimiento** (estadísticas — sólo si acepta el banner) |
| **Conservación** | **[COMPLETAR: definir — sugerido 12 meses para logs]** |

---

## Encargados del tratamiento

| Proveedor | Función | Ubicación | DPA firmado |
|---|---|---|---|
| Supabase | Base de datos, auth, storage | UE | ⬜ **[PENDIENTE]** |
| Vercel | Hosting, funciones, analítica | EE. UU. | ⬜ **[PENDIENTE]** |
| Stripe | Pagos | EE. UU./UE | ⬜ **[PENDIENTE]** |
| Google (Gemini) | IA: chatbot, moderación de imágenes, resúmenes | EE. UU. | ⬜ **[PENDIENTE]** |
| Groq | IA: moderación de texto | EE. UU. | ⬜ **[PENDIENTE]** |
| Cloudinary | Imágenes y vídeo | EE. UU./UE | ⬜ **[PENDIENTE]** |
| Resend | Correos transaccionales | EE. UU. | ⬜ **[PENDIENTE]** |

**Transferencias internacionales:** amparadas en Cláusulas Contractuales Tipo y/o
el Marco de Privacidad de Datos UE-EE. UU. **[COMPLETAR: confirmar el mecanismo
concreto de cada proveedor y archivar la constancia]**

---

## Medidas de seguridad aplicadas

- Cifrado en tránsito (HTTPS) y en reposo (proveedor)
- Aislamiento por usuario mediante RLS a nivel de fila en las tablas privadas
- Autenticación con contraseña *hasheada*; sesiones con token
- Endpoints de IA y de correo restringidos a usuarios autenticados
- Enmascaramiento de identidad en publicaciones anónimas mediante vistas
- Borrado de cuenta que elimina el contenido en todas las tablas

**Pendientes conocidos** (ver `LANZAMIENTO-CHECKLIST.md`): límites de uso por
usuario en los endpoints de IA/correo, y cierre de la de-anonimización en Sala de
Ayuda, Muro y Bitácora.
