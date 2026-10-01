# Release conjunto de Galerazo Bot y Mini App

Bot Control Center integra el frontend configurado mediante `frontendRepositoryPath`
en la misma operacion manual (`release` o `deploy`) y la misma tarea mensual existente.
No crea otra tarea ni cambia calendario, reintentos, permisos, recursos o credenciales.
El puente fijo es `scripts/deploy/Invoke-FrontendRelease.ps1`, usando `.venv` del
checkout real y `scripts/frontend_release.py`. `frontend-release` es una accion
interna del manager para publicar solo web, por ejemplo tras un bot ya desplegado.

## Seleccion y deteccion

- Exige frontend limpio en `main`, origin exacto de galerazo-web y commits ya subidos.
  Fetch no forzado: si remoto adelanta usa su snapshot; divergencia o commit local
  no subido bloquea. Nunca sube cambios de frontend a medio editar.
- Congela el commit remoto en un worktree detached, sin copiar `.env`, tokens o bases.
- Calcula SHA256 de `git ls-tree -r` de las rutas de ejecucion/configuracion/lock.
  Documentacion y tests solos no causan deploy; commit y fingerprint reales del
  Worker se leen en ambos dominios mediante `/miniapp/release.json` (`no-store`).
- Solo el frontend legado confirmado 0.1.10 puede arrancar sin metadata. Otras
  ausencias, errores de red o inconsistencias bloquean en vez de fingir no-op.
- Cambios pendientes: npm ci, check, cobertura existente, build, tests, dry-run,
  comprobacion de snapshot limpio y Wrangler sobre los dos dominios existentes.
  Usa tag y mensaje del hash congelado, secretos de Cloudflare conservados y CI
  no interactivo. No inicia login ni contrata servicios.

## Compatibilidad, orden y exito

`release-contract.json` declara esquema, version minima compatible y capacidades;
la metadata compilada agrega version, commit y fingerprint. `shared-album-s1`,
`own-view` y `club-90-days` son obligatorios cuando bot >=0.65. Frontend actual
mantiene compatibilidad desde bot0.63. Se comprueban tanto bot actual como corte
objetivo antes de publicar web. Una evolucion del protocolo requiere actualizar
este contrato, pruebas y el puente; la version por si sola no valida otro esquema.

Primero se valida/publica web compatible, despues se publica/despliega bot si cambia.
El ciclo con solo cambios web no publica imagen ni reinicia bot. Cuando ambas partes
estan actuales verifica su estado servido y termina sin build/publicacion. El estado
activo y healthy de Docker prevalece sobre la marca local de ultima imagen para
recuperar reintentos despues de un fallo parcial sin redeploy innecesario.

Antes de exito se verifican ambos dominios, metadata exacta, documento versionado,
SHA256 de app.js/core.js/styles.css, gateway sin sesion 401/no-store, version/health
Docker y, despues del deploy del bot, la imagen exacta. No se consulta una coleccion
real ni se crea initData productiva. Navegacion/alcance/pagos se prueban con fixtures;
QA Telegram con cuenta real debe informarse por separado.

## Fallos y recuperacion

Un fallo web bloquea el siguiente deploy del bot y el job queda failed. Un fallo del
bot mantiene su rollback de GCE; web nueva ya publicada debe ser compatible con
bot previo. No existe una transaccion atomica entre Cloudflare y GCE: si la sonda
posterior falla no se marca exito, el reintento consulta realidad y no confia en
una marca local. No se hace rollback automatico de web ni se reenvia anuncio;
para restaurar un Worker usar el rollback existente de Cloudflare bajo autorizacion.
Verificacion espera propagacion como maximo seis intentos de cinco segundos; no
oculta fallos definitivos. Todo vive bajo el lock existente por bot. Los snapshots
se retiran en finally. La tarea Windows y sus reintentos no se reinstalan.

## Validacion

`python -m pytest tests/test_frontend_release.py` prueba fixtures sin red/credenciales.
La suite de BCC cubre web-only/no-op, orden conjunto, fallo/resultado invalido,
acciones manuales y lock; conserva cobertura 100% del agente. Web conserva check,
build, tests y cobertura del alcance definido. No ampliar CI remota ni ejecutar
pagos reales como prueba de este flujo.
