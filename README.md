# Velo

Aplicación web (PWA) de salud mental en español rioplatense. Gente que la está
pasando mal escribe cómo se siente, pide ayuda a otras personas, lleva un
diario, registra su ánimo y habla con un acompañante de IA.

**heyvelo.app** — en prueba piloto, sin lanzar.

## Si venís a trabajar en esto

Leé **[`TRASPASO.md`](TRASPASO.md) primero.** Está escrito para que alguien
—persona o IA— pueda tomar el control sin romper nada: qué es el proyecto, el
ritual de despliegue (que si se hace mal deja la app en bucle de recargas para
todo el mundo), las lecciones de seguridad que más caras salieron, cómo funciona
la red de crisis y qué queda pendiente.

| Archivo | Qué tiene |
|---|---|
| [`MIGRACION-A-CHATGPT.md`](MIGRACION-A-CHATGPT.md) | **todo en un solo archivo**, para dárselo entero a otra IA |
| [`TRASPASO.md`](TRASPASO.md) | la puerta de entrada — leer primero |
| [`HANDOVER.md`](HANDOVER.md) | el documento largo: arquitectura, historial, 14 lecciones |
| [`PENDIENTE-DEL-TITULAR.md`](PENDIENTE-DEL-TITULAR.md) | lo que sólo puede hacer el titular |
| [`LANZAMIENTO-CHECKLIST.md`](LANZAMIENTO-CHECKLIST.md) | qué falta para lanzar |
| `LEGAL-*.md` | RGPD: registro de tratamiento, DPIA, DPA, brechas, crisis |

## Pruebas

```bash
for t in test/*.test.js; do node "$t" || echo "FALLA $t"; done
```
