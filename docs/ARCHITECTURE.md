# Arquitectura de Bot Control Center

## Objetivo

Separar la interfaz de administración de cada bot. El dashboard contiene navegación, presentación y políticas comunes; cada bot declara capacidades y cada proveedor implementa un transporte.

```text
Dashboard local
  ├─ agente local 127.0.0.1 ── scripts versionados ── Docker / Artifact Registry / GCE
  └─ registro de bots
      ├─ adaptador Google Cloud IAP/SSH ── botctl ── Galerazo
      ├─ adaptador SSH                  ── botctl ── bot en VPS
      └─ adaptador Railway API/CLI      ── botctl ── bot en Railway
```

## Capas

1. **Registro**: nombre, proveedor, transporte, destino y capacidades. Los secretos quedan fuera del JSON y de Git.
2. **Transporte**: abre una sesión efímera autenticada y ejecuta un comando permitido. No conoce la interfaz.
3. **`botctl` remoto**: traduce cada bot a un contrato JSON estable (`health`, `logs`, `query`, `triggers list`, `triggers media` y `triggers moderate`).
4. **Capacidades**: `status`, `logs`, `sql`, `triggers` y `deploy` son genéricas; cada bot declara únicamente las que implementa.
5. **UI**: solo muestra datos devueltos por un adaptador real. Un bot sin adaptador queda desconectado; una capacidad ausente se presenta como no disponible y nunca se completa con fixtures.

## Flujo previsto para Google Compute Engine

```text
Click en “Actualizar”
  → backend local valida bot y capacidad
  → gcloud compute ssh --tunnel-through-iap <instancia>
  → sudo -u <usuario-bot> botctl health --json
  → valida esquema, oculta campos sensibles y limita tamaño
  → responde a la UI
```

IAP permite llegar por SSH sin exponer el puerto 22 públicamente. Una IP externa fija no es requisito para este diseño.

## Flujo de deploy local

La UI hospedable no ejecuta procesos. Un agente Node separado escucha sólo en `127.0.0.1:43121` y vuelve a leer `config/runtime.local.json` para cada solicitud. Ese archivo contiene destinos no secretos y está excluido de Git.

```text
Confirmar “Publicar y deployar”
  → POST JSON con Origin local y cabecera X-Bot-Control-Action
  → valida bot, herramientas, configuración y ausencia de otro job activo
  → powershell.exe -File Publish-DockerImage.ps1 con argumentos separados
  → lee y valida deploy/out/last-image.txt
  → powershell.exe -File Deploy-Gce.ps1 con argumentos separados
  → transmite logs saneados y estado a la UI
```

No existe un endpoint de shell ni un campo para ingresar comandos. El ejecutable, los scripts y los nombres de parámetros están fijados en código; `spawn` usa `shell: false`. Se rechazan orígenes no locales, cuerpos que no sean JSON, solicitudes sin cabecera de acción y confirmaciones que no coincidan con el bot. Los logs tienen tamaño limitado y ocultan patrones de tokens, secretos y contraseñas.

`release` requiere PowerShell, Git, Docker y `gcloud`; `deploy` reutiliza una imagen ya publicada y `rollback` invoca el script específico. Sólo puede existir un job activo por bot. Cambiar de vista no afecta el job. Si la ventana nativa se cierra durante una operación, el launcher espera hasta 45 minutos a que finalice antes de terminar el árbol local; cerrar nuevamente la pantalla de espera fuerza el apagado.

El agente no guarda credenciales. Docker y Google Cloud CLI usan sus almacenes locales; los secretos del bot siguen únicamente en `/etc/galerazo/bot.env` y `/etc/galerazo/secrets` dentro de la VM.

## Flujo de release programado

La programación mensual vive en `runtime.local.json` y se materializa con una tarea de Windows por bot. El Programador de tareas ejecuta directamente un runner Node local, de modo que no depende de que la ventana o los servidores de desarrollo estén abiertos. La tarea usa `StartWhenAvailable`, impide instancias paralelas y reintenta los fallos operativos de forma acotada.

```text
Tarea mensual
  → adquiere un lock por bot compartido con las acciones manuales
  → exige un árbol Git limpio y hace fetch de remote/branch
  → rechaza divergencias o publica el commit local con push no forzado
  → compara el tag de 12 caracteres con la última imagen
  → crea un worktree detached del commit objetivo
  → ejecuta Publish-DockerImage.ps1 y Deploy-Gce.ps1 desde ese snapshot
  → conserva imagen/resultado fuera del repositorio y libera worktree + lock
```

El hash objetivo queda fijado antes del build. Los cambios posteriores no pueden entrar en el artefacto aunque ocurran durante la ejecución. El sistema no crea commits automáticos: una edición sin confirmar se considera trabajo incompleto y pospone el corte. Un release sin commits nuevos es un resultado exitoso sin cambios; un repositorio sucio, una divergencia o una operación concurrente produce un resultado pospuesto para que Windows lo reintente sin sobrescribir nada.

## Flujo de credenciales remotas

La UI consulta un inspector root remoto que responde exclusivamente booleanos por variable. Para una actualización exige origen local, cabecera de acción, confirmación del bot y una allowlist cerrada. El parche nunca forma parte de los argumentos ni del job: se escribe con permisos privados en un directorio temporal, se copia por IAP, preserva valores omitidos, valida el host y se elimina en ambos extremos. El token principal no se puede borrar desde el panel. Esta capacidad permanece separada de deploy y no reinicia el proceso automáticamente.

## Política SQLite de solo lectura

La comprobación de la pantalla es solo la primera barrera. La implementación remota debe aplicar todas:

- aceptar una única sentencia que comience con `SELECT`, `WITH` o `EXPLAIN`;
- rechazar operaciones mutables y extensiones;
- abrir con URI `file:<ruta>?mode=ro`;
- ejecutar `PRAGMA query_only=ON` en la conexión;
- usar un authorizer de SQLite para bloquear escritura, `ATTACH` y funciones riesgosas;
- imponer timeout, límite de 500 filas y límite de tamaño de respuesta;
- registrar actor, bot, duración y hash de la consulta, nunca credenciales ni filas sensibles.

## Aislamiento

Cada bot conserva su propio usuario de sistema, proceso, token, base y directorio de logs. El dashboard recibe solo el acceso mínimo por capacidad. La caída de un bot o adaptador no debe impedir consultar los demás.

El registro estático contiene únicamente identidad, transporte previsto y capacidades realmente conectadas. Métricas, versiones, commits, logs, resultados SQL y triggers nunca se cargan desde el catálogo ni desde `localStorage`. Los registros personalizados de versiones anteriores se sanean al hidratarse para que queden desconectados y con sus colecciones operativas vacías.

## Contrato de triggers y moderación

Un bot que declare `triggers` debe devolver, por cada definición, frase/respuesta, autor, chat de origen, fecha, estado y un descriptor multimedia opcional. Las métricas de uso sólo se muestran si el bot las persiste; Galerazo no guarda hits ni última ejecución por trigger y la UI lo declara en vez de inventarlos. Los tipos normalizados son `video`, `audio`, `image`, `sticker` y `file`; el MIME distingue imágenes y GIF, stickers estáticos WebP/PNG, stickers animados WebM y stickers vectoriales TGS. El archivo se obtiene mediante un endpoint autenticado de vida corta; la UI nunca guarda el token ni una ruta privada permanente.

La UI usa elementos nativos para imágenes, GIF, audio, video y WebM. Los TGS se descomprimen en memoria y se reproducen con el runtime liviano de Lottie, sin el evaluador de expresiones del reproductor completo; el archivo original sigue disponible para descarga. El adaptador debe entregar el MIME y nombre correctos, aplicar límites de tamaño y duración y servir el contenido desde un origen autorizado para el dashboard.

Las acciones remotas permitidas son `delete-trigger`, `block-user` y `delete-and-block`. La solicitud local incluye sólo el `triggerId` opaco, la acción y la confirmación del bot; el contrato remoto vuelve a resolver usuario y chat desde SQLite para impedir combinaciones manipuladas. El adaptador debe:

- validar que el trigger, el usuario y el chat pertenecen al mismo bot;
- pedir confirmación en la UI antes de ejecutar;
- aplicar la acción con una cuenta de servicio limitada a moderación;
- enviar una advertencia al mismo chat describiendo la acción aplicada;
- devolver por separado `triggerDeleted`, `userBlocked`, `announcementSent` y el ID del mensaje;
- registrar actor operador, fecha y resultado sin copiar contenido multimedia ni credenciales.

Para `delete-and-block`, el bot debe tratar la operación como una unidad auditada. Si no puede completar o anunciar todos los pasos, devuelve el resultado parcial y el dashboard lo muestra como error; nunca informa éxito total sólo porque uno de los pasos terminó.

## Próximas etapas

1. Implementar SQL real mediante consultas allowlisted, timeout y SQLite `mode=ro`.
2. Añadir autenticación si el dashboard deja de ser exclusivamente local.
3. Persistir una auditoría operativa separada para moderación sin copiar archivos ni secretos.
