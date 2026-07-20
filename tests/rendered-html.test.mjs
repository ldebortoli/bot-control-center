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

test("renderiza el dashboard local con la flota demo", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="es"/i);
  assert.match(html, /<title>Bot Control Center · Panel local<\/title>/i);
  assert.match(html, /Galerazo Bot/);
  assert.match(html, /Spider Tracker/);
  assert.match(html, /Reshare Stories/);
  assert.match(html, /Modo local/);
  assert.match(html, /Administrar flota/);
  assert.match(html, /Capacidades declaradas/);
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

test("incluye visor multimedia y moderación auditada para triggers", async () => {
  const [controlCenter, mediaViewer, types, transport, architecture] = await Promise.all([
    readFile(new URL("../app/control-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/trigger-media-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/control-center/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/control-center/transport-contract.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/ARCHITECTURE.md", import.meta.url), "utf8"),
  ]);

  assert.match(controlCenter, /Visualizador de triggers/);
  assert.match(controlCenter, /Agregado por/);
  assert.match(controlCenter, /Eliminar trigger/);
  assert.match(controlCenter, /Bloquear usuario/);
  assert.match(controlCenter, /Eliminar y bloquear/);
  assert.match(controlCenter, /Avisos enviados a chats/);
  assert.match(controlCenter, /moderationStorageKey/);
  assert.match(mediaViewer, /<video/);
  assert.match(mediaViewer, /<audio/);
  assert.match(mediaViewer, /download=/);
  assert.match(types, /createdBy/);
  assert.match(types, /chat:/);
  assert.match(transport, /moderateTrigger/);
  assert.match(transport, /TriggerModerationResult/);
  assert.match(architecture, /announcementSent/);
});

test("conserva los guardrails de SQL y transporte fuera de la UI", async () => {
  const [policy, transport, exampleConfig, packageJson] = await Promise.all([
    readFile(new URL("../lib/control-center/query-policy.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/control-center/transport-contract.ts", import.meta.url), "utf8"),
    readFile(new URL("../config/bots.example.json", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(policy, /select\|with\|explain/i);
  assert.match(policy, /insert\|update\|delete/i);
  assert.match(transport, /gcp-iap/);
  assert.match(transport, /BotTransport/);
  assert.match(exampleConfig, /TU_PROYECTO_GCP/);
  assert.doesNotMatch(exampleConfig, /private_key|token|password/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
