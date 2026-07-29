# Procedimiento ante señales de crisis

**Responsable:** HeyVelo · Oporto, Portugal
**Vigente desde:** 24/07/2026
**Documento interno** — se adjunta a la DPIA como evidencia de las medidas adoptadas.

---

## Principio que rige el procedimiento

Velo **no es un servicio de emergencia, de salud ni de intervención en crisis**, y
no dispone de personal para atenderlas. Quienes responden en la comunidad son
usuarios voluntarios sin obligación de hacerlo.

Por eso la respuesta ante una señal de crisis es **automática, inmediata y
autónoma**: la plataforma pone al alcance los recursos de emergencia reales y no
asume ni sugiere ninguna intervención propia.

> **Decisión deliberada:** no se notifica a ninguna persona del equipo. Un aviso a
> un humano genera un deber de actuar que, sin cobertura 24/7, no se puede
> cumplir; y el incumplimiento sería más gravoso que la ausencia del aviso.
> Igualmente, **no se promete acompañamiento**: una promesa incumplida en ese
> contexto puede llevar a la persona a esperar en lugar de llamar a una línea real.

---

## Qué se detecta

1. **Filtro de palabras** (`premium.js:_localCrisisCheck`) — instantáneo, sin red.
   Expresiones de ideación suicida y autolesión.
2. **Clasificador por IA** (`_geminiCrisisCheck`) — devuelve nivel
   alto / medio / bajo, en segundo plano.

Se aplica al publicar en la Sala de Ayuda y en la conversación con la IA.

## Qué ocurre al detectarse

| Nivel | Respuesta automática |
|---|---|
| **Alto** | Se abre de inmediato el directorio SOS y se muestra: *"Por favor contactá ahora una línea de crisis. Velo no puede ayudarte en una emergencia."* |
| **Medio** | Aviso de que el botón SOS está siempre disponible |
| **Palabras clave** | Se abre el directorio SOS y se recuerda que Velo no es un servicio de emergencia |

**En la conversación con la IA:** el sistema tiene instrucción explícita de no
intentar contener a la persona por sí mismo, derivar siempre a las líneas de
ayuda (112 / 135 / 0800-222-1002) e insistir con suavidad en que hable con alguien.

## Directorio SOS

Números de terceros, mostrados por país: **112** (UE), **135** (Argentina),
**024** (España), **0800 0767** (Uruguay), **SNS 24 – 808 24 24 24** (Portugal).
Velo no los opera ni garantiza su disponibilidad.

## Lo que Velo NO hace — y por qué

| No hace | Motivo |
|---|---|
| Avisar a moderadores o al equipo | Generaría un deber de actuar sin capacidad de cumplirlo |
| Contactar a servicios de emergencia por la persona | No hay datos de ubicación ni identidad verificada; sería intervención sin consentimiento |
| Prometer que alguien responderá | La comunidad es voluntaria; no puede garantizarse |
| Bloquear o censurar el mensaje | Impediría que la persona reciba apoyo de la comunidad |

---

## Datos que se registran

**Ninguno específico de la crisis.** Se guarda el pedido que la persona escribió
y publicó voluntariamente en la Sala de Ayuda, nada más.

La detección de señales de crisis **no deja rastro**: no se almacena una marca, un
indicador ni una clasificación de riesgo asociada a la cuenta. Su único efecto es
inmediato y en pantalla — abrir el directorio SOS y mostrar el aviso.

**Decisión adoptada (24/07/2026):** no persistir la marca de urgencia
(*opción 2* de las evaluadas). Hasta esa fecha el pedido se guardaba con
`urgencia: 'urgente'`, lo que equivalía a un registro permanente de que esa
persona había expresado ideación suicida — dato de salud de máxima sensibilidad,
sin plazo de borrado y sin finalidad que lo justificara una vez mostrado el pedido.

**Implementación:**
- El cliente ya no envía `urgencia` al publicar, ni el clasificador de IA la
  escribe en la base.
- El triaje se **recalcula en cada dispositivo al renderizar**, a partir del texto
  que de todos modos está publicado. Los pedidos urgentes se siguen mostrando
  primero: el orden en pantalla no cambia.
- Migración `20260724_drop_help_urgencia.sql` — **borra el histórico ya
  almacenado** y anula el valor por defecto de la columna.

*Principio aplicado:* minimización (art. 5.1.c). Si el dato no es necesario una
vez cumplida su función, no se conserva.

---

## Revisión

- Comprobar cada 6 meses que el detector sigue funcionando (probar con frases de
  prueba en un entorno controlado).
- Verificar anualmente que los números del directorio SOS siguen vigentes.
- Registrar aquí cualquier cambio del procedimiento, con su fecha.

| Fecha | Cambio |
|---|---|
| 24/07/2026 | Versión inicial. Se eliminan las promesas de acompañamiento en Sala de Ayuda, buzón y avisos de crisis. |
