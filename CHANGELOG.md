# Changelog

## 0.1.4 - 2026-10-07

- El release recurrente ejecuta el puente frontend del mismo snapshot inmutable que el bot; una edicion posterior o un checkout local atrasado ya no cambia el codigo de publicacion seleccionado.
- Regresion del runner mensual con frontend y bot, ruta del puente, orden de verificacion y lock compartido, sin ejecutar despliegues reales.

## 0.1.3 - 2026-10-01

- Releases de Galerazo incluyen validacion y deploy condicional de su frontend, dentro del bloqueo y la programacion existentes.
- Fallos o incompatibilidad web impiden marcar el release exitoso; cambios solo web no redeployan el bot.
