# R11 APLICADO al BCC habitual - 2026-10-22

Vite efectivo8.1.6 y build probado adoptados a23:24:37UTC, aplicacionBCC0.1.7. No queda solo candidato. Fuente funcional549f7e8; este cierre agrega memoria de la adopcion. Preflight renovado sin BCC/puertos/mutex/jobs/locks, tarea mensualReady/resultado0/missed0/proxima1-11 03ART. Falla de transporte anterior ocurrio antes de ejecutar; executor recuperado sin cambiar entorno ni eludir permisos.

Validacion en runtime habitual: 70/70 tests sin skips, 53 tests cobertura100% lineas/ramas/funciones, regresion de origen HTML y CLI8.1.6, peer tree deduped. Build95archivos y Vite63archivos coinciden byte a byte con candidato probado. Otros paquetes, Next16.4.2 y Sharp0.35.5 intactos; full audit8 entradas braces preexistentes no ocultadas, prod0 del mismo grafo verificado.

Perfiles/logs/estado completos3863archivos identicos porSHA256; incluye cursor/jobpersistido anterior. Config, ambos EXE, acceso, shims y XMLtarea identicos. Ningun proceso/listener residual. Vite anterior63archivos y build106archivos preservados con lock oculto completo en work/r11-vite-20261022/adoption/rollback-runtime y tar bcc-before-adoption-vite-8.1.5.tgz/SHA256SUMS. CLI previo imprime8.1.5 sin afectar el habitual. Rollback requiere preflight quieto, preservar version nueva antes de restaurar carpetas/lock/manifiestos previos y comprobar hashes; no ejecutar ni repetir releases/anuncios, no limpiar jobs.

No se abrio BCC operativo; tests usan dobles, previewloopback y Probe temporal. Cero jobs operativos, SSH/Docker real, bot/Worker/VPS/APK, anuncios/publicaciones o cambios sensibles. No push/merge. Evidencia actual: work/r11-vite-20261022/adoption/ADOPTION_REPORT.md, final-verification.json y journal.json(applied-and-verified). Cola previa3pedidos DONE; no otros lotes activados. Sin bloqueos pendientes de R11. Las secciones siguientes describen estados historicos anteriores a la adopcion.

---

# R11 - Vite 8.1.6 - 2026-10-22

Parche solo Vite en package.json y lock; base ec05cc1. Version BCC0.1.7, Next/eslint-config-next16.4.2, Sharp0.35.5 y otros pins conservados. npm ci limpio antes/despues, build+70/70 tests (sin skips), lint y cobertura agente53tests/100% lineas/ramas/funciones. Regresion HTML inocua falla en8.1.5 y pasa en8.1.6; la primera expectativa extra sobre eliminar queries se corrigio a verificar origen, sin cambiar aplicacion. Los cinco GHSA ya no figuran en audit candidato. Audit prod0; full8 altas por braces upstream, bloqueo previo conservado.

Candidato/evidencia/artefacto y rollback: work/r11-vite-20261022; ver REPORT.md. Ejecutables previos copiados en rollback; perfil/config y runtime principal preservados. node_modules habitual conserva Vite8.1.5 y dist previo; NO se activo el candidato. Siguiente paso, solo si se coordina la aplicacion: comprobar BCC/jobs/escritores, esperar cierre seguro de instancia activa y aplicar el commit exacto con npm ci/build locales; nunca iniciar release/scheduled-release ni repetir anuncios, ni limpiar jobs inciertos. Ningun bot/Worker/VPS/APK, anuncio, calendario o credencial fue cambiado. No hubo denegacion de accion R11 ni operacion productiva incierta; sin push/merge.

La cola anterior tiene sus tres pedidos DONE y no hay nuevos pendientes. Este turno queda limitado expresamente a R11. Estado productivo historico siguiente no fue revalidado ni modificado en este lote.

---

# Cierre: despliegue al VPS · 2026-10-20

## Producción y fuentes

- Bot 0.80: imagen `galerazo-bot:ee2aba412e2b`, fuente `ee2aba4`, iniciado a las 20:33:30.931590785 UTC. Healthy, cero reinicios, `getMe` exacto @galerazo_bot y updates procesadas. 139 idiomas; comercio admite los 192 códigos de la Mini App. SQLite: integridad y claves foráneas correctas, 35 tablas.
- Mini App 0.1.27: fuente `7c05ef433b89cb1650a9e5fe6ff536abb8f7e106`, Worker `a49408e6-cd4f-422b-a5f6-09f04a60e15d`. Ambos dominios, metadata y cinco assets verificados byte a byte; messages.js tiene 2613340 bytes. El manager verificó además gateway 401/no-store.
- Bot Control Center 0.1.7: fuente funcional `b2eea6b`. Job `b9b97ab6-f668-490b-8d8b-eb4274bfcecd` succeeded a las 20:33:49 UTC. Fuentes operativas publicadas; el cierre documental posterior no cambia las imágenes desplegadas.

## Próximos despliegues

Sólo Contabo/VPS para Galerazo, tanto en runtime.local como en ambos ejemplos del catálogo. Mismo manager, locks y tarea Windows existente: Ready, próxima 1/11/2026 03:00 ART, 12 reintentos/PT1H, límite 3h, IgnoreNew. El calendario se conserva. No activar GCP, registry externo ni servicios pagos. La configuración privada y los secretos permanecen fuera de Git. Nunca usar el .env local de pruebas en producción.

## Anuncio, backup y recuperación

Lucas retiró menciones a otras apps y opciones pendientes y aprobó explícitamente el cuerpo final 0.80/base0.77, máximo 509/4096. Cursor 0.80 a las 20:34:02 UTC y una confirmación de envío. Logs nuevos: cero errores/conflictos y 12 ciclos getUpdates completos en la comprobación. No reenviar 0.77 ni 0.80.

Snapshot `/srv/galerazo/backups/predeploy-20261020T203320Z.sqlite3`: 3231744 bytes; SHA256 `cf5226681daa5f8d3fa3665c626a1116f059b78dfcc7725e6e41db6b842f0042`. Descarga con hash idéntico y restauración local aislada real: 35 tablas, 20740 filas, integridad/FK correctas y datos iterdump idénticos. previous-image.env señala `36ef57546e33`, cuya imagen está disponible. No se ejecutó rollback productivo: el corte está saludable.

Backup diario agrupado codex-backup@daily activo, cuatro timers individuales deshabilitados. Recibo Galerazo 824 en Logs: descarga y restoreVerified observados como true; no se repitió el envío. Mantener los resguardos del runbook DEPLOY_VPS.

## Aislamiento comprobado

Los nueve contenedores ajenos al bot, incluido el túnel, conservaron ID, imagen, StartedAt, reinicios, cgroup y límites. Bindings 8101/8102/8442/8103/8104 intactos. Galerazo/Tivio/Altura/Enlamisma: 1 GiB agregado cada una, swap 0; bot 768 MiB y túnel 128 MiB. El relay enlamisma-test-status ya era unhealthy antes y quedó igual; las otras API/DB permanecen saludables. No se modificaron servicios ajenos.

## Herramienta y validación

El acceso real fallaba porque su sondeo descartaba respuestas de más de 700 ms; la carga inicial midió 3,3 s. Se corrigió con HTTP asíncrono acotado a 10 s, procesamiento de eventos cada 50 ms y cancelación propagada. Una prueba C# con servidor lento falló antes y pasa después, incluida cancelación. Launcher recompilado y shortcut reinstalado; iconos assets/favicon idénticos, AppID y ciclo de vida conservados. El acceso abre Edge y API/HTML devuelven 200. Browser Deploy muestra Contabo/VPS+SSH y la imagen nueva, sin destino antiguo ni etiqueta Compute Engine.

No se reintentó la captura nativa Windows incompatible. El inventario CUA de navegador agotó 30 s y se descartó; fallback Playwright CLI/DOM/API y prueba nativa compilada. No se recertificaron visualmente taskbar/cierre del acceso real; la cancelación y el ciclo de vida tienen regresiones actuales y evidencia previa, y el launcher queda abierto disponible.

Gates: bot 718 tests nativos, 100% de 6748 sentencias/2084 ramas, Python 3.14.8/lock/pipcheck; Docker 714 passed/4 skips de plataforma. Web 77 private coverage/98 Node full/203 Vitest, 100% de métricas, check/build354 repetidos por el release en snapshot inmutable. BCC 70 tests y build en índice aislado core.autocrlf=true/LF; lint y audit de producción 0; agente V8 53 tests con 100% líneas/ramas/funciones. C# se verifica por compilación y pruebas Windows, no mediante V8. Protecciones GitHub Galerazo/BCC enabled, autor noreply; web privado HTTP422 persistente. No CI watch ni pagos reales/login Telegram QA.

## Evidencia y pendientes

Evidencia privada: Galerazobot `.codex/deploy-vps-20261020` y BCC `work/deploy-vps-20261020` contienen aprobación, job, antes/después, runtime, lenguajes, frontend, restore, aislamiento, logs y browser. No versionar bases/logs/secretos. No relanzar ni reenviar acciones confirmadas. Colas anteriores DONE o BLOCKED explícitamente; cola contenedora BCC reconciliada DONE. Los bloqueos anteriores de QA Telegram/GitHub privado/toolchain se conservan en BACKLOG.
