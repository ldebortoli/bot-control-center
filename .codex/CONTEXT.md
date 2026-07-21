# Bot Control Center - Contexto del proyecto

## Descripción general

Dashboard local y extensible para observar una flota de bots remotos desde una interfaz común. Las capacidades de observación usan datos demo; Galerazo dispone además de deploy y administración segura de credenciales en Google Cloud mediante IAP/SSH, sin publicar bases ni puertos administrativos.

## Estado estable

- Ruta: `C:\Users\calei\Documents\Codex\BotControlCenter\dashboard`
- Stack: Node.js 22+, TypeScript, React 19, Next 16 y vinext/Vite para Cloudflare Sites.
- Git: repositorio privado en `https://github.com/ldebortoli/bot-control-center`, con `origin` configurado y rama principal `main`.
- Idioma de la interfaz y documentación: español.
- Hosting: no desplegado; `.openai/hosting.json` mantiene D1 y R2 desactivados.
- Datos de observación: demostrativos hasta configurar un adaptador real. `config/runtime.local.json` existe localmente, está ignorado y apunta a `bot-fleet-production/us-central1-a/galerazo-prod`; no contiene secretos.
- Flota inicial: Galerazo Bot y Spider Tracker; Reshare Stories permanece en el catálogo local, inactivo por defecto.

## Arquitectura

- `app/`: interfaz de selector de bots, resumen, logs, triggers, SQL, credenciales y deploy.
- `agent/`: API privilegiada local en `127.0.0.1:43121`, validación, pre-flight y jobs permitidos de credenciales/release/deploy/rollback.
- `lib/control-center/`: tipos, registro demo, política SQL y contrato de transporte.
- `config/bots.example.json`: ejemplo declarativo sin secretos; `bots.local.json` está ignorado.
- `config/runtime.example.json`: ejemplo del destino operativo; `runtime.local.json` está ignorado y no contiene credenciales.
- `docs/ARCHITECTURE.md`: diseño de `botctl`, IAP/SSH y guardrails SQLite.
- `build/` y `worker/`: integración requerida por Sites/vinext.
- `public/og-bot-control-center.png`: imagen social generada para el proyecto.
- `launcher/`, `bin/` y `scripts/*windows-launcher*`: app nativa de Windows que supervisa vinext y el agente, abre la UI en una ventana aislada y sigue la ventana real aunque Edge derive el arranque a otro proceso.
- El administrador de flota activa, quita y registra bots locales; conserva la selección y los registros personalizados en `localStorage`, sin credenciales.
- Los bots que declaran `triggers` muestran un inspector genérico con autor, chat, texto y reproducción/descarga de imágenes, GIF, stickers WebP/WebM/TGS, audio y video. La moderación se confirma, simula y audita en `localStorage` hasta conectar un adaptador real.
- Galerazo declara `credentials`: la UI muestra sólo presencia/ausencia, recibe reemplazos enmascarados, conserva campos vacíos y permite borrar únicamente opcionales. El agente usa un parche temporal privado por IAP y nunca guarda ni devuelve los valores.

## Ejecución y tests

Comandos verificados en Windows:

- `npm install`
- `npm run dev`
- `npm run dev:full`
- `npm run agent`
- `npm run lint`
- `npm run build`
- `npm test`

El runner `scripts/run-vinext.mjs` hace que dev/build/start sean multiplataforma; `scripts/run-local.mjs` administra en conjunto UI y agente.

En Windows también existe el acceso `C:\Users\calei\Documents\Codex\CODEX APPS\Bot Control Center.lnk`. Muestra una ventana de inicio inmediata, inicia UI y agente ocultos en localhost y apaga el árbol de procesos al cerrar. Si hay un job operativo activo, espera a que termine antes de apagar para no interrumpir un push o deploy.

## Convenciones y seguridad

- Preservar cambios ajenos y secretos locales.
- Actualizar este archivo solo cuando cambie información estable.
- La memoria persistente vive en `.codex/` y se carga siguiendo `AGENTS.md`.
- El dashboard real debe escuchar en localhost y conectarse por sesiones efímeras IAP/SSH.
- Consultas SQLite reales requieren `mode=ro`, `PRAGMA query_only=ON`, authorizer, timeout y límite de filas.
- La moderación remota de triggers tendrá permisos separados, confirmación, resultado estructurado y aviso obligatorio al chat.
- El deploy usa un agente local separado, scripts fijos, confirmación, logs saneados y una sola operación por bot; restart y otras escrituras siguen fuera del MVP.
- La edición de credenciales está separada del deploy, exige confirmación y no reinicia el bot; los cambios toman efecto en el siguiente reinicio o deploy.
