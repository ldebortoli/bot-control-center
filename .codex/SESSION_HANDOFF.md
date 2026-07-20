# Session handoff

## Objetivo general

Mantener un dashboard local multi-bot y conectar cada servicio remoto mediante capacidades y transportes de privilegio mínimo.

## Estado actual

- Vista Deploy funcional para Galerazo con pre-flight, confirmación, release completo, deploy de última imagen, rollback, progreso y logs saneados.
- Agente local funcional en `127.0.0.1:43121`; sólo ejecuta los scripts `Publish-DockerImage.ps1`, `Deploy-Gce.ps1` y `Rollback-Gce.ps1` con argumentos validados y `shell: false`.
- `config/runtime.example.json` documenta proyecto/zona/instancia/ruta; `runtime.local.json` está ignorado y todavía no existe porque faltan los datos GCP del usuario.
- Visualizador genérico de triggers funcional: muestra autor, chat, uso y respuesta; admite texto, imágenes PNG/JPEG/WebP/GIF, stickers WebP/PNG/WebM/TGS, audio y video, con reproducción y descarga dentro de la aplicación.
- Los TGS se descomprimen en memoria y se reproducen con `lottie-web` light; la demostración genera ejemplos locales sin depender de archivos externos.
- Moderación local funcional con confirmación para eliminar, bloquear o combinar ambas acciones; persiste el resultado y el aviso demostrativo al chat en `localStorage`.
- Administrador de flota funcional: activa, quita y registra bots locales; persiste la selección sin guardar credenciales.
- Flota inicial con Galerazo Bot y Spider Tracker; Reshare Stories está disponible para agregar, pero inactivo por defecto.
- El launcher muestra progreso mientras inicia vinext y el agente; espera un job operativo activo antes de apagar y mata el árbol completo al terminar.
- Acceso instalado en `C:\Users\calei\Documents\Codex\CODEX APPS\Bot Control Center.lnk`; abre una ventana de aplicación aislada y apaga automáticamente el árbol completo del servidor al cerrarse.
- Launcher reproducible desde `scripts/install-codex-app.ps1`, con ejecutable en `bin/BotControlCenter.exe` y registros locales fuera del repositorio.
- Catálogo demo con Galerazo, Spider Tracker y Reshare Stories, más registros locales personalizados.
- Vistas funcionales: Resumen, Logs, Triggers, SQL y Deploy.
- Toggles, moderación, avisos al chat y resultados SQL son demostrativos. Deploy es la única integración externa real preparada, pero permanece deshabilitada mientras falten configuración, Docker y `gcloud`.
- Integración preparada mediante `BotTransport`, registro JSON y documentación de `botctl`, incluidos triggers list/media y moderate con resultados parciales explícitos.
- `npm run lint`, `npm run build` y `npm test` pasan en Windows; la suite tiene doce pruebas. El smoke test confirmó UI HTTP 200, agente online, cero jobs y deploy deshabilitado sin configuración.
- La dependencia de producción mantiene dos avisos moderados transitivos de PostCSS dentro de Next; no hay fix estable compatible y no se forzó downgrade.
- Repositorio privado publicado en `https://github.com/ldebortoli/bot-control-center`; `origin` apunta a ese repositorio y `main` sigue `origin/main`.

## Próximo paso exacto

Copiar `config/runtime.example.json` a `config/runtime.local.json`, completar proyecto/zona/instancia de GCP, instalar Docker Desktop y Google Cloud CLI, verificar IAP manualmente y ejecutar primero un release controlado desde la vista Deploy. La observación real sigue requiriendo `botctl health`, logs, SQL y triggers.

## Riesgos y guardrails

- No guardar credenciales, tokens, bases ni logs en Git.
- No exponer SQLite, SSH ni la UI en una IP pública.
- No agregar acciones mutables bajo los permisos de observación.
- El agente de deploy nunca debe escuchar fuera de `127.0.0.1`, aceptar comandos libres ni guardar credenciales.
- No interrumpir automáticamente un push/deploy activo al cambiar de vista o cerrar normalmente la ventana; el launcher muestra una espera antes de apagar.
- Exigir confirmación, auditoría y resultado explícito del aviso al chat para toda moderación remota de triggers.
- Cerrar cualquier servidor de desarrollo iniciado por Codex antes de terminar la sesión.
