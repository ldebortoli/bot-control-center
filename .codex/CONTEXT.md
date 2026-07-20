# Bot Control Center - Contexto del proyecto

## Descripción general

Dashboard local y extensible para observar una flota de bots remotos desde una interfaz común. La primera versión usa datos demo y prepara la futura conexión de Galerazo Bot mediante Google Cloud IAP/SSH, sin publicar bases, puertos administrativos ni credenciales.

## Estado estable

- Ruta: `C:\Users\calei\Documents\Codex\BotControlCenter\dashboard`
- Stack: Node.js 22+, TypeScript, React 19, Next 16 y vinext/Vite para Cloudflare Sites.
- Git: repositorio local en rama `main`; no tiene remoto configurado.
- Idioma de la interfaz y documentación: español.
- Hosting: no desplegado; `.openai/hosting.json` mantiene D1 y R2 desactivados.
- Datos: exclusivamente demostrativos hasta configurar un adaptador real.
- Flota inicial: Galerazo Bot y Spider Tracker; Reshare Stories permanece en el catálogo local, inactivo por defecto.

## Arquitectura

- `app/`: interfaz de selector de bots, resumen, logs, triggers y SQL.
- `lib/control-center/`: tipos, registro demo, política SQL y contrato de transporte.
- `config/bots.example.json`: ejemplo declarativo sin secretos; `bots.local.json` está ignorado.
- `docs/ARCHITECTURE.md`: diseño de `botctl`, IAP/SSH y guardrails SQLite.
- `build/` y `worker/`: integración requerida por Sites/vinext.
- `public/og-bot-control-center.png`: imagen social generada para el proyecto.
- `launcher/`, `bin/` y `scripts/*windows-launcher*`: app nativa de Windows que supervisa vinext y abre la UI en una ventana aislada del navegador.
- El administrador de flota activa, quita y registra bots locales; conserva la selección y los registros personalizados en `localStorage`, sin credenciales.

## Ejecución y tests

Comandos verificados en Windows:

- `npm install`
- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm test`

El runner `scripts/run-vinext.mjs` hace que dev/build/start sean multiplataforma.

En Windows también existe el acceso `C:\Users\calei\Documents\Codex\CODEX APPS\Bot Control Center.lnk`. Muestra una ventana de inicio inmediata, inicia el servidor oculto en localhost y lo apaga, junto con todo su árbol de procesos, cuando se cierra la ventana de la aplicación.

## Convenciones y seguridad

- Preservar cambios ajenos y secretos locales.
- Actualizar este archivo solo cuando cambie información estable.
- La memoria persistente vive en `.codex/` y se carga siguiendo `AGENTS.md`.
- El dashboard real debe escuchar en localhost y conectarse por sesiones efímeras IAP/SSH.
- Consultas SQLite reales requieren `mode=ro`, `PRAGMA query_only=ON`, authorizer, timeout y límite de filas.
- Acciones de escritura, restart o deploy no comparten permisos con observación y no forman parte del MVP.
