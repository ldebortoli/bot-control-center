# Arquitectura de Bot Control Center

## Objetivo

Separar la interfaz de administración de cada bot. El dashboard contiene navegación, presentación y políticas comunes; cada bot declara capacidades y cada proveedor implementa un transporte.

```text
Dashboard local
  └─ registro de bots
      ├─ adaptador Google Cloud IAP/SSH ── botctl ── Galerazo
      ├─ adaptador SSH                  ── botctl ── bot en VPS
      └─ adaptador Railway API/CLI      ── botctl ── bot en Railway
```

## Capas

1. **Registro**: nombre, proveedor, transporte, destino y capacidades. Los secretos quedan fuera del JSON y de Git.
2. **Transporte**: abre una sesión efímera autenticada y ejecuta un comando permitido. No conoce la interfaz.
3. **`botctl` remoto**: traduce cada bot a un contrato JSON estable (`health`, `logs`, `query`, `triggers list`, `triggers media` y `triggers moderate`).
4. **Capacidades**: `status`, `logs`, `sql` y `triggers` son genéricas; cada bot declara únicamente las que implementa.
5. **UI**: solo muestra capacidades declaradas y no asume que todos los bots son iguales.

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

## Contrato de triggers y moderación

Un bot que declare `triggers` debe devolver, por cada definición, la frase y respuesta, autor, chat de origen, fecha, estado, uso y un descriptor multimedia opcional. Los tipos normalizados son `video`, `audio`, `image` y `sticker`; el MIME distingue imágenes y GIF, stickers estáticos WebP/PNG, stickers animados WebM y stickers vectoriales TGS. El archivo se obtiene mediante un endpoint o comando autenticado de vida corta; la UI nunca guarda el token ni una ruta privada permanente.

La UI usa elementos nativos para imágenes, GIF, audio, video y WebM. Los TGS se descomprimen en memoria y se reproducen con el runtime liviano de Lottie, sin el evaluador de expresiones del reproductor completo; el archivo original sigue disponible para descarga. El adaptador debe entregar el MIME y nombre correctos, aplicar límites de tamaño y duración y servir el contenido desde un origen autorizado para el dashboard.

Las acciones remotas permitidas son `delete-trigger`, `block-user` y `delete-and-block`. Toda solicitud incluye `triggerId`, `userId`, `chatId`, confirmación explícita de `announceInChat` y un identificador de auditoría. El adaptador debe:

- validar que el trigger, el usuario y el chat pertenecen al mismo bot;
- pedir confirmación en la UI antes de ejecutar;
- aplicar la acción con una cuenta de servicio limitada a moderación;
- enviar una advertencia al mismo chat describiendo la acción aplicada;
- devolver por separado `triggerDeleted`, `userBlocked`, `announcementSent` y el ID del mensaje;
- registrar actor operador, fecha y resultado sin copiar contenido multimedia ni credenciales.

Para `delete-and-block`, el bot debe tratar la operación como una unidad auditada. Si no puede completar o anunciar todos los pasos, devuelve el resultado parcial y el dashboard lo muestra como error; nunca informa éxito total sólo porque uno de los pasos terminó.

## Próximas etapas

1. Implementar y probar `botctl` en Galerazo.
2. Crear el backend local que invoque el adaptador GCP IAP.
3. Reemplazar datos demo por respuestas reales con estados de carga y errores.
4. Añadir autenticación si el dashboard deja de ser exclusivamente local.
5. Implementar la moderación de triggers con una cuenta limitada y auditoría separada; no reutilizar permisos de observación para otras acciones privilegiadas.
