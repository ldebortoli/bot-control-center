# Changelog

## 0.1.6 - 2026-10-20

- Galerazo admite VPS por SSH en el mismo flujo de release, con transferencia directa de imágenes, deploy, rollback, credenciales y verificación del frontend.
- El preflight comprueba OpenSSH y configuración privada para VPS; las pantallas identifican el destino Contabo. Se conserva el adaptador GCE para configuraciones existentes.
- Next.js y su configuración ESLint se actualizan a 16.4.2 para corregir las alertas de seguridad detectadas durante la validación.

## 0.1.5 - 2026-10-07

- Actualizados Sharp a 0.35.5 y source-map-js a 1.2.2 para resolver las alertas de seguridad del arbol de dependencias, conservando el control de auditoria de produccion.
- Pruebas locales de procesamiento de imagenes y rechazo de mapas de codigo invalidos verifican la compatibilidad de los parches.

## 0.1.4 - 2026-10-07

- El release recurrente ejecuta el puente frontend del mismo snapshot inmutable que el bot; una edicion posterior o un checkout local atrasado ya no cambia el codigo de publicacion seleccionado.
- Regresion del runner mensual con frontend y bot, ruta del puente, orden de verificacion y lock compartido, sin ejecutar despliegues reales.

## 0.1.3 - 2026-10-01

- Releases de Galerazo incluyen validacion y deploy condicional de su frontend, dentro del bloqueo y la programacion existentes.
- Fallos o incompatibilidad web impiden marcar el release exitoso; cambios solo web no redeployan el bot.
