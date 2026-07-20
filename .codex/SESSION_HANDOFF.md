# Session handoff

## Objetivo general

Mantener un dashboard local multi-bot y conectar cada servicio remoto mediante capacidades y transportes de privilegio mínimo.

## Estado actual

- Visualizador genérico de triggers funcional: muestra autor, chat, uso, respuesta y audio/video; reproduce y descarga los medios dentro de la aplicación.
- Moderación local funcional con confirmación para eliminar, bloquear o combinar ambas acciones; persiste el resultado y el aviso demostrativo al chat en `localStorage`.
- Administrador de flota funcional: activa, quita y registra bots locales; persiste la selección sin guardar credenciales.
- Flota inicial con Galerazo Bot y Spider Tracker; Reshare Stories está disponible para agregar, pero inactivo por defecto.
- El launcher muestra progreso en menos de un segundo mientras inicia vinext; la tipografía tiene una escala de lectura mayor sin alterar el layout.
- Acceso instalado en `C:\Users\calei\Documents\Codex\CODEX APPS\Bot Control Center.lnk`; abre una ventana de aplicación aislada y apaga automáticamente el árbol completo del servidor al cerrarse.
- Launcher reproducible desde `scripts/install-codex-app.ps1`, con ejecutable en `bin/BotControlCenter.exe` y registros locales fuera del repositorio.
- Catálogo demo con Galerazo, Spider Tracker y Reshare Stories, más registros locales personalizados.
- Vistas funcionales: Resumen, Logs, Triggers y SQL.
- Toggles, moderación, avisos al chat y resultados SQL son demostrativos; no existe conexión externa ni publicación de la app.
- Integración preparada mediante `BotTransport`, registro JSON y documentación de `botctl`, incluidos triggers list/media y moderate con resultados parciales explícitos.
- `npm run lint`, `npm run build` y `npm test` pasan en Windows; la suite tiene seis pruebas.
- La dependencia de producción mantiene dos avisos moderados transitivos de PostCSS dentro de Next; no hay fix estable compatible y no se forzó downgrade.
- Repositorio privado publicado en `https://github.com/ldebortoli/bot-control-center`; `origin` apunta a ese repositorio y `main` sigue `origin/main`.

## Próximo paso exacto

Para conectar Galerazo real, recopilar proyecto/zona/instancia de GCP y rutas no secretas, confirmar IAP manual, implementar primero `botctl health --json` y luego triggers list/media/moderate con una cuenta limitada que pueda eliminar, bloquear y enviar el aviso al chat correspondiente.

## Riesgos y guardrails

- No guardar credenciales, tokens, bases ni logs en Git.
- No exponer SQLite, SSH ni la UI en una IP pública.
- No agregar acciones mutables bajo los permisos de observación.
- Exigir confirmación, auditoría y resultado explícito del aviso al chat para toda moderación remota de triggers.
- Cerrar cualquier servidor de desarrollo iniciado por Codex antes de terminar la sesión.
