# TODO

- [P1] [BLOCKED: requiere diseñar un contrato de consultas de solo lectura con allowlist, límites y auditoría; no es necesario para el estado ni los triggers ya conectados] Integrar SQL real de Galerazo.
- [P2] [BLOCKED: reinicio y otras escrituras siguen requiriendo autorización y un modelo específico; ya existe una detención segura y confirmada para cortar bucles] Evaluar reinicio y otras capacidades privilegiadas.
- [P3] [BLOCKED: depende de una versión estable compatible de Next/PostCSS] Resolver los dos avisos moderados transitivos de `npm audit --omit=dev` sin downgrade forzado.

# IN PROGRESS

No hay tareas en curso.

# DONE

- [2026-07-22] Reemplazar los triggers y el estado demo de Galerazo por datos reales leídos por IAP: VM/contenedor, health, reinicios, imagen, logs/errores, Telegram, CPU/RAM/disco/SQLite y seis triggers reales con multimedia bajo demanda; agregar alertas, actualización manual, detención segura con `docker compose stop`, moderación remota y feedback visible de `Verificar`. Validación: 34/34 pruebas, lint y build OK; agente con 100% de líneas, ramas y funciones. La inspección real confirmó VM `running`, contenedor `running/healthy`, un reinicio total, cero reinicios recientes, Telegram conectado y seis triggers (cuatro con multimedia y dos de texto), sin ejecutar mutaciones de producción.

- [2026-07-22] Elevar líneas, ramas y funciones del agente a 100% con casos reales de plataforma, entrada CLI, señales, HTTP, errores y logs parciales; fijar los tres umbrales en 100%. Validación: cobertura total, lint, build y 30 pruebas OK.
- [2026-07-22] Incorporar cobertura V8 automática con umbrales, comandos rápido/completo y 11 pruebas nuevas para validaciones, credenciales, jobs, CORS y rutas del agente. Resultado: 99,41% líneas, 96,91% ramas, 96% funciones; lint, build y 28 pruebas OK.
- [2026-07-22] Mejorar la legibilidad de Destino y Pre-flight en Deploy, dar más espacio a Última imagen y aumentar la jerarquía del botón principal. Validación: lint, build y 17 pruebas OK.
- [2026-07-21] Corregir, recompilar e instalar el launcher para seguir la ventana real cuando Edge deriva el arranque; validar dos aperturas consecutivas y el apagado de UI/agente al cerrar.
- [2026-07-20] Implementar configuración remota de credenciales de Galerazo: estado booleano sin lectura de valores, campos enmascarados, parches parciales y temporales privados por IAP, confirmación, auditoría y limpieza. Configurar `runtime.local.json`, validar lectura y no-op real contra `galerazo-prod`, revisar visualmente la UI y confirmar que triggers sigue operativo. Validación: lint, build y 17 pruebas OK.
- [2026-07-20] Integrar un deploy de Galerazo de una sola acción en Bot Control Center mediante un agente local, con publicación, deploy, rollback, confirmación, pre-flight y logs saneados; actualizar el launcher para administrar ambos procesos.
- [2026-07-20] Ampliar el visualizador de triggers para texto, imágenes, GIF y stickers estáticos/animados WebP/WebM/TGS, con reproducción local y descarga del original.
- [2026-07-20] Incorporar un visualizador multimedia genérico de triggers con autor y chat, reproducción/descarga, eliminación, bloqueo, acción combinada, confirmación y avisos auditados en modo local; extender el contrato remoto.
- [2026-07-20] Crear el repositorio privado `ldebortoli/bot-control-center`, configurar `origin` y publicar la rama `main`.
- [2026-07-20] Agregar administración persistente para activar, quitar y registrar bots; dejar Reshare Stories disponible pero fuera de la flota inicial.
- [2026-07-20] Mostrar feedback inmediato durante el primer arranque y aumentar la legibilidad tipográfica sin escalar el layout.
- [2026-07-20] Crear e instalar el acceso `Bot Control Center` en `CODEX APPS`, con launcher nativo, ventana aislada, icono propio y apagado verificado de todo el árbol del servidor al cerrar.
- [2026-07-20] Inicializar la memoria persistente del proyecto.
- [2026-07-20] Crear la primera versión local de Bot Control Center con selector multi-bot, métricas, logs filtrables, triggers, consola SQL demo, registro declarativo, política de lectura y contrato de transportes.
- [2026-07-20] Documentar la arquitectura y el futuro enlace seguro de Galerazo mediante Google Cloud IAP/SSH.
- [2026-07-20] Agregar scripts multiplataforma, imagen social, pruebas de render, lint y build verificados.
