# Bot Control Center - Contexto del proyecto

## Fuente0.1.5 con parches de auditoria - 2026-10-07

- Sharp0.35.5/libvips1.3.4 y source-map-js1.2.2 fijados en overrides/lock. Next16.3.7/Vinext1.0.0 conservados. Audit de produccion0; fullaudit8altas de desarrollo por braces<=3.0.3 sin parche upstream, bloqueado inline enBACKLOG. Este resultado actual reemplaza afirmaciones historicas de audit completo0.
- Suite ahora incluye pruebas del addon nativo y guardrails source-map; gate de CI npm audit --omit=dev y coverage100%agent intactos. Sin cambios de UI, launcher, calendario, permisos, secretos ni deploy.


## Fuente 0.1.4 y recurrente auditado - 2026-10-07

- El puente frontend, wrapper PowerShell y helper Python, pertenece al snapshot inmutable del bot en el release mensual. El checkout vivo solo aporta su runtime `.venv`. El runner sigue compartido con el manager/lock existentes, sin otra tarea ni deploy manual paralelo.
- Tarea real verificada Ready con resultado 0, unico trigger mensual dia 1 a las 03:00 ART, proxima 2026-11-01 03:00 y 12 reintentos PT1H. No se ejecuto ni modifico la tarea durante esta auditoria; nuevos despliegues requieren autorizacion expresa.
- Validacion fuente: lint, build, 65 tests completos; cobertura 100% lineas/ramas/funciones del agente (52 tests) y lint sobre checkout limpio del indice con core.autocrlf=true.
- Auditoria coordinada de solo lectura desde Galerazobot: produccion sirve web 0.1.16 en ambos dominios, gateway anonimo 401/no-store y bot 0.68 (imagen `0fe92884eda7`) healthy. Esto actualiza las referencias historicas de frontend 0.1.14 mas abajo, sin una nueva publicacion en esta tarea.

## Estado vigente del release - 2026-10-01

- Bot produccion0.68, imagen0fe92884eda7, running/healthy y Telegram conectado; release_state0.68 y anuncio aprobado corregido procesado. La misma tarea mensual1/03:00 termino con resultado0 y conserva reintentos. Registros historicos0.63 mas abajo quedan superados para estado productivo del bot.
- Scripts versionados arrancan Docker Desktop y esperan motor Linux180s antes de validar un lock cambiado/build; no cambian motor ni omiten pruebas. BCC ignora stderr informativa de coverage al elegir causa del fallo. Runtime canonico siguePython3.14.7.
- Frontend publico sigueweb0.1.10; web0.1.13 preparada requiere respuesta de alcance antes de incorporarse/publicarse. No se modifico web ni su mecanismo de deploy. Nuevas visitas compartidas del bot requieren ese frontend.


## Descripción general

Dashboard local y extensible para observar una flota de bots remotos desde una interfaz común. Galerazo usa datos reales para estado operativo, logs y triggers, y dispone además de deploy, moderación y administración segura de credenciales en Google Cloud mediante IAP/SSH, sin publicar bases ni puertos administrativos. Los bots sin adaptador se muestran desconectados y nunca reciben datos operativos de ejemplo.

## Estado estable

- Ruta: `%USERPROFILE%\Documents\Codex\BotControlCenter\dashboard`
- Stack: Node.js 22+, TypeScript, React 19.2.8, Next 16.3.7, vinext 1.0.0/Vite 8.1.5, peer RSC 0.5.34, Cloudflare Vite Plugin 1.62.2 y Wrangler 4.144.0. La fuente es 0.1.2; los overrides de Nanoid 3.3.18, PostCSS 8.5.23, Sharp 0.35.4 y satori/fflate 0.7.5 mantienen transitivos parcheados. El launcher/acceso local no se recompiló por este cambio de dependencias.
- Git: repositorio publico en `https://github.com/ldebortoli/bot-control-center`, con `origin` configurado y rama principal `main`.
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
- `launcher/`, `bin/` y `scripts/*windows-launcher*`: app nativa de Windows que supervisa vinext y el agente, abre la UI en una ventana aislada, comparte un único `.ico` entre ejecutable/favicon/manifest y asigna al HWND su propio `AppUserModelID` y recurso de relanzamiento para separarlo del grupo de Edge. Reaplica el icono si Edge/Chrome intenta reemplazarlo, sigue la ventana real aunque el navegador derive el arranque a otro proceso y la cierra con un diagnostico visible si el servidor local termina. Vite ignora `bin/` para que los temporales bloqueados del compilador nativo no derriben el watcher.
- El administrador de flota activa, quita y registra bots locales; conserva la selección y los registros personalizados en `localStorage`, sin credenciales ni métricas/logs/triggers. Los registros de versiones anteriores se sanean al hidratarse.
- Los bots que declaran y tienen configurado `triggers` muestran un inspector genérico con autor, chat, texto y reproducción/descarga de imágenes, GIF, stickers WebP/WebM/TGS, audio, video y archivos. La lista se pagina de a 10 y permite filtrar por ID/nombre de chat, tipo y rango de fechas, y ordenar por fecha, nombre o chat. Galerazo consulta SQLite/Telegram reales y ejecuta moderación confirmada con aviso al chat. Sin capacidad se muestra `No hay triggers disponibles`; si falla el adaptador se informa el error de conexión.
- Galerazo expone en Resumen, Logs y Deploy un panel real de VM/contenedor, health, reinicios, imagen, CPU/RAM/disco/SQLite, Telegram, logs/errores y alertas. Bot Control Center filtra sólo los accesos rutinarios `getUpdates` que terminan en `HTTP 200 OK`; conserva timeouts, errores, respuestas no exitosas y cualquier otra operación. Una detención confirmada usa `docker compose stop bot` para cortar bucles sin borrar datos.
- Galerazo declara `credentials`: la UI muestra sólo presencia/ausencia, recibe reemplazos enmascarados, conserva campos vacíos y permite borrar únicamente opcionales. El agente usa un parche temporal privado por IAP y nunca guarda ni devuelve los valores.
- Todos los scrollbars web comparten tokens oscuros del dashboard y estados hover, pressed, inactivo y deshabilitado; el tratamiento global cubre desplazamiento vertical, horizontal y superficies anidadas, y vuelve a colores del sistema en modo forced-colors.
- Galerazo tiene un release mensual seguro habilitado para el día 1 a las 03:00 (hora local de Windows), con actualización estable de dependencias previa. Una tarea persistente abre una ventana nativa de progreso aunque la UI principal esté cerrada, avisa inicio/resultado en `Codex - Logs` y adjunta una causa saneada y acotada cuando falla, exige un árbol Git limpio, sincroniza `origin/main` sin `force` y fija la base en un worktree detached. Allí resuelve y valida el lock mediante el script versionado de Galerazo; solo permite que cambie `requirements.txt`, crea y sube un commit acotado sin `force`, y publica/despliega el hash final únicamente si todavía no tiene imagen. Si no cambia código ni lock no toca producción; cualquier validación fallida, divergencia, archivo inesperado, cambio sin commit u otra operación activa cancela o pospone el corte.

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

El workflow `.github/workflows/quality.yml` ejecuta lint, build, suite unitaria, cobertura y auditoria de produccion en pushes y pull requests contra `main`, con cache, cancelacion por concurrencia y timeout de 15 minutos.

En Windows también existe el acceso `%USERPROFILE%\Documents\Codex\CODEX APPS\Bot Control Center.lnk`. Muestra una ventana de inicio inmediata con X nativa y cancelación por Escape, inicia UI y agente ocultos en localhost y apaga el árbol de procesos al cerrar. Si hay un job operativo activo, espera a que termine antes de apagar para no interrumpir un push o deploy.

La tarea `Bot Control Center - Release - galerazo` está instalada en el Programador de tareas, usa logon interactivo, `StartWhenAvailable`, `IgnoreNew`, un límite de 3 horas y hasta 12 reintentos horarios. Ejecuta la ventana nativa `BotControlCenterScheduledRelease.exe`; su próxima ejecución verificada es el 2026-10-01 a las 03:00. La configuración real permanece en el archivo ignorado `config/runtime.local.json`.

Computer Use/Windows Graphics Capture no pudo validar visualmente la ventana Edge de Bot Control Center en 2026-07 porque no determinó su URL con suficiente confianza. No repetir ese mecanismo antes de 2026-08 salvo cambio de versión/configuración o pedido explícito; usar como fallback verificación del HTML/manifest, hashes del recurso, APIs nativas de ventana y confirmación visual del usuario.

## Convenciones y seguridad

- Preservar cambios ajenos y secretos locales.
- Actualizar este archivo solo cuando cambie información estable.
- La memoria persistente vive en `.codex/` y se carga siguiendo `AGENTS.md`.
- El dashboard real debe escuchar en localhost y conectarse por sesiones efímeras IAP/SSH.
- Consultas SQLite reales requieren `mode=ro`, `PRAGMA query_only=ON`, authorizer, timeout y límite de filas.
- La moderación remota de triggers usa permisos separados, confirmación, revalidación contra SQLite, resultado estructurado y aviso al chat; un fallo parcial del aviso se informa explícitamente.
- El deploy usa un agente local separado, scripts fijos, confirmación, logs saneados y una sola operación por bot; restart y otras escrituras generales siguen fuera del MVP. La única excepción operativa adicional es detener de forma segura el servicio `bot` para cortar un bucle.
- Los releases programados no incluyen archivos del worktree vivo ni aceptan mutaciones arbitrarias. La única creación automática permitida es un commit de `requirements.txt` producido y validado por el actualizador fijo dentro del snapshot; siempre usa push no forzado. El lock por bot se comparte entre procesos y con todas las acciones manuales.
- El repositorio publico mantiene Secret Scanning y Push Protection habilitados. Los commits usan el correo `noreply` de GitHub y los artefactos versionados no contienen rutas personales cuando `%USERPROFILE%` o una ruta relativa es suficiente.
- Las validaciones locales son obligatorias antes de publicar cambios; GitHub Actions es una segunda capa. No esperar, sondear ni monitorear CI remota despues del push salvo pedido explicito del usuario en la solicitud actual.
- La edición de credenciales está separada del deploy, exige confirmación y no reinicia el bot. Como Compose inyecta `/etc/galerazo/bot.env` al crear el contenedor, un simple `restart` no aplica el nuevo entorno; hace falta deploy o recreación explícita.
- El audit completo de la fuente 0.1.2 y el de producción informan cero vulnerabilidades. SSR se valida en el preview local de Vite/workerd con cierre completo, no mediante importación del worker Cloudflare en Node. No desplegar ni iniciar el agente para validar esta migración.

## Estado estable del frontend y releases conjuntos - 2026-10-01

Produccion: web 0.1.14 (fuente `375ca92`, Worker `527fbb25`) y bot 0.68 (imagen `0fe92884eda7`), healthy. BCC 0.1.3 sincroniza `frontendRepositoryPath` en la tarea mensual y el deploy manual existentes: solo publica si cambia el fingerprint de ejecucion del frontend, exige snapshot remoto limpio y verifica contrato, version, activos y bot healthy antes del exito. Calendario del dia 1 a las 03:00 ART y 12 reintentos horarios intactos. Contrato documentado en `docs/FRONTEND_RELEASE.md` de los tres repos. Sin nuevos secretos, permisos, recursos, planes ni polling. Las referencias historicas a web 0.1.10, reserva y consulta de alcance quedan superadas. QA con sesion real de Telegram pendiente, separado de browser local con fixtures.
