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
