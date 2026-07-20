# Session handoff

## Objetivo general

Mantener un dashboard local multi-bot y conectar cada servicio remoto mediante capacidades y transportes de privilegio mínimo.

## Estado actual

- MVP local completo con tres bots demo: Galerazo, Spider Tracker y Reshare Stories.
- Vistas funcionales: Resumen, Logs, Triggers y SQL.
- Toggles y resultados SQL son demostrativos; no existe conexión externa ni publicación.
- Integración preparada mediante `BotTransport`, registro JSON y documentación de `botctl`.
- `npm run lint`, `npm run build` y `npm test` pasan en Windows.
- La dependencia de producción mantiene dos avisos moderados transitivos de PostCSS dentro de Next; no hay fix estable compatible y no se forzó downgrade.
- Rama `main`, sin remoto configurado.

## Próximo paso exacto

Cuando el usuario esté listo para probar Galerazo, recopilar proyecto/zona/instancia de GCP y rutas no secretas del servicio, confirmar acceso manual por IAP, implementar primero `botctl health --json` en Galerazo y enlazar solo la capacidad `status` antes de logs, triggers y SQL.

## Riesgos y guardrails

- No guardar credenciales, tokens, bases ni logs en Git.
- No exponer SQLite, SSH ni la UI en una IP pública.
- No agregar acciones mutables bajo los permisos de observación.
- Cerrar cualquier servidor de desarrollo iniciado por Codex antes de terminar la sesión.
