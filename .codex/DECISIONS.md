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
