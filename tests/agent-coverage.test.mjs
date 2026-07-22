import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createCredentialUpdateStep,
  createDeployStep,
  createRollbackStep,
  isValidImageReference,
  isValidTag,
  parseRuntimeConfig,
  powershellStep,
  redactOutput,
  validateCredentialPatch,
} from "../agent/core.mjs";
import { DeploymentJobManager } from "../agent/job-manager.mjs";
import { loadRuntimeConfig } from "../agent/runtime-config.mjs";
import { createAgentServer, inspectBot, inspectCredentialStatus, startAgent } from "../agent/server.mjs";

const allowedOrigin = "http://localhost:3000";

function sampleConfig(repositoryPath) {
  return {
    allowedOrigins: [allowedOrigin, "http://127.0.0.1:3000"],
    bots: {
      galerazo: {
        repositoryPath,
        projectId: "galerazo-prod-123",
        location: "us-central1",
        repository: "bots",
        zone: "us-central1-a",
        instance: "galerazo-prod",
      },
    },
  };
}

function credentialFields(value = true) {
  return {
    TELEGRAM_BOT_TOKEN: value,
    OPENAI_API_KEY: value,
    TELEGRAM_DEV_USER_IDS: value,
    TELEGRAM_LOG_CHAT_ID: value,
    TELEGRAM_ANNOUNCEMENTS_CHAT_ID: value,
    GOOGLE_SHEETS_SPREADSHEET_ID: value,
    GOOGLE_SHEETS_WORKSHEET_NAME: value,
    GOOGLE_SHEETS_CREDENTIALS_JSON: value,
  };
}

function createChild({ stdout = "", stderr = "", code = 0, error = null, autoFinish = true } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  if (autoFinish) {
    queueMicrotask(() => {
      if (stdout) child.stdout.emit("data", stdout);
      if (stderr) child.stderr.emit("data", stderr);
      if (error) child.emit("error", error);
      else child.emit("close", code);
    });
  }
  return child;
}

async function waitForJob(job) {
  for (let index = 0; index < 100 && ["queued", "running"].includes(job.status); index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(["succeeded", "failed"].includes(job.status), "el job debe finalizar durante el test");
  return job;
}

async function startTestServer(overrides = {}) {
  const temporary = await mkdtemp(path.join(tmpdir(), "bot-control-coverage-"));
  const configPath = path.join(temporary, "runtime.local.json");
  await writeFile(configPath, JSON.stringify(sampleConfig(temporary)), "utf8");
  const server = createAgentServer({ configPath, ...overrides });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await rm(temporary, { recursive: true, force: true });
    },
  };
}

test("cubre validaciones estrictas de configuración e identificadores", () => {
  const repositoryPath = path.resolve("C:/bots/galerazo");
  const defaults = sampleConfig(repositoryPath);
  delete defaults.allowedOrigins;
  delete defaults.bots.galerazo.location;
  delete defaults.bots.galerazo.repository;
  const parsed = parseRuntimeConfig(defaults);

  assert.equal(parsed.bots.galerazo.location, "us-central1");
  assert.equal(parsed.bots.galerazo.repository, "bots");
  assert.throws(() => parseRuntimeConfig(null));
  assert.throws(() => parseRuntimeConfig({ allowedOrigins: [], bots: {} }));
  assert.throws(() => parseRuntimeConfig({ allowedOrigins: [allowedOrigin] }));
  assert.throws(() => parseRuntimeConfig({ allowedOrigins: [allowedOrigin], bots: [] }));
  assert.throws(() => parseRuntimeConfig({ allowedOrigins: [allowedOrigin], bots: { "bot malo": {} } }));
  assert.throws(() => parseRuntimeConfig({ allowedOrigins: [allowedOrigin], bots: { galerazo: [] } }));
  assert.throws(() => parseRuntimeConfig({ allowedOrigins: [allowedOrigin], bots: { galerazo: { ...sampleConfig(repositoryPath).bots.galerazo, repositoryPath: "" } } }));
  assert.throws(() => parseRuntimeConfig({ allowedOrigins: [allowedOrigin], bots: { galerazo: { ...sampleConfig(repositoryPath).bots.galerazo, zone: "zona con espacios" } } }));
  assert.throws(() => parseRuntimeConfig({ allowedOrigins: ["https://localhost:3000"], bots: {} }));
});

test("valida referencias, tags y construcción de pasos", () => {
  const bot = parseRuntimeConfig(sampleConfig(path.resolve("C:/bots/galerazo"))).bots.galerazo;
  assert.equal(isValidImageReference("registry.example/project/image:tag"), true);
  assert.equal(isValidImageReference("registry example/image"), false);
  assert.equal(isValidImageReference(null), false);
  assert.equal(isValidTag(undefined), true);
  assert.equal(isValidTag("release_2026-07-22"), true);
  assert.equal(isValidTag("tag con espacios"), false);
  assert.equal(isValidTag("x".repeat(129)), false);
  assert.throws(() => createDeployStep(bot, "imagen inválida"));
  assert.throws(() => createCredentialUpdateStep(bot, ""));

  const rollback = createRollbackStep(bot);
  assert.match(rollback.args[4], /Rollback-Gce\.ps1$/);
  assert.ok(rollback.args.includes("-Instance"));
  assert.deepEqual(
    powershellStep("Paso", "script.ps1", [["Name", "value"]], ["Confirm"]),
    {
      label: "Paso",
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "script.ps1", "-Name", "value", "-Confirm"],
    },
  );
});

test("cubre todos los guardrails de los parches de credenciales", () => {
  const googleCredentials = {
    type: "service_account",
    client_email: "bot@example.test",
    private_key: "private-test-key",
  };
  const valid = validateCredentialPatch({
    updates: { GOOGLE_SHEETS_CREDENTIALS_JSON: googleCredentials },
    clear: ["OPENAI_API_KEY", "OPENAI_API_KEY"],
  });
  assert.deepEqual(valid.updates.GOOGLE_SHEETS_CREDENTIALS_JSON, googleCredentials);
  assert.deepEqual(valid.clear, ["OPENAI_API_KEY"]);

  assert.throws(() => validateCredentialPatch(null));
  assert.throws(() => validateCredentialPatch({ updates: [], clear: [] }));
  assert.throws(() => validateCredentialPatch({ updates: {}, clear: "OPENAI_API_KEY" }));
  assert.throws(() => validateCredentialPatch({ updates: { GOOGLE_SHEETS_CREDENTIALS_JSON: "{}" }, clear: [] }));
  assert.throws(() => validateCredentialPatch({ updates: { GOOGLE_SHEETS_CREDENTIALS_JSON: { ...googleCredentials, private_key: "" } }, clear: [] }));
  assert.throws(() => validateCredentialPatch({ updates: { OPENAI_API_KEY: "" }, clear: [] }));
  assert.throws(() => validateCredentialPatch({ updates: { OPENAI_API_KEY: "linea 1\nlinea 2" }, clear: [] }));
  assert.throws(() => validateCredentialPatch({ updates: {}, clear: [42] }));
  assert.throws(() => validateCredentialPatch({ updates: { OPENAI_API_KEY: "nuevo" }, clear: ["OPENAI_API_KEY"] }));
  assert.throws(() => validateCredentialPatch({ updates: { OPENAI_API_KEY: "x".repeat(33000) }, clear: [] }));

  const redacted = redactOutput(`Authorization: Bearer super-secret private_key=hidden ${"x".repeat(2100)}`);
  assert.doesNotMatch(redacted, /super-secret|private_key=hidden/);
  assert.equal(redacted.length, 2000);
});

test("carga configuración válida y degrada de forma segura ante archivo ausente o inválido", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "bot-control-config-"));
  const validPath = path.join(temporary, "valid.json");
  const invalidPath = path.join(temporary, "invalid.json");
  const missingPath = path.join(temporary, "missing.json");
  try {
    await writeFile(validPath, JSON.stringify(sampleConfig(temporary)), "utf8");
    await writeFile(invalidPath, "{no-es-json", "utf8");
    const valid = await loadRuntimeConfig(validPath);
    const invalid = await loadRuntimeConfig(invalidPath);
    const missing = await loadRuntimeConfig(missingPath);
    assert.equal(valid.error, null);
    assert.ok(valid.config.bots.galerazo);
    assert.match(invalid.error, /inválida/i);
    assert.match(missing.error, /Falta/i);
    assert.deepEqual(missing.config.bots, {});
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("inspecciona scripts e imagen sin elevar permisos", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "bot-control-inspect-"));
  try {
    const deployDirectory = path.join(temporary, "scripts", "deploy");
    const outputDirectory = path.join(temporary, "deploy", "out");
    await mkdir(deployDirectory, { recursive: true });
    await mkdir(outputDirectory, { recursive: true });
    for (const script of [
      "Publish-DockerImage.ps1",
      "Deploy-Gce.ps1",
      "Rollback-Gce.ps1",
      "Get-GceBotSecretStatus.ps1",
      "Patch-GceBotSecrets.ps1",
    ]) {
      await writeFile(path.join(deployDirectory, script), "# test", "utf8");
    }
    await writeFile(path.join(outputDirectory, "last-image.txt"), "registry.example/project/image:latest\n", "utf8");
    const config = parseRuntimeConfig(sampleConfig(temporary));
    const state = { config, error: null };
    const ready = await inspectBot(state, "galerazo");
    assert.equal(ready.configured, true);
    assert.equal(ready.latestImage, "registry.example/project/image:latest");
    assert.equal(ready.checks.find((check) => check.id === "scripts").ok, true);

    await writeFile(path.join(outputDirectory, "last-image.txt"), "imagen inválida", "utf8");
    assert.equal((await inspectBot(state, "galerazo")).latestImage, null);
    await rm(path.join(outputDirectory, "last-image.txt"));
    assert.equal((await inspectBot(state, "galerazo")).latestImage, null);

    await rm(path.join(deployDirectory, "Patch-GceBotSecrets.ps1"));
    const missingScript = await inspectBot(state, "galerazo");
    assert.equal(missingScript.checks.find((check) => check.id === "credential-scripts").ok, false);

    const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
    const environment = {
      path: process.env[pathKey],
      localAppData: process.env.LOCALAPPDATA,
      programFiles: process.env.ProgramFiles,
    };
    try {
      process.env[pathKey] = temporary;
      process.env.LOCALAPPDATA = temporary;
      process.env.ProgramFiles = temporary;
      const missingTools = await inspectBot(state, "galerazo");
      assert.equal(missingTools.checks.find((check) => check.id === "powershell").ok, false);
      assert.equal(missingTools.checks.find((check) => check.id === "git").ok, false);
    } finally {
      if (environment.path === undefined) delete process.env[pathKey];
      else process.env[pathKey] = environment.path;
      if (environment.localAppData === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = environment.localAppData;
      if (environment.programFiles === undefined) delete process.env.ProgramFiles;
      else process.env.ProgramFiles = environment.programFiles;
    }

    const missing = await inspectBot(state, "desconocido");
    assert.equal(missing.configured, false);
    assert.equal(missing.readiness.release, false);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("rechaza respuestas de credenciales incompletas o sin JSON válido", async () => {
  const bot = parseRuntimeConfig(sampleConfig(path.resolve("C:/bots/galerazo"))).bots.galerazo;
  await assert.rejects(() => inspectCredentialStatus(bot, async () => ({ stdout: "solo texto" })));
  await assert.rejects(() => inspectCredentialStatus(bot, async () => ({ stdout: "{json roto}\n[]" })));
  await assert.rejects(() => inspectCredentialStatus(bot, async () => ({
    stdout: JSON.stringify({ ...credentialFields(), OPENAI_API_KEY: "sí" }),
  })));
  const valid = await inspectCredentialStatus(bot, async () => ({
    stdout: `mensaje\n{json roto}\n${JSON.stringify(credentialFields(false))}`,
  }));
  assert.equal(valid.TELEGRAM_BOT_TOKEN, false);
});

test("ejecuta deploy y rollback y conserva salida saneada", async () => {
  const bot = parseRuntimeConfig(sampleConfig(path.resolve("C:/bots/galerazo"))).bots.galerazo;
  const calls = [];
  const manager = new DeploymentJobManager({
    readTextFile: async () => "registry.example/project/image:latest\n",
    spawnProcess: (command, args, options) => {
      calls.push({ command, args, options });
      return createChild({ stdout: "línea completa\nresto", stderr: "warning\n" });
    },
  });
  const deploy = await waitForJob(manager.start(bot, "deploy"));
  const rollback = await waitForJob(manager.start(bot, "rollback"));
  assert.equal(deploy.status, "succeeded");
  assert.equal(rollback.status, "succeeded");
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.options.shell === false), true);
  assert.ok(deploy.logs.some((entry) => entry.message === "resto"));
  assert.ok(deploy.logs.some((entry) => entry.message === "warning"));
});

test("falla jobs inválidos, limita logs y evita operaciones simultáneas", async () => {
  const bot = parseRuntimeConfig(sampleConfig(path.resolve("C:/bots/galerazo"))).bots.galerazo;
  const pendingChild = createChild({ autoFinish: false });
  const pendingManager = new DeploymentJobManager({
    readTextFile: async () => "registry.example/project/image:latest",
    spawnProcess: () => pendingChild,
  });
  const pending = pendingManager.start(bot, "deploy");
  assert.equal(pendingManager.get(pending.id), pending);
  assert.equal(pendingManager.get("ausente"), null);
  assert.equal(pendingManager.getActive(bot.id), pending);
  assert.equal(pendingManager.getActiveCount(), 1);
  assert.throws(() => pendingManager.start(bot, "rollback"), (error) => error.statusCode === 409);
  await new Promise((resolve) => setImmediate(resolve));
  pendingManager.stopChildren();
  assert.equal(pendingChild.killed, true);
  pendingChild.emit("close", 0);
  await waitForJob(pending);

  const lines = Array.from({ length: 510 }, (_, index) => `línea ${index}`).join("\n");
  const noisyManager = new DeploymentJobManager({
    readTextFile: async () => "registry.example/project/image:latest",
    spawnProcess: () => createChild({ stdout: lines }),
  });
  const noisy = await waitForJob(noisyManager.start(bot, "deploy"));
  assert.equal(noisy.logs.length, 500);

  const bufferedManager = new DeploymentJobManager({
    readTextFile: async () => "registry.example/project/image:latest",
    spawnProcess: () => createChild({ stdout: "x".repeat(8101) }),
  });
  const buffered = await waitForJob(bufferedManager.start(bot, "deploy"));
  assert.ok(buffered.logs.some((entry) => entry.message.length === 2000));

  const invalidImage = new DeploymentJobManager({
    readTextFile: async () => "imagen inválida",
    spawnProcess: () => createChild(),
  });
  assert.equal((await waitForJob(invalidImage.start(bot, "release"))).status, "failed");

  const forbidden = new DeploymentJobManager();
  assert.match((await waitForJob(forbidden.start(bot, "desconocida"))).error, /no permitida/i);

  const failedProcess = new DeploymentJobManager({
    readTextFile: async () => "registry.example/project/image:latest",
    spawnProcess: () => createChild({ code: null, stderr: "password=secreto" }),
  });
  const failed = await waitForJob(failedProcess.start(bot, "deploy"));
  assert.equal(failed.status, "failed");
  assert.doesNotMatch(JSON.stringify(failed), /password=secreto/);

  const spawnError = new DeploymentJobManager({
    readTextFile: async () => "registry.example/project/image:latest",
    spawnProcess: () => createChild({ error: new Error("spawn falló") }),
  });
  assert.match((await waitForJob(spawnError.start(bot, "deploy"))).error, /spawn falló/);
});

test("cubre rutas exitosas, preflight, CORS y consulta de jobs", async () => {
  const jobs = new Map([["job-visible", { id: "job-visible", status: "running" }]]);
  let stopped = false;
  const started = [];
  const jobManager = {
    getActiveCount: () => 1,
    getActive: () => jobs.get("job-visible"),
    get: (id) => jobs.get(id) ?? null,
    start: (_bot, action, options) => {
      const job = { id: `job-${action}`, action, status: "queued", options };
      started.push(job);
      return job;
    },
    stopChildren: () => { stopped = true; },
  };
  const inspection = {
    configured: true,
    target: { instance: "galerazo-prod" },
    latestImage: "registry.example/image:latest",
    readiness: { release: true, deploy: true, rollback: true, credentials: true },
    checks: [],
  };
  const harness = await startTestServer({
    jobManager,
    botInspector: async () => inspection,
    credentialInspector: async () => credentialFields(),
  });
  try {
    const health = await fetch(`${harness.base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).activeJobs, 1);

    const missingOrigin = await fetch(`${harness.base}/api/health`, { method: "OPTIONS" });
    assert.equal(missingOrigin.status, 400);
    const preflight = await fetch(`${harness.base}/api/health`, { method: "OPTIONS", headers: { Origin: allowedOrigin } });
    assert.equal(preflight.status, 204);

    const deployment = await fetch(`${harness.base}/api/bots/galerazo/deployment`, { headers: { Origin: allowedOrigin } });
    assert.equal(deployment.status, 200);
    assert.equal((await deployment.json()).activeJob.id, "job-visible");

    const credentials = await fetch(`${harness.base}/api/bots/galerazo/credentials`, { headers: { Origin: allowedOrigin } });
    assert.equal(credentials.status, 200);
    assert.equal((await credentials.json()).writable, true);

    assert.equal((await fetch(`${harness.base}/api/jobs/job-visible`, { headers: { Origin: allowedOrigin } })).status, 200);
    assert.equal((await fetch(`${harness.base}/api/jobs/job-ausente`, { headers: { Origin: allowedOrigin } })).status, 404);

    const release = await fetch(`${harness.base}/api/bots/galerazo/release`, {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json", "X-Bot-Control-Action": "release" },
      body: JSON.stringify({ confirmation: "galerazo", tag: "release-1" }),
    });
    assert.equal(release.status, 202);

    const credentialUpdate = await fetch(`${harness.base}/api/bots/galerazo/credentials`, {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json", "X-Bot-Control-Action": "credentials" },
      body: JSON.stringify({ confirmation: "galerazo", patch: { updates: { OPENAI_API_KEY: "valor-test" }, clear: [] } }),
    });
    assert.equal(credentialUpdate.status, 202);
    assert.deepEqual(started.map((job) => job.action), ["release", "credentials"]);
    assert.equal((await fetch(`${harness.base}/no-existe`, { headers: { Origin: allowedOrigin } })).status, 404);
  } finally {
    await harness.close();
  }
  assert.equal(stopped, true);
});

test("cubre rechazos de escritura y errores saneados de la API", async () => {
  let ready = true;
  let credentialFailure = false;
  const jobManager = {
    getActiveCount: () => 0,
    getActive: () => null,
    get: () => null,
    start: () => ({ id: "job", status: "queued" }),
    stopChildren() {},
  };
  const botInspector = async () => ({
    readiness: {
      release: ready,
      deploy: ready,
      rollback: ready,
      credentials: ready,
    },
  });
  const harness = await startTestServer({
    jobManager,
    botInspector,
    credentialInspector: async () => {
      if (credentialFailure) throw new Error("secret=valor-que-no-debe-salir");
      return credentialFields();
    },
  });
  const actionUrl = `${harness.base}/api/bots/galerazo/deploy`;
  const actionHeaders = { Origin: allowedOrigin, "Content-Type": "application/json", "X-Bot-Control-Action": "deploy" };
  const credentialUrl = `${harness.base}/api/bots/galerazo/credentials`;
  const credentialHeaders = { Origin: allowedOrigin, "Content-Type": "application/json", "X-Bot-Control-Action": "credentials" };
  try {
    assert.equal((await fetch(actionUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-Bot-Control-Action": "deploy" }, body: "{}" })).status, 403);
    assert.equal((await fetch(actionUrl, { method: "POST", headers: { Origin: allowedOrigin }, body: "{}" })).status, 415);
    assert.equal((await fetch(actionUrl, { method: "POST", headers: { Origin: allowedOrigin, "Content-Type": "application/json" }, body: "{}" })).status, 403);
    assert.equal((await fetch(actionUrl, { method: "POST", headers: actionHeaders, body: "{json roto" })).status, 400);
    assert.equal((await fetch(actionUrl, { method: "POST", headers: actionHeaders, body: JSON.stringify({ confirmation: "otro" }) })).status, 400);
    assert.equal((await fetch(actionUrl, { method: "POST", headers: actionHeaders, body: JSON.stringify({ confirmation: "galerazo", tag: "tag inválido" }) })).status, 400);
    const hugeBody = `{"confirmation":"galerazo","padding":"${"x".repeat(33000)}"}`;
    assert.equal((await fetch(actionUrl, { method: "POST", headers: actionHeaders, body: hugeBody })).status, 413);

    ready = false;
    assert.equal((await fetch(actionUrl, { method: "POST", headers: actionHeaders, body: JSON.stringify({ confirmation: "galerazo" }) })).status, 409);
    ready = true;
    assert.equal((await fetch(`${harness.base}/api/bots/desconocido/deploy`, { method: "POST", headers: actionHeaders, body: JSON.stringify({ confirmation: "desconocido" }) })).status, 409);

    assert.equal((await fetch(credentialUrl, { method: "POST", headers: { Origin: allowedOrigin }, body: "{}" })).status, 415);
    assert.equal((await fetch(credentialUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-Bot-Control-Action": "credentials" }, body: "{}" })).status, 403);
    assert.equal((await fetch(credentialUrl, { method: "POST", headers: credentialHeaders, body: JSON.stringify({ confirmation: "otro", patch: {} }) })).status, 400);
    assert.equal((await fetch(credentialUrl, { method: "POST", headers: credentialHeaders, body: JSON.stringify({ confirmation: "galerazo", patch: {} }) })).status, 500);
    assert.equal((await fetch(`${harness.base}/api/bots/desconocido/credentials`, { method: "POST", headers: credentialHeaders, body: JSON.stringify({ confirmation: "desconocido", patch: { updates: { OPENAI_API_KEY: "x" }, clear: [] } }) })).status, 409);

    ready = false;
    assert.equal((await fetch(credentialUrl, { headers: { Origin: allowedOrigin } })).status, 409);
    assert.equal((await fetch(credentialUrl, { method: "POST", headers: credentialHeaders, body: JSON.stringify({ confirmation: "galerazo", patch: { updates: { OPENAI_API_KEY: "x" }, clear: [] } }) })).status, 409);
    ready = true;
    assert.equal((await fetch(`${harness.base}/api/bots/desconocido/credentials`, { headers: { Origin: allowedOrigin } })).status, 409);

    credentialFailure = true;
    const failedInspection = await fetch(credentialUrl, { headers: { Origin: allowedOrigin } });
    const failedText = await failedInspection.text();
    assert.equal(failedInspection.status, 502);
    assert.doesNotMatch(failedText, /valor-que-no-debe-salir/);
  } finally {
    await harness.close();
  }
});

test("inicia y cierra el agente en un puerto efímero", async () => {
  const previousSigint = new Set(process.listeners("SIGINT"));
  const previousSigterm = new Set(process.listeners("SIGTERM"));
  const originalLog = console.log;
  let message = "";
  let server = null;
  console.log = (value) => { message = String(value); };
  try {
    server = await startAgent({ port: 0 });
    assert.equal(server.listening, true);
    assert.match(message, /Agente local listo/);
  } finally {
    console.log = originalLog;
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    for (const listener of process.listeners("SIGINT")) {
      if (!previousSigint.has(listener)) process.removeListener("SIGINT", listener);
    }
    for (const listener of process.listeners("SIGTERM")) {
      if (!previousSigterm.has(listener)) process.removeListener("SIGTERM", listener);
    }
  }
});
