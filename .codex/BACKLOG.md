# TODO

- [P1] [BLOCKED: requiere diseñar un contrato de consultas de solo lectura con allowlist, límites y auditoría; no es necesario para el estado ni los triggers ya conectados] Integrar SQL real de Galerazo.
- [P2] [BLOCKED: pendiente de que el usuario elija el alcance; se recomienda habilitar `start` y `restart` del contenedor `bot`, y evaluar por separado `recreate` para aplicar secretos, siempre con confirmación, exclusión mutua, auditoría y healthcheck posterior; mantener fuera reinicio de Docker/VM, shell y borrados] Evaluar reinicio y otras capacidades privilegiadas.

# IN PROGRESS

No hay tareas en curso.

# DONE

- [2026-07-29] Corregir el falso positivo del icono anterior: generar un favicon byte por byte idéntico al recurso de CODEX APPS, declararlo en metadata y manifest, asignar a la ventana un `AppUserModelID` y recurso de relanzamiento propios para separarla del grupo de Edge, y revertir cualquier reemplazo posterior mediante `WM_GETICON`/`WM_SETICON`. El acceso fue recompilado e instalado. Validación: compilación nativa, hashes SHA-256 idénticos, favicon y manifest presentes en el HTML construido, lint, build y 34/34 pruebas OK, cobertura del agente 100%, audit de producción en 0 y cierre con cero operaciones activas/listeners. La captura visual automática no pudo completarse porque el controlador de Windows no pudo determinar con confianza la URL del navegador; no se repitió ese mecanismo.

- [2026-07-29] Aplicar al HWND de la ventana Edge/Chrome el mismo icono embebido de `BotControlCenter.exe`, recompilar e instalar nuevamente el acceso de CODEX APPS. Verificación nativa: `WM_GETICON` devolvió un bitmap con hash idéntico al icono del launcher; cerrar la ventana terminó el launcher y dejó libres los puertos 3000 y 43121. Validación: lint, build y 34/34 pruebas OK; cobertura del agente 100%; audit de producción en 0.

- [2026-07-29] Filtrar en el adaptador local los logs rutinarios de Telegram `getUpdates` que terminan en `HTTP 200 OK`, conservando `429`, timeouts, errores y otras llamadas HTTP. No se modificó Galerazobot. Validación: lint, build y 34/34 pruebas OK; cobertura del agente 100% en líneas, ramas y funciones; audit de producción en 0.

- [2026-07-26] Actualizar Next y `eslint-config-next` de 16.2.6 a 16.2.12, React/RSC a 19.2.8 y el toolchain compatible de Vite/Cloudflare; fijar PostCSS 8.5.23 y Sharp 0.35.3 para sustituir las versiones transitivas vulnerables de Next. Validación: `npm ci`, lint, build y 34/34 pruebas OK; cobertura del agente 100% en líneas, ramas y funciones; `npm audit --omit=dev` en 0. El audit completo conserva nueve avisos altos sólo en la cadena de lint de `eslint-config-next` porque sus plugins todavía requieren `minimatch` 3/`brace-expansion` 1 y no aceptan ESLint 10; el intento de override incompatible se descartó al fallar lint.

- [2026-07-22] Eliminar todos los fixtures operativos del catálogo y del visor multimedia. Resumen y Logs consultan siempre el adaptador real; un destino ausente o inaccesible muestra `Sin conexión con el bot`. Triggers sólo consulta una capacidad realmente configurada y, en caso contrario, muestra `No hay triggers disponibles`; SQL tampoco presenta resultados de ejemplo. Spider Tracker, Reshare Stories y bots personalizados quedan desconectados con colecciones operativas inexistentes, y los registros antiguos de `localStorage` se sanean al cargarse. Validación: 34/34 pruebas, lint y build OK; agente con 100% de líneas, ramas y funciones.

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
