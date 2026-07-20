# TODO

- [P1] [BLOCKED: requiere que el usuario configure proyecto, zona e instancia de Google Cloud y habilite acceso IAP/SSH] Integrar Galerazo Bot real mediante el adaptador `gcp-iap` y reemplazar sus datos demo.
- [P1] [BLOCKED: requiere implementar y desplegar en Galerazo el contrato remoto acordado] Crear `botctl` de solo lectura para health, logs, triggers list y query.
- [P2] [BLOCKED: requiere autorización explícita futura y un modelo de permisos/auditoría] Evaluar reinicio, deploy y modificación de triggers como capacidades privilegiadas.
- [P3] [BLOCKED: depende de una versión estable compatible de Next/PostCSS] Resolver los dos avisos moderados transitivos de `npm audit --omit=dev` sin downgrade forzado.

# IN PROGRESS

No hay tareas en curso.

# DONE

- [2026-07-20] Crear el repositorio privado `ldebortoli/bot-control-center`, configurar `origin` y publicar la rama `main`.
- [2026-07-20] Agregar administración persistente para activar, quitar y registrar bots; dejar Reshare Stories disponible pero fuera de la flota inicial.
- [2026-07-20] Mostrar feedback inmediato durante el primer arranque y aumentar la legibilidad tipográfica sin escalar el layout.
- [2026-07-20] Crear e instalar el acceso `Bot Control Center` en `CODEX APPS`, con launcher nativo, ventana aislada, icono propio y apagado verificado de todo el árbol del servidor al cerrar.
- [2026-07-20] Inicializar la memoria persistente del proyecto.
- [2026-07-20] Crear la primera versión local de Bot Control Center con selector multi-bot, métricas, logs filtrables, triggers, consola SQL demo, registro declarativo, política de lectura y contrato de transportes.
- [2026-07-20] Documentar la arquitectura y el futuro enlace seguro de Galerazo mediante Google Cloud IAP/SSH.
- [2026-07-20] Agregar scripts multiplataforma, imagen social, pruebas de render, lint y build verificados.
