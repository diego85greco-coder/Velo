# Evaluación de Impacto relativa a la Protección de Datos (EIPD / DPIA)
### Art. 35 del Reglamento (UE) 2016/679 · *Avaliação de Impacto sobre a Proteção de Dados (AIPD)*

| | |
|---|---|
| **Tratamiento evaluado** | Velo — red social de ayuda mutua (heyvelo.app) |
| **Responsable del tratamiento** | **[COMPLETAR: razón social, NIPC, domicilio]** |
| **Autoridad de control** | CNPD — Comissão Nacional de Proteção de Dados (Portugal) |
| **Contacto de privacidad** | privacidad-datos@heyvelo.app |
| **Delegado de Protección de Datos** | **[COMPLETAR: designado / no designado + motivo]** |
| **Fecha de esta evaluación** | 30/07/2026 |
| **Versión de la aplicación evaluada** | v1623 |
| **Próxima revisión** | **[COMPLETAR — se sugiere: a los 12 meses, o antes si cambia una función]** |

> **Quién firma esto.** La EIPD **la realiza el responsable del tratamiento**, no
> un abogado (art. 35.2: sólo obliga a *recabar el asesoramiento* del DPO si lo
> hay). No hace falta contratar a nadie para tenerla. Este documento está
> redactado a partir del código real de la aplicación y de verificaciones hechas
> contra la base de datos de producción; el responsable debe revisarlo, decidir
> lo marcado como `[COMPLETAR]`, fecharlo y firmarlo.
>
> **Límite de este documento:** no es asesoramiento jurídico. Se apoya en el
> art. 35 del RGPD y en los criterios del Comité Europeo de Protección de Datos
> (Directrices WP248 rev.01). **No se pudo contrastar con la lista nacional
> portuguesa** — el Regulamento n.º 1/2018 de la CNPD, publicado como PDF
> escaneado, no se pudo leer automáticamente. Antes de dar por cerrada esta
> evaluación **hay que revisarlo**:
> https://www.cnpd.pt/bin/decisoes/regulamentos/regulamento_1_2018.pdf

---

## 1. ¿Es obligatoria esta evaluación?

El art. 35.1 la exige cuando un tratamiento «entrañe un alto riesgo para los
derechos y libertades de las personas físicas». El art. 35.3 lista tres
supuestos automáticos, y el CEPD publicó **nueve criterios**: como regla
práctica, cumplir **dos** ya aconseja hacerla.

Velo cumple **cinco**:

| Criterio del CEPD | ¿Aplica? | Por qué |
|---|---|---|
| Datos sensibles o de naturaleza altamente personal | ✅ | Los registros de ánimo y el diario íntimo revelan información sobre el estado emocional (art. 9). Los mensajes privados y las publicaciones son de naturaleza altamente personal aunque no sean art. 9 |
| Tratamiento a gran escala | ✅ | Aplicación web pública, sin límite de registro |
| Evaluación o puntuación (*scoring*) | ✅ | Resúmenes semanales y mensuales generados con IA a partir del ánimo y la actividad; detección automática de expresiones de crisis; moderación automática de contenido |
| Datos de titulares vulnerables | ⚠️ | Ver el análisis honesto del punto 1.1 |
| Uso innovador o aplicación de nuevas soluciones tecnológicas | ✅ | Modelo generativo de terceros (Google Gemini) aplicado a contenido personal |
| Decisiones automatizadas con efecto jurídico o similar | ❌ | La moderación puede ocultar contenido de forma preventiva, pero **siempre** hay revisión humana a petición. No hay decisiones del art. 22 |
| Observación sistemática | ❌ | No hay seguimiento de ubicación ni vigilancia |
| Cruce de conjuntos de datos | ❌ | No se combinan fuentes externas |
| Impedir el ejercicio de un derecho o el acceso a un servicio | ❌ | No |

**Conclusión: la EIPD es obligatoria.** Se realiza.

### 1.1 Sobre el criterio de «titulares vulnerables» — análisis honesto

Velo **no es un servicio de salud, no ofrece atención sanitaria ni
acompañamiento profesional, y no se dirige a personas vulnerables.** Es una red
social de ayuda mutua entre personas usuarias. Así se presenta en toda la
aplicación y así lo dicen los Términos.

Ahora bien, **este criterio se valora por los hechos del tratamiento, no por
cómo se describe el servicio.** Y los hechos son:

- La aplicación admite personas **desde los 16 años** (menores de edad).
- Existe un **detector de expresiones de crisis** que busca señales de ideación
  suicida y autolesión en lo que la gente escribe (`premium.js`,
  `_localCrisisCheck`).
- Existe un **directorio SOS** con líneas de prevención del suicidio por país.
- El acompañante virtual tiene **instrucción obligatoria de derivar** a esas
  líneas ante señales de riesgo.
- La sección Sala de Ayuda es, por diseño, un lugar donde alguien pide ayuda.

Que existan esas funciones significa que **el responsable previó que algunas
personas usuarias atravesarían momentos difíciles**. Negarlo en la evaluación
sería incoherente con el propio producto.

**Declararlo es lo favorable.** Las medidas ya implementadas son evidencia de
diligencia, no una admisión de riesgo. Se marca el criterio como aplicable.

---

## 2. Descripción sistemática del tratamiento (art. 35.7.a)

### 2.1 Qué es Velo

Una red social de ayuda mutua entre personas usuarias. Permite:

| Función | Qué hace la persona |
|---|---|
| **Registro de ánimo** | Marca cómo se siente cada día, con una nota opcional |
| **Diario personal** | Escribe entradas privadas, con audio e imagen. **Nadie más las ve** |
| **Bitácora** | Publica textos tipo foro (apoyo, superación, debate), con opción anónima |
| **Sala de Ayuda** | Publica un pedido de acompañamiento, con opción anónima; otra persona usuaria responde |
| **Muro de la Felicidad** | Comparte un momento bueno, 24 h, con opción anónima |
| **Al Mar** | Envía un mensaje anónimo a la comunidad |
| **Círculos** | Chats de grupo temáticos |
| **Mensajes directos** | Chat individual, con notas de voz e imágenes |
| **Vibes / Momentos** | Contenido efímero |
| **Acompañante IA** | Conversación con un chatbot explícitamente **no clínico** |
| **Resúmenes** | Lectura semanal/mensual de la propia actividad, generada con IA |
| **SOS** | Directorio de líneas de emergencia. **Velo no interviene ni contacta a nadie** |

### 2.2 Datos tratados y base jurídica

| Categoría | Datos | Base jurídica |
|---|---|---|
| Cuenta | Nombre, @usuario, email, contraseña (hash), avatar | Contrato (6.1.b) |
| **Ánimo y diario** | **Emoji y etiqueta de ánimo, notas, texto del diario, audio, imágenes** | **Consentimiento explícito (9.2.a)**, otorgado al usar la función |
| Contenido comunitario | Textos, imágenes, audios publicados | Contrato + consentimiento al publicar |
| Mensajería | Contenido, remitente, destinatario, fecha | Contrato (6.1.b) |
| Notificaciones push | Endpoint del navegador, claves, zona horaria | Consentimiento, revocable |
| Pagos | Email, identificadores de Stripe, estado del plan. **No se reciben datos de tarjeta** | Contrato + obligación legal |
| Moderación | Contenido analizado, marcas, reportes | Interés legítimo (6.1.f) — **[COMPLETAR: test de ponderación por escrito]** |
| Técnicos | IP, logs, constancia de aceptación de términos | Interés legítimo (seguridad) |
| Estadísticas de uso | Métricas agregadas | Consentimiento (banner de cookies) |

**Punto de atención jurídica:** la base para los datos de ánimo es el
consentimiento explícito del art. 9.2.a. Eso exige que sea **libre, informado,
específico y revocable**, y que el servicio siga siendo utilizable si no se
otorga. Hoy se cumple: registrar el ánimo es opcional y el resto de la app
funciona sin ello. **[COMPLETAR: confirmar este criterio]**

### 2.3 Destinatarios y transferencias

| Encargado | Función | Ubicación | DPA |
|---|---|---|---|
| Supabase | Base de datos, autenticación, almacenamiento | UE (eu-west-1) | ⬜ |
| Vercel | Alojamiento, funciones, analítica | EE. UU. | ⬜ |
| Google (Gemini) | Chatbot, moderación, resúmenes | EE. UU. | ⬜ ⚠️ |
| Cloudinary | Imágenes y vídeo | EE. UU./UE | ⬜ |
| Resend | Correos transaccionales | EE. UU. | ⬜ |
| Stripe | Pagos (responsable independiente) | EE. UU./UE | ⬜ |

> ⚠️ **Estado al 07/08/2026 — verificado a medias.** El responsable tiene una
> cuenta de facturación activa con tarjeta real, y el proyecto **Velo app2**
> figura como **«Pagado 1 · Prepago»**: en ese nivel Google **no** usa el
> contenido para entrenar modelos.
>
> **Pero la cuenta tiene varias claves de API, y no todas están en ese
> proyecto.** Al menos una (`…U7zM`, en *Default Gemini Project*) figura en
> **nivel gratuito**. Cuál de ellas está configurada en la variable
> `GEMINI_API_KEY` de Vercel y de GitHub **no se ha podido comprobar** — el
> conector de Vercel no expone las variables de entorno.
>
> **Riesgo:** si la clave en uso fuese la del proyecto gratuito, todo lo enviado
> hasta hoy —conversaciones con el acompañante, datos de ánimo de los resúmenes,
> contenido moderado— habría podido usarse para entrenar modelos, pese a existir
> un proyecto de pago.
>
> **Acción:** fijar explícitamente la clave del proyecto **Velo app2** (`…TtNk`)
> en las dos variables de entorno, en lugar de averiguar cuál está puesta. Así
> deja de depender de cuál se configuró en su momento.
>
> **Aviso operativo:** el crédito es **prepago (9,35 € al 07/08)** y la recarga
> automática está **desactivada**. Al agotarse, la API deja de responder y con
> ella el acompañante, la moderación de cada publicación, el clasificador de
> crisis y los resúmenes — en silencio. Conviene activar la recarga antes de
> abrir al público.

**Transferencias fuera de la UE:** amparadas en Cláusulas Contractuales Tipo y/o
el Marco de Privacidad de Datos UE-EE. UU. **[COMPLETAR: confirmar el mecanismo
concreto de cada proveedor y archivar la constancia]**

---

## 3. Necesidad y proporcionalidad (art. 35.7.b)

| Pregunta | Respuesta |
|---|---|
| ¿Cada dato es necesario? | Sí. No se piden teléfono, dirección, fecha de nacimiento ni ubicación. La edad se confirma con una casilla, sin almacenar la fecha |
| ¿Se minimiza? | Sí, y se corrigió en la práctica: el 24/07 se **dejó de conservar la marca de urgencia** en Sala de Ayuda, que registraba de forma permanente quién había expresado ideación suicida. El triaje se recalcula en el cliente desde el texto ya publicado |
| ¿Se limita el plazo? | Parcialmente. Ver `LEGAL-brechas-y-conservacion.md`. **[COMPLETAR: fijar los plazos]** |
| ¿Hay información clara? | Sí: Términos y Política de Privacidad en la app, con transparencia de IA (Reglamento UE 2024/1689) |
| ¿Se pueden ejercer los derechos? | **Acceso y portabilidad** (art. 15 y 20): exportación en JSON desde la app. **Supresión** (art. 17): borrado de cuenta que elimina 43 tablas + perfil + credenciales. **Oposición y revocación**: desactivable por función |
| ¿Hay decisiones automatizadas del art. 22? | No. La moderación puede ocultar contenido de forma preventiva, con revisión humana a petición |

---

## 4. Riesgos y medidas (art. 35.7.c y 35.7.d)

Escala: probabilidad × gravedad → **riesgo residual** tras las medidas.

### 4.1 · Acceso indebido al diario o a los registros de ánimo
**Gravedad: muy alta.** Es lo más íntimo que guarda la aplicación.

| | |
|---|---|
| **Medidas** | Aislamiento por fila (RLS) verificado contra producción. El 24/07 se cerró un fallo por el que, con la clave pública que viaja en el navegador, **cualquiera podía borrar el diario y el historial de ánimo de todas las personas** sin siquiera iniciar sesión. El 30/07 se cerraron las 15 tablas que quedaban con permisos abiertos |
| **Verificación** | Simulando una persona usuaria cualquiera: 0 filas ajenas visibles; moderación sí las ve |
| **Riesgo residual** | **Bajo** |
| **Pendiente** | Revisar los avisos de seguridad del proveedor **cada vez que se cambie la base** — es lo que destapó los fallos del 30/07 |

### 4.2 · De-anonimización de publicaciones anónimas
**Gravedad: muy alta.** La persona publicó creyendo estar protegida. En Sala de
Ayuda significa poder ligar a alguien con nombre y apellido a lo que escribió
pidiendo ayuda.

| | |
|---|---|
| **Estado hasta el 29/07** | ❌ Cualquier persona con cuenta podía pedir la tabla directamente (`GET /rest/v1/help_posts?select=user_id,preview`) y obtener el autor real de cada publicación anónima. Además, **comentar cualquier publicación devolvía el identificador de su autor** |
| **Medidas (29/07)** | Las publicaciones anónimas ajenas dejaron de ser legibles en la tabla de origen, incluido por el canal en tiempo real. El aviso al autor de un comentario lo resuelve el servidor sin devolver su identificador |
| **Verificación** | 17 publicaciones anónimas (12 Sala de Ayuda, 3 Muro, 2 Bitácora) pasaron de rastreables a 0. El feed sigue completo; el autor sigue viendo las suyas |
| **Riesgo residual** | **Bajo** |
| **Nota** | El anonimato es **frente a otras personas usuarias**, no frente al responsable: hace falta conservar la autoría para moderar y para poder borrar la cuenta. Está declarado en la Política de Privacidad |

### 4.3 · Que el contenido enviado a la IA se use para entrenar modelos
**Gravedad: muy alta.**

| | |
|---|---|
| **Medidas** | Los endpoints de IA exigen sesión (v1594) y tienen tope de uso en el servidor (v1621). Se eliminó Groq como proveedor de respaldo (v1617): hasta entonces, cuando Gemini fallaba, los mensajes salían hacia un encargado no declarado y sin contrato. **Minimización (v1624):** los resúmenes enviaban el nombre de pila junto a los datos de ánimo — salud emocional atada a una persona identificable— y encima el propio prompt pedía no usarlo. Se dejó de enviar |
| **Riesgo residual** | ⚠️ **ALTO — sin resolver.** Depende enteramente de que el nivel de Gemini no sea el gratuito, cosa **no verificada** |
| **Acción** | Verificar el nivel y aceptar el DPA de Google **antes de abrir al público** |

### 4.4 · Que una persona exprese ideación suicida o autolesión
**Gravedad: muy alta.**

| | |
|---|---|
| **Medidas** | Detector de expresiones de crisis; directorio SOS con líneas por país (135 AR · 024 ES · 0800 0767 UY · 112 UE); derivación obligatoria del acompañante virtual ante señales de riesgo; el prompt se corrigió el 24/07 para eliminar todo encuadre clínico |
| **Minimización** | **No se conserva ningún registro** de que una persona atravesó una crisis (decisión del 24/07). El historial previo se borró |
| **Procedimiento** | `LEGAL-procedimiento-crisis.md` |
| **Riesgo residual** | **Medio.** Velo **no interviene**: ofrece recursos y no promete asistencia. Esa limitación está declarada en los Términos |
| **Pendiente** | Comprobar periódicamente que el detector y la derivación siguen funcionando |

### 4.5 · Que la IA responda mal a alguien que está mal
**Gravedad: alta.**

| | |
|---|---|
| **Medidas** | El prompt del acompañante se reescribió el 24/07. Antes se presentaba como «entrenado en técnicas de psicología clínica y humanista», con «técnicas rogerianas» y «experiencia en depresión, duelo y trauma». Ahora declara explícitamente que **no** es terapeuta ni profesional de la salud, no tiene formación clínica y no aplica ninguna técnica. Tiene prohibido diagnosticar y etiquetar |
| **Transparencia** | Términos §9, conforme al Reglamento UE 2024/1689 |
| **Riesgo residual** | **Medio** |
| **Pendiente** | Pruebas periódicas del comportamiento ante mensajes de crisis |

### 4.6 · Fuga a través de un proveedor
| | |
|---|---|
| **Medidas** | Proveedores con certificaciones estándar; cifrado en tránsito y en reposo; base de datos en la UE |
| **Riesgo residual** | **Medio** |
| **Pendiente** | Los 6 DPA firmados |

### 4.7 · Contenido dañino entre personas usuarias
| | |
|---|---|
| **Medidas** | Moderación automática por IA + reportes; bloqueo entre usuarias (cerrado el 30/07 el fallo que permitía leer y quitar los bloqueos ajenos); ocultación preventiva del contenido reportado |
| **Confidencialidad de quien reporta** | Cerrado el 30/07: hasta entonces cualquiera podía ver **quién había reportado a quién**, material para represalias |
| **Riesgo residual** | **Medio** |
| **Pendiente** | Circuito de respuesta y apelación (obligación DSA) |

### 4.8 · Personas menores de 16 años
| | |
|---|---|
| **Medidas** | Casilla obligatoria de 16+ con constancia (`age_confirmed_at`), desde el 24/07 |
| **Riesgo residual** | **Medio.** Es una declaración, no una verificación |
| **Justificación** | Verificar la edad de verdad exigiría documento de identidad o pasarela biométrica: **más invasivo que el riesgo que evita**, y contrario a la minimización. Es la práctica habitual en servicios equivalentes |

### 4.9 · Pérdida de datos
| | |
|---|---|
| **Estado** | ⚠️ El proyecto está en el **plan gratuito del proveedor, que NO incluye copias de seguridad** |
| **Medidas (30/07)** | Copia nocturna de las 54 tablas, conservada 30 días. Probada: 1.135 filas, 54/54 tablas |
| **Riesgo residual** | **Medio.** La copia **no incluye** los archivos de audio e imagen ni las credenciales de acceso |
| **Pendiente** | Probar una restauración completa; evaluar el plan de pago |

### 4.10 · Brecha de seguridad
| | |
|---|---|
| **Medidas** | Procedimiento escrito con los 5 pasos, plazo de 72 h y criterios de notificación: `LEGAL-brechas-y-conservacion.md` |
| **Riesgo residual** | **Bajo** |
| **Pendiente** | Designar por escrito a quién avisar |
| **Rotación VAPID** | La clave privada de notificaciones estaba **en texto plano en el código y en el historial de un repositorio público**. Comprobado el 30/07 que **no es explotable hoy**: las suscripciones push no son legibles ni con sesión (la tabla `profiles` no es accesible y la vista no expone la columna), y sin ellas la clave no sirve. Aun así se rota: par nuevo generado y ambos extremos preparados para firmar con las dos claves a la vez, de modo que el cambio no corte las notificaciones de nadie (v1624) |

---

## 5. Resumen del riesgo residual

| Riesgo | Residual |
|---|---|
| Acceso indebido al diario y a los ánimos | 🟢 Bajo |
| De-anonimización | 🟢 Bajo |
| Brecha de seguridad | 🟢 Bajo |
| Crisis de una persona usuaria | 🟡 Medio |
| Respuesta inadecuada de la IA | 🟡 Medio |
| Fuga por proveedor | 🟡 Medio |
| Contenido dañino | 🟡 Medio |
| Menores de 16 | 🟡 Medio |
| Pérdida de datos | 🟡 Medio |
| **Entrenamiento de modelos con el contenido** | 🔴 **Alto — sin resolver** |

---

## 6. Conclusión y decisión del responsable

**[COMPLETAR — marcar una]**

- ⬜ **El tratamiento puede iniciarse.** Los riesgos quedan en un nivel aceptable
  con las medidas descritas. *(Requiere haber cerrado antes el punto 4.3.)*
- ⬜ **Puede iniciarse con condiciones:** ____________________
- ⬜ **Procede consulta previa a la CNPD** (art. 36), por subsistir un riesgo alto
  que no se ha podido mitigar.

> **Criterio técnico de quien redactó este documento:** con el riesgo 4.3
> (entrenamiento de modelos) abierto, **no debería abrirse al público**. Se
> resuelve verificando el nivel de servicio de Gemini y aceptando su DPA —
> gratis, y de minutos. Cerrado ese punto, no queda ningún riesgo residual alto,
> y **no se aprecia motivo para una consulta previa a la CNPD**.
>
> Esta es una lectura técnica, no jurídica. La decisión y su firma son del
> responsable.

**Fecha:** ______________  **Firma del responsable:** ______________________

---

## Anexos

1. `LEGAL-registro-tratamiento.md` — Registro de actividades (art. 30)
2. `LEGAL-brechas-y-conservacion.md` — Procedimiento de brechas y plazos
3. `LEGAL-procedimiento-crisis.md` — Qué se hace tras detectar una crisis
4. `LEGAL-dpa-y-dpia.md` — Dónde aceptar cada DPA
5. `LANZAMIENTO-CHECKLIST.md` — Estado técnico
6. Textos de Términos y Política de Privacidad (modales `termsOv` y `privacyOv`)
7. Migraciones de seguridad de julio de 2026, en `supabase/migrations/`, cada una
   con la descripción del fallo, la corrección y su verificación
