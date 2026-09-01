import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renderiza el dashboard local sin datos operativos inventados", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="es"/i);
  assert.match(html, /<title>Bot Control Center · Panel local<\/title>/i);
  assert.match(html, /<link rel="icon"[^>]+favicon\.ico\?v=20260729-2/i);
  assert.match(html, /<link rel="manifest"[^>]+manifest\.webmanifest/i);
  assert.match(html, /Galerazo Bot/);
  assert.match(html, /Spider Tracker/);
  assert.match(html, /Reshare Stories/);
  assert.match(html, /Modo local/);
  assert.match(html, /Administrar flota/);
  assert.match(html, /Operación de[\s\S]*Galerazo Bot/);
  assert.match(html, />Deploy</);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton|codex-preview/i);
});

test("mantiene la flota editable y Reshare inactivo por defecto", async () => {
  const controlCenter = await readFile(
    new URL("../app/control-center.tsx", import.meta.url),
    "utf8",
  );

  assert.match(controlCenter, /initiallyInactiveBotIds = new Set\(\["reshare"\]\)/);
  assert.match(controlCenter, /localStorage\.setItem/);
  assert.match(controlCenter, /Administrar flota/);
  assert.match(controlCenter, /Registrar y agregar/);
  assert.match(controlCenter, /No se guardan credenciales/);
});

test("incluye visor multimedia y moderación auditada para triggers reales", async () => {
  const [controlCenter, remoteTriggers, mediaViewer, types, botRegistry, transport, architecture] = await Promise.all([
    readFile(new URL("../app/control-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/remote-triggers-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/trigger-media-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/control-center/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/control-center/bot-registry.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/control-center/transport-contract.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/ARCHITECTURE.md", import.meta.url), "utf8"),
  ]);

  assert.match(controlCenter, /RemoteTriggersPanel/);
  assert.match(controlCenter, /No hay triggers disponibles/);
  assert.match(controlCenter, /withoutInventedData/);
  assert.match(controlCenter, /No se muestran datos de ejemplo/);
  assert.match(remoteTriggers, /Error de conexión\. No pude cargar los triggers/);
  assert.match(remoteTriggers, /DATOS REALES · GCP IAP/);
  assert.match(remoteTriggers, /moderate-trigger/);
  assert.match(remoteTriggers, /Eliminar trigger/);
  assert.match(remoteTriggers, /Bloquear usuario/);
  assert.match(remoteTriggers, /Eliminar y bloquear/);
  assert.match(remoteTriggers, /const triggersPerPage = 10/);
  assert.match(remoteTriggers, /Chat ID o nombre/);
  assert.match(remoteTriggers, /Más recientes/);
  assert.match(remoteTriggers, /type="date"/);
  assert.match(remoteTriggers, /Página \{currentPage\} de \{totalPages\} · 10 por página/);
  assert.match(remoteTriggers, /Ningún trigger coincide con los filtros/);
  assert.match(remoteTriggers, /No se muestran fixtures/);
  assert.match(mediaViewer, /<video/);
  assert.match(mediaViewer, /<audio/);
  assert.match(mediaViewer, /<img/);
  assert.match(mediaViewer, /download=/);
  assert.match(mediaViewer, /DecompressionStream/);
  assert.match(mediaViewer, /lottie_light/);
  assert.match(types, /createdBy/);
  assert.match(types, /chat:/);
  assert.match(types, /"image" \| "sticker"/);
  assert.match(mediaViewer, /application\/x-tgsticker/);
  assert.doesNotMatch(types, /generated-demo/);
  assert.doesNotMatch(mediaViewer, /createDemo|generated-demo|Vista previa local generada/);
  assert.doesNotMatch(botRegistry, /producción · demo|staging · demo|f091b8e|c72e113|3d 18h|694 MB/);
  assert.match(botRegistry, /name: "Spider Tracker"[\s\S]*statusLabel: "Sin conexión"[\s\S]*capabilities: \[\]/);
  assert.doesNotMatch(botRegistry, /metrics:|logs:|triggers:|queryRows:/);
  assert.match(transport, /moderateTrigger/);
  assert.match(transport, /TriggerModerationResult/);
  assert.match(architecture, /announcementSent/);
});

test("muestra estado remoto y feedback visible del pre-flight", async () => {
  const [deployPanel, runtimePanel, agent] = await Promise.all([
    readFile(new URL("../app/deploy-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/runtime-status-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../agent/server.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(deployPanel, /Verificando…/);
  assert.match(deployPanel, /Verificación completada/);
  assert.match(runtimePanel, /Healthcheck/);
  assert.match(runtimePanel, /Reinicios/);
  assert.match(runtimePanel, /Imagen desplegada/);
  assert.match(runtimePanel, /Detener contenedor/);
  assert.match(agent, /\/runtime|\/triggers/);
});

test("integra todos los scrollbars con el sistema visual y alto contraste", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /scrollbar-color:\s*var\(--scrollbar-thumb\)\s+var\(--scrollbar-track\)/);
  assert.match(styles, /\*::\-webkit-scrollbar\s*\{/);
  assert.match(styles, /\*::\-webkit-scrollbar-thumb:hover/);
  assert.match(styles, /\*::\-webkit-scrollbar-thumb:active/);
  assert.match(styles, /\*::\-webkit-scrollbar-corner/);
  assert.match(styles, /@media\s*\(forced-colors:\s*active\)/);
  assert.match(styles, /scrollbar-color:\s*auto/);
});

test("conserva los guardrails de SQL y transporte fuera de la UI", async () => {
  const [policy, transport, exampleConfig, runtimeExample, packageJson] = await Promise.all([
    readFile(new URL("../lib/control-center/query-policy.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/control-center/transport-contract.ts", import.meta.url), "utf8"),
    readFile(new URL("../config/bots.example.json", import.meta.url), "utf8"),
    readFile(new URL("../config/runtime.example.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(policy, /select\|with\|explain/i);
  assert.match(policy, /insert\|update\|delete/i);
  assert.match(transport, /gcp-iap/);
  assert.match(transport, /BotTransport/);
  assert.match(exampleConfig, /TU_PROYECTO_GCP/);
  assert.doesNotMatch(exampleConfig, /private_key|token|password/i);
  assert.match(runtimeExample, /runtime|repositoryPath|projectId/i);
  assert.doesNotMatch(runtimeExample, /private_key|token|password/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("incluye deploy local de una sola acción con confirmación y rollback", async () => {
  const [controlCenter, deployPanel, deployStyles, agent, jobManager, launcher] = await Promise.all([
    readFile(new URL("../app/control-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/deploy-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../agent/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../agent/job-manager.mjs", import.meta.url), "utf8"),
    readFile(new URL("../launcher/BotControlCenterLauncher.cs", import.meta.url), "utf8"),
  ]);

  assert.match(controlCenter, /id: "deploy"/);
  assert.match(deployPanel, /Publicar y deployar/);
  assert.match(deployPanel, /Corte mensual seguro/);
  assert.match(deployPanel, /Publicar sólo si hay commits nuevos/);
  assert.match(deployPanel, /Actualizar librerías antes del corte/);
  assert.match(deployPanel, /requirements\.txt/);
  assert.match(deployPanel, /Ejecutar corte seguro ahora/);
  assert.match(deployPanel, /worktree del commit fijado/);
  assert.match(deployPanel, /window\.confirm/);
  assert.match(deployPanel, /Rollback/);
  assert.match(deployPanel, /deploy-target__image/);
  assert.match(deployStyles, /\.deploy-target__image dd/);
  assert.match(deployStyles, /\.deploy-primary-action > button strong \{ font-size: 14px; \}/);
  assert.match(agent, /127\.0\.0\.1/);
  assert.match(agent, /X-Bot-Control-Action|x-bot-control-action/);
  assert.match(jobManager, /shell: false/);
  assert.match(jobManager, /worktree.*add/);
  assert.match(jobManager, /"push",\s*"--porcelain"/);
  assert.doesNotMatch(jobManager, /--force-with-lease/);
  assert.match(launcher, /run-local\.mjs/);
});

test("incluye credenciales remotas enmascaradas sin persistencia local", async () => {
  const [controlCenter, credentialsPanel, agent, jobManager, types] = await Promise.all([
    readFile(new URL("../app/control-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/credentials-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../agent/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../agent/job-manager.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/control-center/types.ts", import.meta.url), "utf8"),
  ]);

  assert.match(controlCenter, /id: "credentials"/);
  assert.match(controlCenter, /CredentialsPanel/);
  assert.match(credentialsPanel, /type="password"/);
  assert.match(credentialsPanel, /Nunca descarga tokens ni claves/);
  assert.match(credentialsPanel, /window\.confirm/);
  assert.doesNotMatch(credentialsPanel, /localStorage/);
  assert.match(agent, /\/credentials/);
  assert.match(jobManager, /secret-patch\.json/);
  assert.match(types, /"credentials"/);
});
