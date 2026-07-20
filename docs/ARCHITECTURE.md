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
3. **`botctl` remoto**: traduce cada bot a un contrato JSON estable (`health`, `logs`, `query`, `triggers list`).
4. **Capacidades**: `status`, `logs` y `sql` son genéricas; `triggers` es un módulo opcional de Galerazo.
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

## Próximas etapas

1. Implementar y probar `botctl` en Galerazo.
2. Crear el backend local que invoque el adaptador GCP IAP.
3. Reemplazar datos demo por respuestas reales con estados de carga y errores.
4. Añadir autenticación si el dashboard deja de ser exclusivamente local.
5. Evaluar acciones privilegiadas por separado; no reutilizar permisos de observación.
