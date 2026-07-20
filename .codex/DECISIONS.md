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
