# Puntos 4 y 5: DPA con proveedores y DPIA

Estos dos **no los puedo completar yo**: el 4 requiere entrar a tus cuentas y
aceptar contratos en tu nombre; el 5 es una evaluación legal que firma el
responsable, no una tarea técnica. Acá queda todo lo preparado para que sea
rápido.

---

# 4. DPA con los proveedores (6)

Un DPA (*Data Processing Agreement*) es el contrato del art. 28 RGPD que te
protege: fija que el proveedor sólo trata los datos siguiendo tus instrucciones.
**Sin él, la responsabilidad por lo que haga el proveedor recae en vos.**

Casi todos se aceptan desde el panel de la cuenta en unos minutos.

| # | Proveedor | Dónde se acepta | Estado |
|---|---|---|---|
| 1 | **Supabase** | Dashboard → Organization → Legal/Compliance → aceptar DPA | ⬜ |
| 2 | **Vercel** | Dashboard → Team Settings → Legal → DPA | ⬜ |
| 3 | **Stripe** | Dashboard → Settings → Legal / Compliance | ⬜ |
| 4 | **Google (Gemini API)** | Consola de Google Cloud → Terms → Data Processing Addendum | ⬜ |
| 5 | **Cloudinary** | Account → Security & Compliance → DPA | ⬜ |
| 6 | **Resend** | Settings → Legal → DPA | ⬜ |

**Al aceptar cada uno, guardá el PDF o la captura con la fecha** en una carpeta
`legal/dpa/`. Esa constancia es lo que se muestra en una inspección.

**Dos cosas para revisar en cada DPA:**
- Que liste los **subencargados** (a quién subcontrata el proveedor).
- Qué **mecanismo de transferencia** usa para EE. UU. (Cláusulas Contractuales
  Tipo o Marco de Privacidad UE-EE. UU.). Ese dato va al registro de tratamiento.

---

# 5. Evaluación de Impacto (DPIA)

## Por qué es muy probable que aplique

El art. 35 la exige cuando hay riesgo alto. Velo activa **tres** de los criterios
que las autoridades europeas usan para decidirlo — y con dos ya suele bastar:

1. **Datos de categoría especial:** los estados de ánimo revelan información sobre
   salud emocional (art. 9), aunque Velo no sea un servicio sanitario.
2. **Evaluación o puntuación:** los resúmenes semanales y mensuales analizan la
   actividad y producen una lectura del período, con IA de por medio.
3. **Posible presencia de personas en situación de vulnerabilidad:**
   Velo **no** está dirigida a personas vulnerables, **no** ofrece asistencia,
   acompañamiento profesional ni servicio de salud de ningún tipo, y **no** se
   presenta como tal. No obstante, al ser una red social abierta donde las
   personas comparten experiencias personales, es previsible que algunas
   atraviesen momentos difíciles. Por eso la plataforma incorpora, como medida
   preventiva propia, detección de señales de crisis y derivación automática a
   líneas de ayuda operadas por terceros.
   El servicio admite personas desde los 16 años.

   > **Nota para la evaluación:** este criterio se valora por los hechos del
   > tratamiento, no por la descripción comercial del servicio. Declararlo y
   > documentar las medidas ya adoptadas es más favorable que omitirlo: las
   > funciones de detección y derivación son evidencia de diligencia.

Se suma que el tratamiento es **a escala** (una app pública) e implica
**transferencias fuera de la UE**.

## Qué tiene que contener (art. 35.7)

1. **Descripción del tratamiento** y sus finalidades
   → Ya está en `LEGAL-registro-tratamiento.md`. Se puede adjuntar.
2. **Necesidad y proporcionalidad**: ¿hace falta cada dato para lo que se ofrece?
3. **Riesgos para los derechos y libertades** de las personas
4. **Medidas para mitigarlos**

## Riesgos concretos de Velo (borrador para el abogado)

| Riesgo | Impacto | Mitigación actual | Falta |
|---|---|---|---|
| Acceso indebido al diario o a los ánimos | Muy alto — información íntima | RLS por fila; cerrado el 24/07 un hueco que permitía borrado masivo | Auditoría periódica de políticas |
| **De-anonimización** de publicaciones anónimas | Alto — la persona creyó estar protegida | Vistas que enmascaran la identidad en la app | ⚠️ Un usuario logueado aún puede leer la tabla cruda en Sala de Ayuda, Muro y Bitácora |
| Fuga por proveedor externo | Alto | Proveedores con certificaciones | DPA firmados (punto 4) |
| Contenido dañino entre usuarios | Alto — daño emocional real | Moderación por IA + reportes | Circuito de respuesta y apelación |
| La IA responde mal a alguien en crisis | Muy alto | Prompt corregido el 24/07: sin encuadre clínico y con derivación obligatoria a líneas de ayuda | Pruebas periódicas del comportamiento en crisis |
| Una persona expresa ideación suicida o autolesión en la plataforma | Muy alto | **Medidas ya implementadas:** detector de expresiones de crisis (`premium.js:12285`); clasificador de urgencia por IA; directorio SOS con líneas de prevención por país (135 AR, 024 ES, 0800 0767 UY, 112 UE); derivación obligatoria de la IA ante señales de riesgo | Registrar qué se hace tras la detección y con qué plazo; revisar periódicamente que el detector siga funcionando |
| Menores accediendo al servicio | Medio | Casilla de 16+ desde el 24/07, con constancia (`age_confirmed_at`) | Sólo es una declaración, no verificación |
| Pérdida de datos | Medio | Backups del proveedor | Verificar que estén activos y probar una restauración |

## Decisión

**[COMPLETAR con el abogado]** — Si se concluye que la DPIA **no** es necesaria,
hay que dejar por escrito el razonamiento y la fecha: la ausencia de DPIA también
hay que poder justificarla.

Si la conclusión es que hay riesgo alto que no se puede mitigar, corresponde
**consulta previa a la CNPD** antes de lanzar (art. 36).

---

## Lo que conviene llevarle al abogado

1. Este documento
2. `LEGAL-registro-tratamiento.md`
3. `LANZAMIENTO-CHECKLIST.md`
4. Los textos de Términos y Privacidad (están en la app, modales `termsOv` y `privacyOv`)

Con eso tiene el panorama técnico completo y sólo necesita aportar el criterio
jurídico.
