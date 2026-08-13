# Lo que sólo podés hacer vos

Todo lo demás está hecho. Esto queda porque necesita **tus cuentas** o **datos
que sólo vos tenés** — no hay forma de resolverlo desde el código.

Está ordenado por lo que más caro sale dejarlo. Los tres primeros son los
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

## 🔴 3. Terminar el cambio de la clave de notificaciones — 5 minutos

**Sube de amarillo a rojo (13/08).** Comprobado hoy: el repositorio es público
(`"visibility": "public"`) y la clave privada vieja sigue siendo legible en el
commit `91b34d3`. Git no olvida lo que se borra.

Con esa clave, cualquiera puede firmar una notificación que el teléfono muestra
**como si fuera de Velo**. En una app de salud mental eso no es spam: es alguien
escribiéndole a una persona vulnerable con nuestra cara. Es lo más serio que
queda abierto en todo el proyecto.

Toda la maquinaria está hecha y probada. El servidor firma con las dos claves
durante la transición, y la app le borra la suscripción vieja a cada persona y
le crea una nueva sola al abrirse, sin pedirle nada. Falta un paso, y es tuyo
porque toca los secretos:

```
npx web-push generate-vapid-keys
```

1. La **privada** → GitHub → Settings → Secrets → Actions → `VAPID_PRIVATE_KEY_NEW`
2. La **pública** → decímela y la pongo en `premium.js` (la pública es pública,
   se puede pegar por acá sin problema; **la privada no me la mandes**)

**En ese orden.** Si cambia primero la constante de la app, el servidor no puede
firmar lo que el navegador exige y las notificaciones dejan de llegar. Para que
eso no pase en silencio, `send-push.js` ahora se pone en rojo si detecta a
alguien con la clave nueva y sin el secreto puesto.

---

## 🟡 4. Aceptar los DPA — 15 minutos

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

## 🟡 5. Datos societarios — 10 minutos

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

## 🟡 6. ¿Guardamos las contraseñas en las copias? — decisión de 1 minuto

Al probar una restauración de verdad por primera vez (13/08) apareció que las
copias no incluían la lista de cuentas. Ya se arregló: ahora guardan id, correo
y fechas, y con eso los ánimos y los diarios vuelven enlazados a su dueño.

Lo que **no** se guarda es `encrypted_password`. Sin esas contraseñas, en una
restauración cada persona tendría que volver a entrar con su correo (sus datos
siguen ahí y se reenlazan solos por el id).

Guardar los hashes haría la restauración transparente, pero mete material de
credenciales en un artefacto de GitHub. Es una decisión tuya, no algo que se
hace de oficio. **Si no hacés nada, se queda como está**, que es la opción
prudente.

---

## 🟡 7. El interruptor de contraseñas filtradas — 1 minuto

Supabase → Authentication → Passwords → activar la comprobación contra
HaveIBeenPwned. Rechaza contraseñas que ya aparecieron en filtraciones
conocidas. Hoy está apagado.

---

## 🟢 8. Decidir los plazos de conservación

Están implementados y **desactivados a propósito**: borrar datos de gente es
una decisión tuya, no técnica. Para ver qué se borraría con cada plazo:

```sql
select * from public.velo_retention_report();
```

Se activan uno por uno en `public.velo_retention_policy` (`enabled = true`).

---

## 🟢 9. Probar la app usándola

Es el único hueco que no se puede tapar desde acá. Todo lo verificado hasta
ahora fue contra la base de datos y renderizando piezas sueltas en un navegador.
Lo que **no** está cubierto: el PWA en iPhone, los flujos completos de punta a
punta, y cualquier cosa que sólo aparezca usándola de verdad.

De hecho, los últimos ocho bugs salieron de que vos abriste la app y miraste.
Ninguna revisión automática los habría encontrado.
