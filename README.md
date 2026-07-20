# Bot Control Center

Dashboard local para observar varios bots remotos desde una sola interfaz. La primera versión funciona con datos de demostración y deja preparada la integración de Galerazo Bot mediante Google Cloud IAP/SSH.

## Qué incluye

- selector de bots y estado general de la flota;
- métricas de proceso, versión, host y transporte;
- visor de logs con búsqueda y filtro por nivel;
- módulo de triggers específico de Galerazo;
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

## Estado de seguridad

Esta versión es local y demostrativa. No se conecta a Google Cloud, Railway, un VPS ni una base real. Los toggles de triggers solo cambian el estado de la pantalla y la consola SQL devuelve filas de ejemplo.

La integración real mantendrá estas reglas:

- el dashboard escucha solo en `localhost`;
- no se publica SQLite ni un puerto administrativo en Internet;
- el acceso remoto usa Google Cloud IAP/SSH o SSH con alias conocido;
- cada bot expone un comando remoto `botctl` con respuestas JSON normalizadas;
- SQLite se abre con `mode=ro` y `PRAGMA query_only=ON`;
- la API vuelve a validar SQL, limita tiempo y cantidad de filas;
- reinicios, deploys y escrituras requieren una etapa posterior, permisos separados, confirmación y auditoría.

## Conectar Galerazo más adelante

1. Copiar `config/bots.example.json` a un archivo local ignorado por Git, por ejemplo `config/bots.local.json`.
2. Completar proyecto, zona e instancia de Google Compute Engine.
3. Instalar en la instancia el comando `botctl` de solo lectura para `health`, `logs`, `triggers list` y `query`.
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
