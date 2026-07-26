# Bot Control Center - Contexto del proyecto

## Descripción general

Dashboard local y extensible para observar una flota de bots remotos desde una interfaz común. Galerazo usa datos reales para estado operativo, logs y triggers, y dispone además de deploy, moderación y administración segura de credenciales en Google Cloud mediante IAP/SSH, sin publicar bases ni puertos administrativos. Los bots sin adaptador se muestran desconectados y nunca reciben datos operativos de ejemplo.

## Estado estable

- Ruta: `C:\Users\calei\Documents\Codex\BotControlCenter\dashboard`
- Stack: Node.js 22+, TypeScript, React 19.2.8, Next 16.2.12 y vinext/Vite 8.1.5 para Cloudflare Sites. Los overrides de PostCSS 8.5.23 y Sharp 0.35.3 sustituyen dependencias transitivas vulnerables que Next todavía declara con versiones anteriores.
- Git: repositorio privado en `https://github.com/ldebortoli/bot-control-center`, con `origin` configurado y rama principal `main`.
- Idioma de la interfaz y documentación: español.
- Hosting: no desplegado; `.openai/hosting.json` mantiene D1 y R2 desactivados.
- Datos de observación: reales para Galerazo mediante un `botctl` efímero por IAP; un error de conexión queda explícito y nunca se reemplaza por fixtures. `config/runtime.local.json` existe localmente, está ignorado y apunta a `bot-fleet-production/us-central1-a/galerazo-prod`; no contiene secretos.
- Flota inicial: Galerazo Bot y Spider Tracker; Reshare Stories permanece en el catálogo local, inactivo por defecto. Spider, Reshare y registros personalizados no tienen adaptador real configurado y se presentan como `Sin conexión`.

## Arquitectura

- `app/`: interfaz de selector de bots, resumen, logs, triggers, SQL, credenciales y deploy.
- `agent/`: API privilegiada local en `127.0.0.1:43121`, validación, pre-flight y acciones fijas de estado, triggers, multimedia, moderación, detención, credenciales, release, deploy y rollback.
- `lib/control-center/`: tipos, registro de identidad sin datos operativos, política SQL y contrato de transporte.
- `config/bots.example.json`: ejemplo declarativo sin secretos; `bots.local.json` está ignorado.
- `config/runtime.example.json`: ejemplo del destino operativo; `runtime.local.json` está ignorado y no contiene credenciales.
- `docs/ARCHITECTURE.md`: diseño de `botctl`, IAP/SSH y guardrails SQLite.
- `build/` y `worker/`: integración requerida por Sites/vinext.
- `public/og-bot-control-center.png`: imagen social generada para el proyecto.
- `launcher/`, `bin/` y `scripts/*windows-launcher*`: app nativa de Windows que supervisa vinext y el agente, abre la UI en una ventana aislada y sigue la ventana real aunque Edge derive el arranque a otro proceso.
- El administrador de flota activa, quita y registra bots locales; conserva la selección y los registros personalizados en `localStorage`, sin credenciales ni métricas/logs/triggers. Los registros de versiones anteriores se sanean al hidratarse.
- Los bots que declaran y tienen configurado `triggers` muestran un inspector genérico con autor, chat, texto y reproducción/descarga de imágenes, GIF, stickers WebP/WebM/TGS, audio, video y archivos. Galerazo consulta SQLite/Telegram reales y ejecuta moderación confirmada con aviso al chat. Sin capacidad se muestra `No hay triggers disponibles`; si falla el adaptador se informa el error de conexión.
- Galerazo expone en Resumen, Logs y Deploy un panel real de VM/contenedor, health, reinicios, imagen, CPU/RAM/disco/SQLite, Telegram, logs/errores y alertas. Una detención confirmada usa `docker compose stop bot` para cortar bucles sin borrar datos.
- Galerazo declara `credentials`: la UI muestra sólo presencia/ausencia, recibe reemplazos enmascarados, conserva campos vacíos y permite borrar únicamente opcionales. El agente usa un parche temporal privado por IAP y nunca guarda ni devuelve los valores.

## Ejecución y tests

Comandos verificados en Windows:

- `npm install`
- `npm run dev`
- `npm run dev:full`
- `npm run agent`
- `npm run lint`
- `npm run build`
- `npm run test:unit`
- `npm run test:coverage`
- `npm test`
- `npm audit --omit=dev`

El runner `scripts/run-vinext.mjs` hace que dev/build/start sean multiplataforma; `scripts/run-local.mjs` administra en conjunto UI y agente.

La cobertura usa el motor V8 incorporado en Node sobre `agent/**/*.mjs`, con umbrales automáticos de 100% en líneas, ramas y funciones. La suite completa conserva además el build y las pruebas de render, launcher e integración.

En Windows también existe el acceso `C:\Users\calei\Documents\Codex\CODEX APPS\Bot Control Center.lnk`. Muestra una ventana de inicio inmediata, inicia UI y agente ocultos en localhost y apaga el árbol de procesos al cerrar. Si hay un job operativo activo, espera a que termine antes de apagar para no interrumpir un push o deploy.

## Convenciones y seguridad

- Preservar cambios ajenos y secretos locales.
- Actualizar este archivo solo cuando cambie información estable.
- La memoria persistente vive en `.codex/` y se carga siguiendo `AGENTS.md`.
- El dashboard real debe escuchar en localhost y conectarse por sesiones efímeras IAP/SSH.
- Consultas SQLite reales requieren `mode=ro`, `PRAGMA query_only=ON`, authorizer, timeout y límite de filas.
- La moderación remota de triggers usa permisos separados, confirmación, revalidación contra SQLite, resultado estructurado y aviso al chat; un fallo parcial del aviso se informa explícitamente.
- El deploy usa un agente local separado, scripts fijos, confirmación, logs saneados y una sola operación por bot; restart y otras escrituras generales siguen fuera del MVP. La única excepción operativa adicional es detener de forma segura el servicio `bot` para cortar un bucle.
- La edición de credenciales está separada del deploy, exige confirmación y no reinicia el bot; los cambios toman efecto en el siguiente reinicio o deploy.
- La superficie instalada en producción audita en 0 vulnerabilidades. El audit que incluye herramientas de desarrollo conserva avisos en la cadena de lint de `eslint-config-next`/`minimatch`; no debe forzarse ESLint 10 mientras los plugins del preset declaren compatibilidad sólo hasta ESLint 9.
