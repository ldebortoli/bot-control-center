# Session handoff

## Objetivo general

Mantener un dashboard local multi-bot y conectar cada servicio remoto mediante capacidades y transportes de privilegio mínimo.

## Estado actual

- Desde 2026-08-09 Galerazo tiene un release mensual seguro habilitado para el día 1 a las 03:00. La tarea `Bot Control Center - Release - galerazo` está `Ready`, próxima ejecución 2026-09-01 03:00, funciona con la UI cerrada, usa `StartWhenAvailable`/`IgnoreNew` y hasta 12 reintentos horarios. El flujo comparte un lock interproceso con acciones manuales, exige árbol limpio, sincroniza `origin/main` sin force, fija el commit y publica/despliega desde un worktree detached; no-op si la imagen ya corresponde al commit y posposición ante trabajo sin confirmar, divergencia o concurrencia. No se desplegó nada al instalarla.
- Galerazo estaba limpio en `d2d35ed` y su última imagen local registrada terminaba en `04c68349219b` al configurar la tarea, por lo que el próximo corte detectará cambios salvo que otro release publique antes. Los cambios posteriores al hash fijado quedan para el ciclo siguiente.
- Validación final del programador: lint y build OK, 48/48 pruebas, cobertura del agente 100% en líneas/ramas/funciones y `npm audit --omit=dev` en 0. Nanoid transitivo quedó fijado en 3.3.17 por la vulnerabilidad GHSA-2v37-7h3g-55p8.
- La captura del usuario confirmó que la verificación inmediata anterior era un falso positivo: además de reemplazar `WM_SETICON`, Windows mantenía la ventana dentro del grupo de Edge. La corrección genera un favicon idéntico al icono embebido, lo declara en metadata/manifest, asigna al HWND un `AppUserModelID` y recurso de relanzamiento exclusivos, y vigila `WM_GETICON` durante toda la sesión. Acceso recompilado e instalado; compilación nativa, hashes, HTML, 34/34 pruebas, cobertura y audit validados. Computer Use no pudo capturar la comprobación visual final porque no determinó con confianza la URL de la ventana Edge; conforme a su política no se reintentó.
- Desde 2026-07-29 el launcher asigna a la ventana Edge/Chrome el mismo icono grande y pequeño embebido en `BotControlCenter.exe`; el acceso de CODEX APPS fue recompilado y reinstalado. Una prueba nativa confirmó hashes idénticos entre `WM_GETICON` y el ejecutable, cierre correcto del launcher y cero listeners en 3000/43121. Suite 34/34, cobertura 100% y audit de producción en 0.
- Desde 2026-07-29 el adaptador local omite únicamente las líneas exitosas `getUpdates`/`HTTP 200 OK`; conserva `429`, timeouts, errores y las demás operaciones. Galerazobot no fue modificado. Validación: lint, build y 34/34 pruebas OK; cobertura del agente 100%; audit de producción en 0.
- Actualización de seguridad completada: Next/`eslint-config-next` 16.2.12, React/RSC 19.2.8, Vite 8.1.5, Cloudflare Vite Plugin 1.47.0 y Wrangler 4.114.0. Los overrides fijan PostCSS 8.5.23 y Sharp 0.35.3 porque Next aún declara versiones vulnerables.
- Validación del 2026-07-26: instalación limpia con `npm ci`, lint, build y 34/34 pruebas OK; `npm run test:coverage` mantiene 100% de líneas, ramas y funciones del agente; `npm audit --omit=dev` informa 0 vulnerabilidades. UI y agente permanecieron detenidos.
- El audit completo conserva nueve avisos altos exclusivamente dentro de la cadena dev de `eslint-config-next` (`minimatch` 3/`brace-expansion` 1). ESLint 10 deja peers inválidos y el override global corregido rompe la API esperada por `minimatch`; ambos intentos se descartaron. Esperar una actualización compatible del preset, sin usar `npm audit fix --force`.
- El repositorio es privado y actualmente no contiene workflows de GitHub Actions; la validación reproducible se ejecuta localmente. Si se hace público, corresponde agregar un workflow rápido de calidad conforme a la política global, dejando suites costosas como opt-in.
- Toda la flota aplica datos reales o estado explícito: Resumen y Logs consultan el endpoint remoto para cualquier bot; sin configuración/conexión muestran el error y no renderizan métricas ni logs estáticos. Triggers muestra la lectura real, `No hay triggers disponibles` o el error de conexión. SQL sin contrato real queda no disponible.
- Spider Tracker, Reshare Stories y bots personalizados están desconectados hasta incorporar un adaptador. El catálogo ya no contiene métricas, versiones, commits, logs, SQL ni triggers ficticios; el visor tampoco genera multimedia local. Los registros antiguos guardados en `localStorage` se sanean automáticamente.
- Galerazo ya no usa fixtures operativos: Resumen, Logs, Triggers y Deploy consultan por IAP el estado real de VM/contenedor, health, reinicios, imagen, recursos, Telegram, logs/errores y los triggers reales de SQLite. Si la conexión falla, la UI muestra un error explícito y no sustituye datos inventados.
- La inspección real del 2026-07-22 confirmó VM `running`, contenedor `running/healthy`, un reinicio total, cero reinicios en 15 minutos, Telegram conectado y seis triggers reales: cuatro con multimedia y dos de texto. No se ejecutaron acciones mutables en producción.
- El panel operativo alerta health degradado, reinicios recientes/bucle, Telegram desconectado y disco alto; permite actualizar y detener únicamente el servicio `bot` con confirmación. La detención usa `docker compose stop`, conserva base, imagen, secretos y configuración y deja reintentar un deploy.
- `Verificar` en Deploy muestra estado de carga, cantidad de requisitos comprobados, hora de finalización y errores visibles.
- Cobertura automática disponible con `npm run test:coverage`: instrumenta `agent/**/*.mjs` y alcanza y exige 100% de líneas, ramas y funciones, sin exclusiones. `npm run test:unit` ejecuta la suite rápida sin build.
- Al cierre, UI y agente no escuchan en `127.0.0.1:3000` ni `127.0.0.1:43121`. Codex no los detuvo; los cambios se cargarán al próximo inicio normal desde CODEX APPS.
- Legibilidad de Deploy mejorada: Destino y Pre-flight tienen tipografía y controles mayores, Última imagen dispone de más ancho y puede envolver la referencia completa, y la acción principal tiene mayor jerarquía visual.
- Launcher corregido e instalado: detecta la ventana real de Bot Control Center entre los procesos de Edge/Chrome aunque el proceso inicial termine por handoff.
- Vista Deploy funcional para Galerazo con pre-flight, confirmación, release completo, deploy de última imagen, rollback, progreso y logs saneados.
- Vista Credenciales funcional para Galerazo: indicadores presente/ausente, entradas enmascaradas, parches parciales, borrado sólo de opcionales, confirmación y auditoría; nunca lee valores remotos.
- Agente local funcional en `127.0.0.1:43121`; ejecuta exclusivamente scripts versionados de estado, triggers, multimedia, moderación, detención, credenciales, publicación, deploy y rollback con argumentos validados y `shell: false`.
- `config/runtime.local.json` está ignorado, no contiene secretos y apunta a `bot-fleet-production`, `us-central1-a`, `galerazo-prod` y el repositorio local Galerazo.
- Visualizador genérico de triggers funcional: muestra autor, chat, fecha y respuesta; admite texto, imágenes PNG/JPEG/WebP/GIF, stickers WebP/PNG/WebM/TGS, audio, video y archivos, con reproducción y descarga dentro de la aplicación. Todo el contenido proviene del adaptador remoto; no existe generación multimedia local.
- Los TGS remotos se descomprimen en memoria y se reproducen con `lottie-web` light; no se generan ejemplos multimedia locales.
- Moderación remota funcional para Galerazo con confirmación para eliminar, bloquear o combinar ambas acciones; vuelve a resolver trigger, chat y usuario en SQLite, registra el bloqueo global del bot y envía una advertencia al chat. Sin adaptador no se ofrecen acciones simuladas.
- Administrador de flota funcional: activa, quita y registra bots locales; persiste la selección sin guardar credenciales.
- Flota inicial con Galerazo Bot y Spider Tracker; Reshare Stories está disponible para agregar, pero inactivo por defecto.
- El launcher muestra progreso mientras inicia vinext y el agente; espera un job operativo activo antes de apagar y mata el árbol completo al terminar.
- Dos aperturas consecutivas del launcher corregido mostraron la ventana en 9,56 s y 8,05 s; en ambas, cerrar la ventana terminó el launcher y liberó los puertos 3000 y 43121.
- Acceso instalado en `C:\Users\calei\Documents\Codex\CODEX APPS\Bot Control Center.lnk`; abre una ventana de aplicación aislada y apaga automáticamente el árbol completo del servidor al cerrarse.
- Launcher reproducible desde `scripts/install-codex-app.ps1`, con ejecutable en `bin/BotControlCenter.exe` y registros locales fuera del repositorio.
- Catálogo de identidad con Galerazo, Spider Tracker y Reshare Stories, más registros locales personalizados; sólo Galerazo tiene actualmente un adaptador real.
- Vistas funcionales: Resumen, Logs, Triggers, Credenciales y Deploy; SQL permanece deshabilitado hasta disponer de un contrato real y no muestra resultados de ejemplo.
- Galerazo usa un `botctl` versionado y temporal por IAP para estado, triggers, multimedia, moderación y detención. No abre puertos administrativos, no acepta comandos libres y nunca devuelve el token de Telegram.
- `npm run lint`, `npm run build`, `npm run test:coverage` y `npm test` pasan en Windows; la suite completa tiene 48 pruebas y la cobertura del agente es 100% en líneas, ramas y funciones.
- La aplicación distribuida no conserva deuda conocida según `npm audit --omit=dev`; los nueve avisos de `npm audit` pertenecen al linter upstream y no se ejecutan en producción.
- Repositorio privado publicado en `https://github.com/ldebortoli/bot-control-center`; `origin` apunta a ese repositorio y `main` sigue `origin/main`.

## Próximo paso exacto

Si el usuario autoriza acciones operativas nuevas, implementar `start` y `restart` del servicio Compose `bot`, con confirmación, job exclusivo, auditoría y healthcheck posterior. Evaluar `recreate` como una acción distinta para aplicar cambios de `/etc/galerazo/bot.env`, porque `restart` conserva el entorno del contenedor existente. Mantener fuera del panel el reinicio del daemon Docker, reboot de VM, shell libre, borrado de datos y escritura SQL. SQL real y adaptadores adicionales siguen bloqueados por diseño/alcance.

## Riesgos y guardrails

- No guardar credenciales, tokens, bases ni logs en Git.
- No exponer SQLite, SSH ni la UI en una IP pública.
- No agregar acciones mutables bajo los permisos de observación.
- El agente de deploy nunca debe escuchar fuera de `127.0.0.1`, aceptar comandos libres ni guardar credenciales.
- No interrumpir automáticamente un push/deploy activo al cambiar de vista o cerrar normalmente la ventana; el launcher muestra una espera antes de apagar.
- Exigir confirmación, auditoría y resultado explícito del aviso al chat para toda moderación remota de triggers.
- Cerrar cualquier servidor de desarrollo iniciado por Codex antes de terminar la sesión.
