# Session handoff

## Objetivo general

Mantener un dashboard local multi-bot y conectar cada servicio remoto mediante capacidades y transportes de privilegio mínimo.

## Estado actual

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
- Agente local funcional en `127.0.0.1:43121`; ejecuta exclusivamente scripts versionados de credenciales, publicación, deploy y rollback con argumentos validados y `shell: false`.
- `config/runtime.local.json` está ignorado, no contiene secretos y apunta a `bot-fleet-production`, `us-central1-a`, `galerazo-prod` y el repositorio local Galerazo.
- Visualizador genérico de triggers funcional: muestra autor, chat, fecha y respuesta; admite texto, imágenes PNG/JPEG/WebP/GIF, stickers WebP/PNG/WebM/TGS, audio, video y archivos, con reproducción y descarga dentro de la aplicación. En Galerazo, lista y medios son remotos y reales; los demás bots demo conservan fixtures locales.
- Los TGS se descomprimen en memoria y se reproducen con `lottie-web` light; la demostración genera ejemplos locales sin depender de archivos externos.
- Moderación remota funcional para Galerazo con confirmación para eliminar, bloquear o combinar ambas acciones; vuelve a resolver trigger, chat y usuario en SQLite, registra el bloqueo global del bot y envía una advertencia al chat. Los bots demo conservan la simulación local.
- Administrador de flota funcional: activa, quita y registra bots locales; persiste la selección sin guardar credenciales.
- Flota inicial con Galerazo Bot y Spider Tracker; Reshare Stories está disponible para agregar, pero inactivo por defecto.
- El launcher muestra progreso mientras inicia vinext y el agente; espera un job operativo activo antes de apagar y mata el árbol completo al terminar.
- Dos aperturas consecutivas del launcher corregido mostraron la ventana en 9,56 s y 8,05 s; en ambas, cerrar la ventana terminó el launcher y liberó los puertos 3000 y 43121.
- Acceso instalado en `C:\Users\calei\Documents\Codex\CODEX APPS\Bot Control Center.lnk`; abre una ventana de aplicación aislada y apaga automáticamente el árbol completo del servidor al cerrarse.
- Launcher reproducible desde `scripts/install-codex-app.ps1`, con ejecutable en `bin/BotControlCenter.exe` y registros locales fuera del repositorio.
- Catálogo demo con Galerazo, Spider Tracker y Reshare Stories, más registros locales personalizados.
- Vistas funcionales: Resumen, Logs, Triggers, Credenciales y Deploy; SQL permanece demostrativo y no se anuncia como capacidad real de Galerazo.
- Galerazo usa un `botctl` versionado y temporal por IAP para estado, triggers, multimedia, moderación y detención. No abre puertos administrativos, no acepta comandos libres y nunca devuelve el token de Telegram.
- `npm run lint`, `npm run build`, `npm run test:coverage` y `npm test` pasan en Windows; la suite completa tiene 34 pruebas y la cobertura del agente es 100% en líneas, ramas y funciones.
- La dependencia de producción mantiene dos avisos moderados transitivos de PostCSS dentro de Next; no hay fix estable compatible y no se forzó downgrade.
- Repositorio privado publicado en `https://github.com/ldebortoli/bot-control-center`; `origin` apunta a ese repositorio y `main` sigue `origin/main`.

## Próximo paso exacto

Abrir Bot Control Center desde CODEX APPS y usar `Actualizar estado` o `Verificar` cuando se quiera una lectura nueva. No queda una acción de implementación pendiente para este pedido.

## Riesgos y guardrails

- No guardar credenciales, tokens, bases ni logs en Git.
- No exponer SQLite, SSH ni la UI en una IP pública.
- No agregar acciones mutables bajo los permisos de observación.
- El agente de deploy nunca debe escuchar fuera de `127.0.0.1`, aceptar comandos libres ni guardar credenciales.
- No interrumpir automáticamente un push/deploy activo al cambiar de vista o cerrar normalmente la ventana; el launcher muestra una espera antes de apagar.
- Exigir confirmación, auditoría y resultado explícito del aviso al chat para toda moderación remota de triggers.
- Cerrar cualquier servidor de desarrollo iniciado por Codex antes de terminar la sesión.
