# Decisiones tecnicas

No borrar decisiones anteriores. Si una decision cambia, agregar una nueva entrada que indique cual reemplaza.

## D-001 - Memoria persistente del proyecto

- Estado: vigente.
- Fecha: 2026-07-20.
- Decision: usar `.codex/` como fuente de verdad entre sesiones, modelos y agentes.
- Motivo: continuidad independiente del historial del chat.

## D-002 - Aplicación separada y local-first

- Estado: vigente.
- Fecha: 2026-07-20.
- Decisión: Bot Control Center vive en un repositorio separado de los bots y comienza como dashboard local con datos demo.
- Motivo: desacoplar ciclos de despliegue, reducir riesgo y permitir probar la experiencia antes de conceder accesos remotos.

## D-003 - Registro, capacidades y transportes desacoplados

- Estado: vigente.
- Fecha: 2026-07-20.
- Decisión: cada bot se registra declarativamente, anuncia capacidades y se conecta mediante un adaptador (`gcp-iap`, `ssh` o `railway`) que invoca un contrato remoto `botctl`.
- Motivo: compartir estado, logs y SQL sin forzar a todos los bots a implementar módulos específicos como triggers.

## D-004 - Observación de solo lectura por defecto

- Estado: vigente.
- Fecha: 2026-07-20.
- Decisión: el MVP no reinicia, despliega ni modifica bots o bases. SQLite real se abrirá en modo lectura con validación redundante, límites y auditoría.
- Motivo: una consola central multiplica el impacto de un error; los permisos privilegiados requieren una etapa y un modelo de autorización separados.

## D-005 - Google Cloud mediante IAP/SSH

- Estado: vigente.
- Fecha: 2026-07-20.
- Decisión: la futura conexión de Galerazo usará IAP/SSH y no dependerá de una IP externa fija ni de publicar el puerto 22.
- Motivo: acceso autenticado y efímero con menor superficie expuesta.

## D-006 - Mantener alertas transitivas sin downgrade automático

- Estado: vigente.
- Fecha: 2026-07-20.
- Decisión: no ejecutar `npm audit fix --force` sobre los avisos transitivos actuales de PostCSS/Next, porque propone un downgrade mayor incompatible.
- Motivo: el build y las pruebas pasan; se actualizará cuando la cadena estable del starter publique una resolución compatible.

## D-007 - Launcher de Windows dueño del servidor

- Estado: vigente.
- Fecha: 2026-07-20.
- Decisión: abrir Bot Control Center desde `CODEX APPS` mediante un launcher nativo que inicia vinext en localhost, abre una ventana aislada de Edge o Chrome y asigna el servidor a un Windows Job Object con `KILL_ON_JOB_CLOSE`.
- Motivo: ofrecer una experiencia de aplicación sin consola visible y garantizar que cerrar la ventana termine el árbol completo del servidor, incluso si el launcher finaliza de forma inesperada.

## D-008 - Catálogo local y flota activa persistente

- Estado: vigente.
- Fecha: 2026-07-20.
- Decisión: separar el catálogo de bots de la flota visible. La UI puede activar, quitar y registrar bots locales; guarda solo IDs activos y definiciones demostrativas personalizadas en `localStorage`. Reshare Stories queda disponible en el catálogo, pero inactivo por defecto.
- Motivo: permitir administrar la flota sin editar código ni almacenar credenciales, manteniendo preparado el catálogo para volver a incorporar un bot.

## D-009 - Feedback inmediato de arranque y escala de lectura

- Estado: vigente.
- Fecha: 2026-07-20.
- Decisión: el launcher muestra una ventana de progreso mientras vinext inicia y la interfaz ajusta la altura percibida de las fuentes sin escalar el layout completo.
- Motivo: evitar que el primer inicio parezca fallido durante los segundos de espera y mejorar la legibilidad sin introducir recortes o desbordes.

## D-010 - Repositorio privado en GitHub

- Estado: vigente.
- Fecha: 2026-07-20.
- Decisión: publicar Bot Control Center en `https://github.com/ldebortoli/bot-control-center` como repositorio privado y usar `main` como rama principal seguida por `origin/main`.
- Motivo: persistir el código, el historial y la memoria del proyecto sin exponer públicamente una herramienta de control operativo.

## D-011 - Moderación de triggers separada y con aviso al chat

- Estado: vigente; reemplaza D-004 únicamente para las acciones de moderación de triggers solicitadas explícitamente.
- Fecha: 2026-07-20.
- Decisión: todo bot que declare `triggers` usa un modelo común con autor, chat y multimedia. Eliminar un trigger, bloquear a su creador o combinar ambas acciones exige confirmación, permisos remotos limitados, auditoría y una advertencia enviada al mismo chat. En modo demo, el resultado y los avisos se simulan y persisten sólo en `localStorage`.
- Motivo: permitir responder a contenido abusivo desde una única consola sin otorgar a las credenciales de observación permisos generales sobre el bot.

## D-012 - Formatos multimedia normalizados para triggers

- Estado: vigente.
- Fecha: 2026-07-20.
- Decisión: normalizar medios como `video`, `audio`, `image` o `sticker` y usar el MIME para distinguir PNG/JPEG/WebP/GIF, WebM y TGS. Los formatos nativos se reproducen con elementos del navegador; TGS se descomprime en memoria y usa el runtime liviano de Lottie sin evaluador de expresiones. Todos conservan descarga del archivo original.
- Motivo: cubrir los formatos reales de Telegram dentro del mismo visor sin depender de servicios externos ni habilitar el evaluador del reproductor Lottie completo.

## D-013 - Deploy mediante agente privilegiado local

- Estado: vigente; reemplaza D-004 únicamente para la capacidad `deploy` autorizada explícitamente.
- Fecha: 2026-07-20.
- Decisión: la UI no ejecuta procesos. Un agente Node separado escucha sólo en `127.0.0.1:43121`, acepta orígenes locales permitidos y expone únicamente `release`, `deploy` y `rollback` para bots configurados. Invoca con `shell: false` los scripts versionados de Galerazo, exige confirmación, limita concurrencia, sanea logs y reutiliza las credenciales locales de Docker/Google Cloud sin guardarlas. El launcher posee UI y agente; si se cierra durante un job activo, espera hasta 45 minutos a que concluya antes de terminar el árbol, salvo cancelación explícita de la espera.
- Motivo: ofrecer un deploy de una sola acción sin convertir el dashboard hospedable en una shell remota ni mezclar permisos operativos con observación, SQL o moderación.

## D-014 - Credenciales como capacidad privilegiada separada

- Estado: vigente; reemplaza D-004 únicamente para la capacidad `credentials` autorizada explícitamente.
- Fecha: 2026-07-20.
- Decisión: la UI muestra sólo presencia/ausencia y mantiene todos los campos en blanco y enmascarados. Un cambio exige confirmación y una allowlist cerrada; el agente escribe el parche en un temporal privado, lo transfiere por IAP mediante scripts versionados de Galerazo, conserva campos omitidos, elimina temporales y nunca incluye valores en argumentos, jobs, respuestas o logs. El cambio no reinicia ni despliega el bot.
- Motivo: permitir rotación remota desde el Control Center sin convertir el dashboard en un lector de secretos ni acoplar configuración y deploy.

## D-015 - Seguimiento de la ventana real del navegador

- Estado: vigente; amplía D-007.
- Fecha: 2026-07-21.
- Decisión: el launcher no toma la vida del proceso inicial de Edge o Chrome como equivalente a la vida de la ventana. Después de abrir el modo app, busca la ventana titulada Bot Control Center entre los procesos del navegador, la incorpora al Job Object cuando es posible y supervisa ese proceso hasta que la ventana desaparece.
- Motivo: Chromium puede entregar el arranque a otro proceso del perfil aislado y terminar inmediatamente el proceso creado, lo que antes generaba un falso error aunque UI y agente hubieran iniciado correctamente.

## D-016 - Cobertura automática del agente privilegiado

- Estado: vigente.
- Fecha: 2026-07-22.
- Decisión: usar la cobertura V8 incorporada en Node para instrumentar `agent/**/*.mjs`, con umbrales mínimos de 95% de líneas, 90% de ramas y 95% de funciones. Mantener `test:unit` como suite rápida y `npm test` como validación completa con build, render, agente y launcher.
- Motivo: medir automáticamente la lógica operativa y sus guardrails sin incorporar otra dependencia, evitando que una regresión reduzca la cobertura crítica de forma silenciosa.

## D-017 - Umbral total para la cobertura del agente

- Estado: vigente; reemplaza los umbrales de D-016.
- Fecha: 2026-07-22.
- Decisión: exigir 100% de líneas, ramas y funciones en `agent/**/*.mjs`. Mantener casos explícitos para plataformas, entrada CLI, señales, cuerpos HTTP y errores, sin exclusiones de cobertura.
- Motivo: la lógica privilegiada alcanzó cobertura total con pruebas de comportamiento reales y el umbral debe impedir cualquier regresión futura.

## D-018 - Contrato operativo efímero para Galerazo

- Estado: vigente; amplía D-003, D-005 y D-011, y reemplaza el uso de fixtures de Galerazo para estado, logs y triggers.
- Fecha: 2026-07-22.
- Decisión: el agente copia por IAP un `botctl.py` versionado y de vida corta, ejecuta únicamente acciones enumeradas y elimina el temporal. Las lecturas devuelven estado de VM/contenedor, health, reinicios, imagen, recursos, Telegram, logs y triggers reales; un fallo se presenta como error y nunca se completa con datos inventados. La detención confirmada usa `docker compose stop bot`, sin `down` ni borrado, y la moderación vuelve a validar los identificadores contra SQLite antes de modificar datos y avisar al chat.
- Motivo: obtener visibilidad y cortar bucles de reinicio sin exponer puertos administrativos, tokens, una shell libre ni una operación destructiva sobre producción.

## D-019 - Prohibición de fixtures operativos en toda la flota

- Estado: vigente; reemplaza D-002 y D-011 únicamente en lo relativo a datos y moderación demo, y amplía D-008.
- Fecha: 2026-07-22.
- Decisión: métricas, versiones, commits, logs, SQL, triggers y multimedia sólo pueden provenir de un adaptador real. Un bot sin destino/adaptador queda `Sin conexión`; una capacidad de triggers ausente muestra `No hay triggers disponibles`; un fallo remoto se muestra como error. El registro conserva sólo identidad y capacidades efectivamente conectadas. Los bots personalizados se crean vacíos y los registros antiguos de `localStorage` se reconstruyen sin colecciones operativas.
- Motivo: impedir que un dato ilustrativo pueda confundirse con el estado real de un bot o de producción.

## D-020 - Actualización de seguridad validada y overrides transitivos acotados

- Estado: vigente.
- Fecha: 2026-07-26.
- Decisión: fijar Next y `eslint-config-next` en 16.2.12, React/RSC en 19.2.8 y actualizar las piezas compatibles del toolchain Vite/Cloudflare. Como Next 16.2.12 todavía declara PostCSS 8.4.31 y Sharp 0.34.x, usar overrides explícitos a PostCSS 8.5.23 y Sharp 0.35.3. Exigir `npm audit --omit=dev`, instalación limpia, lint, build, suite y cobertura antes de publicar. No forzar ESLint 10 ni reemplazar globalmente `brace-expansion` mientras los plugins de `eslint-config-next` no sean compatibles.
- Motivo: eliminar las vulnerabilidades de la aplicación distribuida sin aceptar el downgrade erróneo de `npm audit fix --force`, romper el lint ni ocultar la deuda exclusivamente dev del preset upstream.

## D-021 - Reinicio y recreación son operaciones diferentes

- Estado: vigente.
- Fecha: 2026-07-26.
- Decisión: no presentar `docker compose restart bot` como mecanismo para aplicar credenciales. Galerazo declara `/etc/galerazo/bot.env` mediante `env_file`, por lo que el entorno se fija al crear el contenedor. Un futuro control `restart` sólo reiniciará el proceso existente; aplicar secretos requerirá un deploy o una acción `recreate` separada, confirmada y seguida de healthcheck.
- Motivo: evitar que la interfaz informe que una rotación de secretos está activa cuando el contenedor todavía conserva los valores anteriores.

## D-022 - Reducir ruido de polling sin ocultar fallos

- Estado: vigente.
- Fecha: 2026-07-29.
- Decisión: filtrar en el adaptador local de Bot Control Center únicamente las líneas de Telegram `getUpdates` cuyo resultado sea `HTTP 200 OK`, sin cambiar el logging de Galerazo. Mantener visibles respuestas no exitosas, timeouts, excepciones y las demás llamadas HTTP.
- Motivo: los polls correctos son repetitivos y desplazan señales operativas importantes, mientras que sus fallos sí son relevantes para diagnóstico.

## D-023 - Icono nativo compartido con la ventana del navegador

- Estado: vigente; amplía D-007 y D-015.
- Fecha: 2026-07-29.
- Decisión: conservar un único icono embebido en `BotControlCenter.exe` para el acceso de CODEX APPS y, después de detectar el HWND real de la ventana Edge/Chrome, asignarlo como icono grande y pequeño mediante `WM_SETICON`. Mantener la instancia de `Icon` viva mientras el launcher sea dueño de la ventana.
- Motivo: el modo `--app` del navegador puede mostrar su propio icono en la barra de tareas aunque el acceso directo tenga icono personalizado; aplicarlo sobre la ventana garantiza una identidad visual coherente.

## D-024 - Favicon real y reaplicación persistente del icono

- Estado: vigente; reemplaza D-023.
- Fecha: 2026-07-29.
- Decisión: generar `public/favicon.ico` desde el mismo recurso que se embebe en `BotControlCenter.exe`, declararlo con versión en metadata y manifest, y comprobar `WM_GETICON` durante todo el ciclo de vida de la ventana. Si Edge/Chrome sustituye el handle grande o pequeño, el launcher vuelve a aplicar el icono inmediatamente.
- Motivo: la captura del usuario demostró que una única llamada a `WM_SETICON` podía dar un falso positivo inicial y ser reemplazada después por Edge; la identidad web y la supervisión persistente cubren ambas fuentes del icono.

## D-025 - Identidad propia para el grupo de la barra de tareas

- Estado: vigente; complementa y reemplaza el alcance de D-024 para la barra de tareas.
- Fecha: 2026-07-29.
- Decisión: establecer sobre el HWND de Edge/Chrome `System.AppUserModel.RelaunchIconResource`, `RelaunchCommand` y, al final, un `System.AppUserModel.ID` exclusivo mediante `SHGetPropertyStoreForWindow`; conservar favicon/manifest y `WM_GETICON`/`WM_SETICON` como capas complementarias.
- Motivo: Windows puede tomar el icono del grupo de la barra de tareas de la identidad de la aplicación anfitriona aunque el HWND ya tenga un icono personalizado. La identidad explícita separa Bot Control Center de Edge y el recurso de relanzamiento determina el icono de ese grupo.

## D-026 - Releases programados sobre un commit inmutable

- Estado: vigente; amplía D-013.
- Fecha: 2026-08-09.
- Decisión: cada release mensual se ejecuta desde una tarea local independiente de la UI. Antes de publicar adquiere un lock por bot compartido con las acciones manuales, exige un árbol Git limpio, hace fetch del remoto y acepta únicamente ramas alineadas por fast-forward. Si el commit local está adelantado, sube ese hash exacto sin `force`; si el remoto está adelantado, usa el hash remoto sin modificar el worktree vivo. El build y el deploy se ejecutan desde un worktree detached del hash fijado. Un tag ya publicado produce un no-op; cambios sin commit, divergencias o concurrencia posponen el corte y habilitan reintentos.
- Motivo: automatizar releases sin mezclar ediciones que aparecen durante el build, sobrescribir cambios remotos ni publicar trabajo incompleto o secretos accidentales.

## D-027 - Override acotado de Nanoid

- Estado: vigente; amplía D-020.
- Fecha: 2026-08-09.
- Decisión: fijar Nanoid transitivo en 3.3.17 mediante `overrides`, conservando PostCSS 8.5.23 y Sharp 0.35.3, y validar con `npm audit --omit=dev`, lint, build y tests. No aplicar correcciones forzadas sobre la cadena de herramientas de desarrollo.
- Motivo: la auditoría de producción detectó la vulnerabilidad GHSA-2v37-7h3g-55p8 en Nanoid 3.3.16 a través de PostCSS; 3.3.17 corrige el problema sin cambiar la API ni el resto del toolchain.

## D-028 - Navegacion local de triggers reales

- Estado: vigente.
- Fecha: 2026-08-15.
- Decision: conservar la consulta remota sin parametros y aplicar en la UI paginacion de a 10, busqueda por chat, filtros de tipo/fecha y ordenamiento sobre el conjunto ya recibido.
- Motivo: mejorar la exploracion sin ampliar el contrato privilegiado ni sumar consultas remotas hasta que el volumen real justifique paginacion en el origen.

## D-029 - Repositorio publico con CI de calidad

- Estado: vigente; reemplaza D-010 respecto de la visibilidad observada y complementa D-016/D-017.
- Fecha: 2026-08-15.
- Decision: registrar la visibilidad publica actual de GitHub y ejecutar en un unico workflow rapido lint, build, tests, cobertura con umbrales del 100% para el agente y auditoria de produccion, con cache, cancelacion y timeout.
- Motivo: reconciliar la memoria con el estado real del remoto y proteger la rama publica sin duplicar trabajos costosos.

## D-030 - Actualizacion del override de Nanoid

- Estado: vigente; reemplaza D-027.
- Fecha: 2026-08-15.
- Decision: elevar el override transitivo de Nanoid a 3.3.18 y mantener PostCSS 8.5.23 y Sharp 0.35.3.
- Motivo: la auditoria de produccion actualizada considera vulnerables las versiones de Nanoid anteriores a 3.3.18; la nueva fijacion deja `npm audit --omit=dev` en cero sin forzar cambios incompatibles del toolchain.
