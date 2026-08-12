# Lo que sólo podés hacer vos

Todo lo demás está hecho. Esto queda porque necesita **tus cuentas** o **datos
que sólo vos tenés** — no hay forma de resolverlo desde el código.

Está ordenado por lo que más caro sale dejarlo. Los dos primeros son los únicos
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

## 🟡 3. Aceptar los DPA — 15 minutos

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

## 🟡 4. Datos societarios — 10 minutos

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

## 🟡 5. Terminar la rotación VAPID — 5 minutos

La clave privada de las notificaciones push estuvo en el repositorio, así que
**queda en el historial de git para siempre**. El código para rotarla sin que
nadie pierda sus notificaciones ya está puesto: firma con la vieja y reintenta
con la nueva.

Falta generar el par nuevo y poner la privada como `VAPID_PRIVATE_KEY_NEW` en
GitHub Secrets y en Supabase. El envío de hoy lo confirma:

```
[vapid] rotación: clave nueva todavía no configurada
```

Sin esto la app funciona igual — pero cualquiera con acceso al historial del
repositorio puede enviar notificaciones push en nombre de Velo.

---

## 🟢 6. Decidir los plazos de conservación

Están implementados y **desactivados a propósito**: borrar datos de gente es
una decisión tuya, no técnica. Para ver qué se borraría con cada plazo:

```sql
select * from public.velo_retention_report();
```

Se activan uno por uno en `public.velo_retention_policy` (`enabled = true`).

---

## 🟢 7. Probar la app usándola

Es el único hueco que no se puede tapar desde acá. Todo lo verificado hasta
ahora fue contra la base de datos y renderizando piezas sueltas en un navegador.
Lo que **no** está cubierto: el PWA en iPhone, los flujos completos de punta a
punta, y cualquier cosa que sólo aparezca usándola de verdad.

De hecho, los últimos ocho bugs salieron de que vos abriste la app y miraste.
Ninguna revisión automática los habría encontrado.
