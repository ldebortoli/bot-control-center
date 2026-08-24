# Bot Control Center

Dashboard local para observar varios bots remotos desde una sola interfaz. Galerazo integra estado operativo, logs, triggers, multimedia, moderación, deploy y configuración segura de credenciales mediante Google Cloud IAP/SSH. Ningún bot muestra fixtures: si falta un adaptador o la conexión falla, la interfaz lo informa explícitamente.

## Qué incluye

- selector de bots y estado general de la flota;
- estado real de VM/contenedor, healthcheck, reinicios, imagen, Telegram, CPU, RAM, disco y SQLite;
- últimos logs y errores obtenidos desde el adaptador remoto, omitiendo únicamente los polls rutinarios `getUpdates` que terminaron en `HTTP 200 OK`;
- visualizador genérico de triggers con texto, imágenes, GIF, stickers, audio/video, autor, chat, filtros, paginación de a 10 y auditoría de moderación;
- estado explícito cuando SQL, triggers u otra capacidad real no están configurados;
- publicación y deploy controlado de Galerazo en Google Compute Engine, con logs y rollback;
- releases mensuales configurables que fijan un commit, publican sólo cambios confirmados y continúan aunque la UI esté cerrada;
- registro declarativo y contrato de transporte extensible;
- diseño responsive, sin guardar credenciales en el navegador ni en Git.

## Ejecutar en Windows, macOS o Linux

Requiere Node.js 22.13 o superior.

```bash
npm install
npm run dev:full
```

Abrir `http://localhost:3000`. Para validar el proyecto:

```bash
npm test
npm run lint
```

`npm run dev:full` inicia la UI y el agente privilegiado local. `npm run dev` sigue disponible para trabajar sólo en la interfaz, pero la vista Deploy quedará desconectada. Los scripts de desarrollo y build son multiplataforma; no necesitan declarar variables de entorno con sintaxis específica de Bash o PowerShell.

### Pruebas y cobertura

Los comandos de calidad generan y evalúan el resultado automáticamente:

```bash
npm run test:unit      # suite rápida, sin build
npm run test:coverage  # tests del agente y tabla de cobertura V8
npm test               # build y suite completa
npm audit --omit=dev   # dependencias que llegan a producción
```

`test:coverage` usa el motor incorporado en Node.js, muestra porcentajes por archivo y falla si el agente privilegiado baja de 100% en líneas, ramas o funciones. El alcance instrumentado es `agent/**/*.mjs`, donde viven la API local, la validación de configuración, los guardrails de credenciales y los jobs operativos. La interfaz, el launcher y el render continúan cubiertos por el build y las pruebas de integración de la suite completa.

GitHub Actions ejecuta en cada push y pull request contra `main` una única verificación rápida con caché de npm, cancelación de ejecuciones reemplazadas y un timeout de 15 minutos: lint, build, suite unitaria, cobertura y auditoría de dependencias de producción.

Next está fijado en 16.2.12 y el proyecto sustituye sus versiones transitivas vulnerables de Nanoid, PostCSS y Sharp mediante overrides explícitos. La auditoría de producción debe permanecer en cero. El audit completo puede seguir mostrando avisos dentro de las herramientas de lint de `eslint-config-next`; no se usa `npm audit fix --force` mientras ese preset mantenga plugins incompatibles con ESLint 10.

## Abrir como aplicación de Windows

El acceso `Bot Control Center` de la carpeta `CODEX APPS` muestra inmediatamente el estado de inicio, levanta la UI y el agente en segundo plano y abre el dashboard en una ventana independiente. El mismo recurso `.ico` se usa como icono embebido, favicon y manifest web. El launcher también asigna a la ventana una identidad propia de Windows (`AppUserModelID`) y un recurso de relanzamiento, para que la barra de tareas no la agrupe con el icono de Edge; durante toda la sesión reaplica el icono si el navegador intenta sustituirlo. Al cerrar la ventana, termina automáticamente el árbol completo. Si hay un release activo, muestra una espera y deja que termine antes de apagarlo para no cortar un push o deploy a mitad de camino.

Para compilar o reinstalar el acceso:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-codex-app.ps1
```

Los registros locales del launcher quedan en `%LOCALAPPDATA%\BotControlCenter\logs` y no se guardan en el repositorio.

## Estado de seguridad

Para Galerazo, estado, logs, triggers, multimedia, moderación, deploy y credenciales son integraciones reales. SQL permanece deshabilitado hasta implementar su contrato de solo lectura. Un agente Node escucha exclusivamente en `127.0.0.1:43121`, valida el origen local y sólo puede ejecutar scripts versionados de Galerazo. No acepta comandos arbitrarios ni almacena tokens; reutiliza la sesión local de `gcloud`.

Spider Tracker, Reshare Stories y cualquier bot agregado localmente se muestran como **Sin conexión** hasta registrar un destino y un adaptador real. Sus pantallas no incluyen métricas, versiones, logs, SQL ni triggers de ejemplo. Los registros personalizados guardados por versiones anteriores se normalizan automáticamente para eliminar datos operativos locales.

## Configurar el deploy de Galerazo

Primero completá la preparación de Google Compute Engine indicada en `Galerazobot/docs/DEPLOY_GCE.md`, instalá Docker Desktop y Google Cloud CLI, y verificá manualmente el acceso por IAP. Después:

```powershell
Copy-Item config\runtime.example.json config\runtime.local.json
```

Editá `config/runtime.local.json` con la ruta local del repositorio Galerazo, proyecto, región, repositorio, zona e instancia. El archivo está ignorado por Git y no debe contener tokens, claves ni el contenido de `.env`.

La vista **Credenciales** usa ese mismo destino para consultar únicamente si cada variable está presente y aplicar parches parciales por IAP. Los campos quedan en blanco y enmascarados: vacío conserva el valor remoto, mientras que **Borrar** elimina sólo campos opcionales. El agente crea un archivo temporal privado, ejecuta scripts fijos del repositorio Galerazo y lo elimina al finalizar; ni la API, los jobs ni los logs conservan los valores enviados. Como Compose carga `/etc/galerazo/bot.env` al crear el contenedor, un `restart` común conserva el entorno anterior: los cambios toman efecto con un deploy o una recreación explícita.

Al abrir la vista **Deploy**, el pre-flight verifica PowerShell, Git, Docker, `gcloud`, el repositorio y los scripts. Los controles son:

- **Publicar y deployar**: ejecuta los tests Docker, construye la imagen, la publica con un tag de commit y actualiza la VM;
- **Deployar última imagen**: reutiliza `deploy/out/last-image.txt` sin reconstruir;
- **Rollback**: restaura la imagen anterior registrada en la VM.

Cada acción pide confirmación, admite una sola operación activa por bot y muestra la salida saneada. El script remoto de Galerazo crea un backup y revierte automáticamente si el contenedor nuevo no queda healthy.

### Releases mensuales seguros

La vista **Deploy** permite activar un corte mensual por bot, elegir día (1 a 28) y hora local, decidir si antes se buscan actualizaciones estables de librerías, ver la última ejecución y lanzar el mismo flujo manualmente con **Ejecutar corte seguro ahora**. La programación se instala como una tarea de Windows independiente de la UI; por eso puede ejecutarse con Bot Control Center cerrado. Si el equipo estaba apagado, Windows intenta iniciar la tarea cuando vuelva a estar disponible y reintenta hasta 12 veces con una hora de separación.

El corte exige un árbol Git limpio, sincroniza el remoto configurado y fija la base en un `git worktree` temporal desacoplado: cualquier commit o edición que aparezca durante el build queda para el ciclo siguiente. Cuando la actualización de librerías está habilitada, exige Python Launcher (`py`) y ejecuta el actualizador versionado del bot dentro de ese worktree. Si no cambia el lock, no crea ningún commit; si cambia, exige que el único archivo modificado sea `requirements.txt`, ejecuta las validaciones nativas y Docker, crea un commit acotado y lo sube mediante un push sin `force`. Recién después compara el hash final con la última imagen publicada. Si no hay cambios de código ni de dependencias, termina sin reconstruir ni tocar producción. Si falla una validación, la rama diverge, hay archivos locales sin commit, aparece un archivo inesperado o existe otra operación activa, el release se pospone en lugar de pisar trabajo o desplegar una actualización rota.

La configuración de Galerazo queda localmente en `config/runtime.local.json`, que está ignorado por Git. La tarea instalada se puede inspeccionar en el Programador de tareas con el nombre `Bot Control Center - Release - galerazo`. Para un release programado deben estar disponibles la sesión local de `gcloud`, Docker Desktop y el repositorio; los errores y el último resultado quedan visibles en el panel.

Las vistas **Resumen**, **Logs** y **Deploy** incluyen el estado remoto actualizado bajo demanda: running/stopped, healthy/unhealthy, reinicios totales y recientes, imagen desplegada, conectividad con Telegram, CPU/RAM/disco, tamaño de SQLite y los últimos logs/errores. Si se detecta un bucle, **Detener contenedor** ejecuta únicamente `docker compose stop bot`; conserva base, imagen, secretos y Compose para poder corregir y reintentar el deploy. **Verificar** muestra progreso, hora y cantidad de requisitos listos o un error explícito.

## Visualizar y moderar triggers

Cualquier bot que declare y tenga configurada la capacidad real `triggers` muestra una biblioteca con su contenido, archivo multimedia, usuario creador y chat de origen. La biblioteca muestra 10 elementos por página y permite buscar por ID o nombre de chat, filtrar por tipo y rango de fechas, y ordenar por fecha, nombre o chat. El panel admite texto; imágenes PNG, JPEG, WebP y GIF; stickers estáticos WebP/PNG; stickers animados WebM y TGS; además de audio y video. Todo archivo se puede descargar, y los formatos animados se reproducen dentro de la aplicación. Si el bot no declara esa capacidad, la vista dice **No hay triggers disponibles**; si la declara pero falla la lectura, muestra el error de conexión.

En Galerazo la lista se lee directamente de SQLite por IAP; si la VM o el bot no son accesibles se muestra un error de conexión y nunca se sustituyen los datos por fixtures. Los archivos se obtienen desde Telegram bajo demanda mediante el token que permanece en la VM.

Las acciones **Eliminar trigger**, **Bloquear usuario** y **Eliminar y bloquear** siempre piden confirmación. Galerazo vuelve a resolver autor y chat desde SQLite, aplica la acción y envía una advertencia al mismo chat. El resultado informa por separado eliminación, bloqueo y aviso para que un fallo parcial nunca se presente como éxito total.

## Administrar la flota

El botón **Administrar flota** permite quitar bots del panel, volver a agregar bots disponibles y registrar nuevos bots locales indicando un nombre y el transporte previsto. Reshare Stories está disponible en el catálogo, pero queda fuera de la flota inicial.

La selección se conserva localmente en el perfil de la aplicación. Registrar un bot no establece una conexión ni almacena credenciales: el nuevo bot queda desconectado hasta configurar su adaptador remoto.

La integración real mantendrá estas reglas:

- el dashboard escucha solo en `localhost`;
- no se publica SQLite ni un puerto administrativo en Internet;
- el acceso remoto usa Google Cloud IAP/SSH o SSH con alias conocido;
- cada bot expone un comando remoto `botctl` con respuestas JSON normalizadas;
- SQLite se abre con `mode=ro` y `PRAGMA query_only=ON`;
- la API vuelve a validar SQL, limita tiempo y cantidad de filas;
- la moderación de triggers usa permisos separados, confirmación y auditoría;
- el deploy usa un agente y permisos distintos de observación; la única detención operativa expuesta es `docker compose stop`, explícita y no destructiva.

## Conexión de Galerazo

`config/runtime.local.json` selecciona proyecto, zona, instancia y repositorio local. El agente invoca `scripts/deploy/Invoke-GceBotctl.ps1`, que copia temporalmente el contrato versionado `deploy/gce/botctl.py` por IAP. No instala un daemon ni abre puertos remotos. SQL seguirá fuera del panel hasta agregar una consulta allowlisted y de solo lectura.

No guardar tokens, claves SSH, rutas sensibles ni copias de la base en el repositorio. La arquitectura completa está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Estructura principal

```text
app/                         interfaz y navegación
agent/                       API local, validación y jobs de deploy
config/bots.example.json     registro sin secretos
config/runtime.example.json  destino GCP local sin credenciales
lib/control-center/          tipos, registro sin fixtures y políticas
docs/ARCHITECTURE.md         diseño de la integración remota
scripts/run-local.mjs        ciclo de vida conjunto de UI y agente
scripts/run-vinext.mjs       ejecución multiplataforma
tests/                       validación del render y guardrails
```

## Despliegue

El Control Center no está publicado y el agente de deploy no debe exponerse. La UI puede evaluarse por separado en un hosting, pero las acciones operativas seguirán requiriendo el agente local y un modelo de autenticación explícito.
