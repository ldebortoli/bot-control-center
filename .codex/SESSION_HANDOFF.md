# Session handoff

## Objetivo general

Mantener un dashboard local multi-bot y conectar cada servicio remoto mediante capacidades y transportes de privilegio mínimo.

## Estado actual

- Vista Deploy funcional para Galerazo con pre-flight, confirmación, release completo, deploy de última imagen, rollback, progreso y logs saneados.
- Vista Credenciales funcional para Galerazo: indicadores presente/ausente, entradas enmascaradas, parches parciales, borrado sólo de opcionales, confirmación y auditoría; nunca lee valores remotos.
- Agente local funcional en `127.0.0.1:43121`; ejecuta exclusivamente scripts versionados de credenciales, publicación, deploy y rollback con argumentos validados y `shell: false`.
- `config/runtime.local.json` está ignorado, no contiene secretos y apunta a `bot-fleet-production`, `us-central1-a`, `galerazo-prod` y el repositorio local Galerazo.
- Visualizador genérico de triggers funcional: muestra autor, chat, uso y respuesta; admite texto, imágenes PNG/JPEG/WebP/GIF, stickers WebP/PNG/WebM/TGS, audio y video, con reproducción y descarga dentro de la aplicación.
- Los TGS se descomprimen en memoria y se reproducen con `lottie-web` light; la demostración genera ejemplos locales sin depender de archivos externos.
- Moderación local funcional con confirmación para eliminar, bloquear o combinar ambas acciones; persiste el resultado y el aviso demostrativo al chat en `localStorage`.
- Administrador de flota funcional: activa, quita y registra bots locales; persiste la selección sin guardar credenciales.
- Flota inicial con Galerazo Bot y Spider Tracker; Reshare Stories está disponible para agregar, pero inactivo por defecto.
- El launcher muestra progreso mientras inicia vinext y el agente; espera un job operativo activo antes de apagar y mata el árbol completo al terminar.
- Acceso instalado en `C:\Users\calei\Documents\Codex\CODEX APPS\Bot Control Center.lnk`; abre una ventana de aplicación aislada y apaga automáticamente el árbol completo del servidor al cerrarse.
- Launcher reproducible desde `scripts/install-codex-app.ps1`, con ejecutable en `bin/BotControlCenter.exe` y registros locales fuera del repositorio.
- Catálogo demo con Galerazo, Spider Tracker y Reshare Stories, más registros locales personalizados.
- Vistas funcionales: Resumen, Logs, Triggers, SQL, Credenciales y Deploy.
- Toggles, moderación, avisos al chat y resultados SQL son demostrativos. Deploy y credenciales son integraciones externas reales; aún no existe una imagen publicada, por lo que deploy permanece pendiente del paso 10 de Galerazo.
- Integración preparada mediante `BotTransport`, registro JSON y documentación de `botctl`, incluidos triggers list/media y moderate con resultados parciales explícitos.
- `npm run lint`, `npm run build` y `npm test` pasan en Windows; la suite tiene 17 pruebas. La revisión visual confirmó la vista de credenciales y la regresión de triggers. La lectura real devolvió sólo booleanos y un no-op real por IAP terminó con éxito sin cambiar el estado útil.
- La dependencia de producción mantiene dos avisos moderados transitivos de PostCSS dentro de Next; no hay fix estable compatible y no se forzó downgrade.
- Repositorio privado publicado en `https://github.com/ldebortoli/bot-control-center`; `origin` apunta a ese repositorio y `main` sigue `origin/main`.

## Próximo paso exacto

Volver a Galerazo y ejecutar con el usuario el paso 10: publicar la primera imagen inmutable en Artifact Registry, sin desplegarla todavía.

## Riesgos y guardrails

- No guardar credenciales, tokens, bases ni logs en Git.
- No exponer SQLite, SSH ni la UI en una IP pública.
- No agregar acciones mutables bajo los permisos de observación.
- El agente de deploy nunca debe escuchar fuera de `127.0.0.1`, aceptar comandos libres ni guardar credenciales.
- No interrumpir automáticamente un push/deploy activo al cambiar de vista o cerrar normalmente la ventana; el launcher muestra una espera antes de apagar.
- Exigir confirmación, auditoría y resultado explícito del aviso al chat para toda moderación remota de triggers.
- Cerrar cualquier servidor de desarrollo iniciado por Codex antes de terminar la sesión.
