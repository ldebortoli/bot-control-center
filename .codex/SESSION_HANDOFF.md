# Session handoff

## Objetivo general

Mantener un dashboard local multi-bot y conectar cada servicio remoto mediante capacidades y transportes de privilegio mínimo.

## Estado actual

- Administrador de flota funcional: activa, quita y registra bots locales; persiste la selección sin guardar credenciales.
- Flota inicial con Galerazo Bot y Spider Tracker; Reshare Stories está disponible para agregar, pero inactivo por defecto.
- El launcher muestra progreso en menos de un segundo mientras inicia vinext; la tipografía tiene una escala de lectura mayor sin alterar el layout.
- Acceso instalado en `C:\Users\calei\Documents\Codex\CODEX APPS\Bot Control Center.lnk`; abre una ventana de aplicación aislada y apaga automáticamente el árbol completo del servidor al cerrarse.
- Launcher reproducible desde `scripts/install-codex-app.ps1`, con ejecutable en `bin/BotControlCenter.exe` y registros locales fuera del repositorio.
- Catálogo demo con Galerazo, Spider Tracker y Reshare Stories, más registros locales personalizados.
- Vistas funcionales: Resumen, Logs, Triggers y SQL.
- Toggles y resultados SQL son demostrativos; no existe conexión externa ni publicación.
- Integración preparada mediante `BotTransport`, registro JSON y documentación de `botctl`.
- `npm run lint`, `npm run build` y `npm test` pasan en Windows; la suite tiene cinco pruebas.
- La dependencia de producción mantiene dos avisos moderados transitivos de PostCSS dentro de Next; no hay fix estable compatible y no se forzó downgrade.
- Repositorio privado publicado en `https://github.com/ldebortoli/bot-control-center`; `origin` apunta a ese repositorio y `main` sigue `origin/main`.

## Próximo paso exacto

Cuando el usuario esté listo para probar Galerazo, recopilar proyecto/zona/instancia de GCP y rutas no secretas del servicio, confirmar acceso manual por IAP, implementar primero `botctl health --json` en Galerazo y enlazar solo la capacidad `status` antes de logs, triggers y SQL.

## Riesgos y guardrails

- No guardar credenciales, tokens, bases ni logs en Git.
- No exponer SQLite, SSH ni la UI en una IP pública.
- No agregar acciones mutables bajo los permisos de observación.
- Cerrar cualquier servidor de desarrollo iniciado por Codex antes de terminar la sesión.
