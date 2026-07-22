# Bot Control Center

Dashboard local para observar varios bots remotos desde una sola interfaz. Galerazo ya integra deploy y configuración segura de credenciales mediante Google Cloud IAP/SSH; las demás vistas continúan con datos de demostración.

## Qué incluye

- selector de bots y estado general de la flota;
- métricas de proceso, versión, host y transporte;
- visor de logs con búsqueda y filtro por nivel;
- visualizador genérico de triggers con texto, imágenes, GIF, stickers, audio/video, autor, chat y auditoría de moderación;
- consola SQLite con validación de consultas de solo lectura;
- publicación y deploy controlado de Galerazo en Google Compute Engine, con logs y rollback;
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
```

`test:coverage` usa el motor incorporado en Node.js, muestra porcentajes por archivo y falla si el agente privilegiado baja de 95% de líneas, 90% de ramas o 95% de funciones. El alcance instrumentado es `agent/**/*.mjs`, donde viven la API local, la validación de configuración, los guardrails de credenciales y los jobs operativos. La interfaz, el launcher y el render continúan cubiertos por el build y las pruebas de integración de la suite completa.

## Abrir como aplicación de Windows

El acceso `Bot Control Center` de la carpeta `CODEX APPS` muestra inmediatamente el estado de inicio, levanta la UI y el agente en segundo plano y abre el dashboard en una ventana independiente. Al cerrar esa ventana, el launcher termina automáticamente el árbol completo. Si hay un release activo, muestra una espera y deja que termine antes de apagarlo para no cortar un push o deploy a mitad de camino.

Para compilar o reinstalar el acceso:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-codex-app.ps1
```

Los registros locales del launcher quedan en `%LOCALAPPDATA%\BotControlCenter\logs` y no se guardan en el repositorio.

## Estado de seguridad

El estado, los logs, SQL y la moderación siguen siendo demostrativos. Las integraciones operativas reales son `deploy` y la configuración de credenciales: un agente Node escucha exclusivamente en `127.0.0.1:43121`, valida el origen local y sólo puede ejecutar scripts versionados de Galerazo. No acepta comandos arbitrarios ni almacena tokens; reutiliza la sesión local de Docker y `gcloud`.

## Configurar el deploy de Galerazo

Primero completá la preparación de Google Compute Engine indicada en `Galerazobot/docs/DEPLOY_GCE.md`, instalá Docker Desktop y Google Cloud CLI, y verificá manualmente el acceso por IAP. Después:

```powershell
Copy-Item config\runtime.example.json config\runtime.local.json
```

Editá `config/runtime.local.json` con la ruta local del repositorio Galerazo, proyecto, región, repositorio, zona e instancia. El archivo está ignorado por Git y no debe contener tokens, claves ni el contenido de `.env`.

La vista **Credenciales** usa ese mismo destino para consultar únicamente si cada variable está presente y aplicar parches parciales por IAP. Los campos quedan en blanco y enmascarados: vacío conserva el valor remoto, mientras que **Borrar** elimina sólo campos opcionales. El agente crea un archivo temporal privado, ejecuta scripts fijos del repositorio Galerazo y lo elimina al finalizar; ni la API, los jobs ni los logs conservan los valores enviados. Los cambios toman efecto en el próximo reinicio o deploy.

Al abrir la vista **Deploy**, el pre-flight verifica PowerShell, Git, Docker, `gcloud`, el repositorio y los scripts. Los controles son:

- **Publicar y deployar**: ejecuta los tests Docker, construye la imagen, la publica con un tag de commit y actualiza la VM;
- **Deployar última imagen**: reutiliza `deploy/out/last-image.txt` sin reconstruir;
- **Rollback**: restaura la imagen anterior registrada en la VM.

Cada acción pide confirmación, admite una sola operación activa por bot y muestra la salida saneada. El script remoto de Galerazo crea un backup y revierte automáticamente si el contenedor nuevo no queda healthy.

## Visualizar y moderar triggers

Cualquier bot que declare la capacidad `triggers` muestra una biblioteca con su contenido, archivo multimedia, usuario creador y chat de origen. El panel admite texto; imágenes PNG, JPEG, WebP y GIF; stickers estáticos WebP/PNG; stickers animados WebM y TGS; además de audio y video. Todo archivo se puede descargar, y los formatos animados se reproducen dentro de la aplicación.

Las acciones **Eliminar trigger**, **Bloquear usuario** y **Eliminar y bloquear** siempre piden confirmación. Cada una genera además una advertencia destinada al mismo chat para que la moderación quede visible. En modo local se conserva un registro demostrativo de esas acciones; para aplicarlas de verdad, el adaptador remoto debe confirmar por separado la eliminación, el bloqueo y el envío del mensaje.

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
- el deploy usa un agente y permisos distintos de las capacidades de observación; reinicios y otras escrituras siguen fuera de alcance.

## Conectar Galerazo más adelante

1. Copiar `config/bots.example.json` a un archivo local ignorado por Git, por ejemplo `config/bots.local.json`.
2. Completar proyecto, zona e instancia de Google Compute Engine.
3. Instalar en la instancia el comando `botctl` para `health`, `logs`, `triggers list`, `triggers media`, `triggers moderate` y `query`, separando los permisos de observación de los de moderación.
4. Probar el acceso manual con `gcloud compute ssh --tunnel-through-iap`.
5. Activar el adaptador `gcp-iap` y verificar cada capacidad desde el dashboard.

No guardar tokens, claves SSH, rutas sensibles ni copias de la base en el repositorio. La arquitectura completa está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Estructura principal

```text
app/                         interfaz y navegación
agent/                       API local, validación y jobs de deploy
config/bots.example.json     registro sin secretos
config/runtime.example.json  destino GCP local sin credenciales
lib/control-center/          tipos, datos demo y políticas
docs/ARCHITECTURE.md         diseño de la integración remota
scripts/run-local.mjs        ciclo de vida conjunto de UI y agente
scripts/run-vinext.mjs       ejecución multiplataforma
tests/                       validación del render y guardrails
```

## Despliegue

El Control Center no está publicado y el agente de deploy no debe exponerse. La UI puede evaluarse por separado en un hosting, pero las acciones operativas seguirán requiriendo el agente local y un modelo de autenticación explícito.
