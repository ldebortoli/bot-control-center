# Bot Control Center

Dashboard local para observar varios bots remotos desde una sola interfaz. La primera versión funciona con datos de demostración y deja preparada la integración de Galerazo Bot mediante Google Cloud IAP/SSH.

## Qué incluye

- selector de bots y estado general de la flota;
- métricas de proceso, versión, host y transporte;
- visor de logs con búsqueda y filtro por nivel;
- visualizador genérico de triggers con reproducción y descarga de audio/video, autor, chat y auditoría de moderación;
- consola SQLite con validación de consultas de solo lectura;
- registro declarativo y contrato de transporte extensible;
- diseño responsive, sin credenciales ni servicios remotos configurados.

## Ejecutar en Windows, macOS o Linux

Requiere Node.js 22.13 o superior.

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`. Para validar el proyecto:

```bash
npm test
npm run lint
```

Los scripts de desarrollo y build son multiplataforma; no necesitan declarar variables de entorno con sintaxis específica de Bash o PowerShell.

## Abrir como aplicación de Windows

El acceso `Bot Control Center` de la carpeta `CODEX APPS` muestra inmediatamente el estado de inicio, levanta el servidor en segundo plano y abre el dashboard en una ventana independiente. Al cerrar esa ventana, el launcher termina automáticamente el árbol completo del servidor.

Para compilar o reinstalar el acceso:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-codex-app.ps1
```

Los registros locales del launcher quedan en `%LOCALAPPDATA%\BotControlCenter\logs` y no se guardan en el repositorio.

## Estado de seguridad

Esta versión es local y demostrativa. No se conecta a Google Cloud, Railway, un VPS ni una base real. Los cambios de estado y las acciones para eliminar triggers o bloquear usuarios se simulan y persisten únicamente en el perfil local; los avisos al chat se muestran en la auditoría, pero todavía no se envían a Telegram. La consola SQL devuelve filas de ejemplo.

## Visualizar y moderar triggers

Cualquier bot que declare la capacidad `triggers` muestra una biblioteca con su contenido, archivo multimedia, usuario creador y chat de origen. Los audios y videos se reproducen en el panel y se pueden descargar.

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
- la moderación de triggers usa permisos separados, confirmación y auditoría; reinicios, deploys y otras escrituras siguen fuera de alcance.

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
config/bots.example.json     registro sin secretos
lib/control-center/          tipos, datos demo y políticas
docs/ARCHITECTURE.md         diseño de la integración remota
scripts/run-vinext.mjs       ejecución multiplataforma
tests/                       validación del render y guardrails
```

## Despliegue

No está desplegado. Primero se probará localmente con Galerazo; después se decidirá si conviene mantenerlo solo en la computadora del administrador o publicarlo detrás de autenticación fuerte.
