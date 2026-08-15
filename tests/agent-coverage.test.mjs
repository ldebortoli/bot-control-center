import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  createCredentialUpdateStep,
  createDeployStep,
  createModerationStep,
  createRollbackStep,
  createRuntimeStatusStep,
  createStopStep,
  createTriggerListStep,
  createTriggerMediaStep,
  isValidImageReference,
  isValidOpaqueId,
  isValidTag,
  parseRuntimeConfig,
  powershellStep,
  redactOutput,
  validateCredentialPatch,
} from "../agent/core.mjs";
import { DeploymentJobManager } from "../agent/job-manager.mjs";
import { loadRuntimeConfig } from "../agent/runtime-config.mjs";
import {
  commandExists,
  createAgentServer,
  inspectBot,
  inspectCredentialStatus,
  fetchRemoteTriggerMedia,
  inspectRemoteTriggers,
  inspectRuntimeStatus,
  moderateRemoteTrigger,
  resolveAgentPort,
  runAgentMain,
  startAgent,
  startAgentIfMain,
} from "../agent/server.mjs";

const allowedOrigin = "http://localhost:3000";
const noOperationLock = async () => async () => {};

function deploymentManager(options = {}) {
  return new DeploymentJobManager({ acquireOperationLock: noOperationLock, ...options });
}

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
    dispatch: async (request) => {
      const handler = server.listeners("request")[0];
      return new Promise((resolve, reject) => {
        const result = { body: "", headers: null, status: null };
        const response = {
          writeHead(status, headers) {
            result.status = status;
            result.headers = headers;
          },
          end(body = "") {
            result.body = String(body);
            resolve(result);
          },
        };
        Promise.resolve(handler(request, response)).catch(reject);
      });
    },
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

test("detecta herramientas en Windows y Unix con fallbacks controlados", async () => {
  const calls = [];
  const succeeds = async (command) => { calls.push(command); };
  const fails = async () => { throw new Error("no encontrado"); };

  assert.equal(await commandExists("git", { platform: "win32", runFile: succeeds }), true);
  assert.equal(await commandExists("git", { platform: "linux", runFile: succeeds }), true);
  assert.deepEqual(calls, ["where.exe", "which"]);
  assert.equal(await commandExists("git", { platform: "linux", runFile: fails }), false);

  let fallbackPath = "";
  assert.equal(await commandExists("gcloud", {
    platform: "win32",
    environment: { LOCALAPPDATA: "C:/Local" },
    runFile: fails,
    pathExists: async (target) => { fallbackPath = target; return true; },
  }), true);
  assert.match(fallbackPath, /Google.*gcloud\.cmd$/);

  assert.equal(await commandExists("docker", {
    platform: "win32",
    environment: { ProgramFiles: "C:/Programs" },
    runFile: fails,
    pathExists: async () => false,
  }), false);
  assert.equal(await commandExists("gcloud", { platform: "win32", environment: {}, runFile: fails }), false);
  assert.equal(await commandExists("docker", { platform: "win32", environment: {}, runFile: fails }), false);
  assert.equal(await commandExists("otra", { platform: "win32", environment: {}, runFile: fails }), false);
});

test("inspecciona scripts e imagen sin elevar permisos", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "bot-control-inspect-"));
  try {
    const deployDirectory = path.join(temporary, "scripts", "deploy");
    const outputDirectory = path.join(temporary, "deploy", "out");
    const botctlDirectory = path.join(temporary, "deploy", "gce");
    await mkdir(deployDirectory, { recursive: true });
    await mkdir(outputDirectory, { recursive: true });
    await mkdir(botctlDirectory, { recursive: true });
    for (const script of [
      "Publish-DockerImage.ps1",
      "Deploy-Gce.ps1",
      "Rollback-Gce.ps1",
      "Get-GceBotSecretStatus.ps1",
      "Patch-GceBotSecrets.ps1",
      "Invoke-GceBotctl.ps1",
    ]) {
      await writeFile(path.join(deployDirectory, script), "# test", "utf8");
    }
    await writeFile(path.join(botctlDirectory, "botctl.py"), "# test", "utf8");
    await writeFile(path.join(outputDirectory, "last-image.txt"), "registry.example/project/image:latest\n", "utf8");
    const config = parseRuntimeConfig(sampleConfig(temporary));
    const state = { config, error: null };
    const ready = await inspectBot(state, "galerazo");
    assert.equal(ready.configured, true);
    assert.equal(ready.latestImage, "registry.example/project/image:latest");
    assert.equal(ready.checks.find((check) => check.id === "scripts").ok, true);
    assert.equal(ready.checks.find((check) => check.id === "botctl").ok, true);
    const readinessChecks = Object.fromEntries(ready.checks.map((check) => [check.id, check.ok]));
    assert.equal(
      ready.readiness.stop,
      readinessChecks.repository && readinessChecks.powershell && readinessChecks.gcloud && readinessChecks.botctl,
    );

    await rm(path.join(botctlDirectory, "botctl.py"));
    const missingBotctlRuntime = await inspectBot(state, "galerazo");
    assert.equal(missingBotctlRuntime.checks.find((check) => check.id === "botctl").ok, false);
    assert.equal(missingBotctlRuntime.readiness.runtime, false);

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

test("construye y valida el contrato fijo de botctl", () => {
  const bot = parseRuntimeConfig(sampleConfig(path.resolve("C:/bots/galerazo"))).bots.galerazo;
  assert.equal(isValidOpaqueId("YWJjLTEyMw"), true);
  assert.equal(isValidOpaqueId("con punto."), false);
  assert.equal(isValidOpaqueId(null), false);

  const runtime = createRuntimeStatusStep(bot);
  const triggers = createTriggerListStep(bot);
  const media = createTriggerMediaStep(bot, "YWJjLTEyMw", path.resolve("C:/private/media.bin"));
  const moderation = createModerationStep(bot, "YWJjLTEyMw", "delete-and-block");
  const stop = createStopStep(bot);
  assert.match(runtime.args[4], /Invoke-GceBotctl\.ps1$/);
  assert.ok(triggers.args.includes("triggers"));
  assert.ok(media.args.includes("-OutputFile"));
  assert.ok(moderation.args.includes("-AcknowledgeModeration"));
  assert.ok(stop.args.includes("-AcknowledgeStop"));
  assert.throws(() => createTriggerMediaStep(bot, "inválido", "x"));
  assert.throws(() => createTriggerMediaStep(bot, "YWJj", ""));
  assert.throws(() => createModerationStep(bot, "inválido", "block-user"));
  assert.throws(() => createModerationStep(bot, "YWJj", "otra"));
});

test("interpreta estado, filtra polls exitosos y procesa triggers, moderación y multimedia", async () => {
  const bot = parseRuntimeConfig(sampleConfig(path.resolve("C:/bots/galerazo"))).bots.galerazo;
  const runtime = {
    vm: { status: "running" },
    container: { status: "running" },
    telegram: { connected: true },
    resources: {},
    logs: [
      '2026-07-29T21:03:22Z INFO httpx: HTTP Request: POST https://api.telegram.org/bot[OCULTO]/getUpdates "HTTP/1.1 200 OK"',
      '2026-07-29T21:03:23Z INFO HTTPX: POST https://api.telegram.org/bot[OCULTO]/GETUPDATES "HTTP/2 200 OK"',
      '2026-07-29T21:03:24Z WARNING httpx: POST https://api.telegram.org/bot[OCULTO]/getUpdates "HTTP/1.1 429 Too Many Requests"',
      '2026-07-29T21:03:25Z ERROR telegram: getUpdates falló por timeout',
      '2026-07-29T21:03:26Z INFO httpx: POST https://api.telegram.org/bot[OCULTO]/sendMessage "HTTP/1.1 200 OK"',
    ],
  };
  const runJson = (payload) => async (_command, _args, options) => {
    assert.equal(options.shell, false);
    return { stdout: `gcloud info\n{json roto\n${JSON.stringify(payload)}\n` };
  };
  assert.deepEqual(await inspectRuntimeStatus(bot, runJson(runtime)), {
    ...runtime,
    logs: runtime.logs.slice(2),
  });
  await assert.rejects(() => inspectRuntimeStatus(bot, runJson({ vm: {} })), /incompleto/);
  await assert.rejects(() => inspectRuntimeStatus(bot, async () => ({ stdout: "sin json" })), /estado operativo válido/);

  const triggerPayload = { observedAt: "ahora", triggers: [{ id: "YWJj" }] };
  assert.deepEqual(await inspectRemoteTriggers(bot, runJson(triggerPayload)), triggerPayload);
  await assert.rejects(() => inspectRemoteTriggers(bot, runJson({ triggers: null })), /incompleto/);
  await assert.rejects(() => inspectRemoteTriggers(bot, async () => ({ stdout: "{roto" })), /triggers válidos/);

  const moderation = { triggerDeleted: true, userBlocked: true, announcementSent: false };
  assert.deepEqual(await moderateRemoteTrigger(bot, "YWJj", "delete-and-block", runJson(moderation)), moderation);
  await assert.rejects(
    () => moderateRemoteTrigger(bot, "YWJj", "block-user", runJson({ ...moderation, userBlocked: "sí" })),
    /incompleto/,
  );
  await assert.rejects(
    () => moderateRemoteTrigger(bot, "YWJj", "block-user", async () => ({ stdout: "ningún json" })),
    /resultado de moderación/,
  );

  const removals = [];
  const media = await fetchRemoteTriggerMedia(bot, "YWJj", {
    makeTempDirectory: async () => path.resolve("C:/private/media-test"),
    runFile: runJson({ filename: "foto real.jpg", mimeType: "image/jpeg" }),
    readBinaryFile: async () => Buffer.from("media-real"),
    removePath: async (...args) => { removals.push(args); },
  });
  assert.equal(media.data.toString(), "media-real");
  assert.equal(media.mimeType, "image/jpeg");
  assert.equal(removals[0][1].recursive, true);
  await assert.rejects(() => fetchRemoteTriggerMedia(bot, "YWJj", {
    makeTempDirectory: async () => path.resolve("C:/private/media-test-invalid"),
    runFile: runJson({ filename: 1, mimeType: null }),
    removePath: async () => {},
  }), /incompletos/);
  await assert.rejects(() => fetchRemoteTriggerMedia(bot, "YWJj", {
    makeTempDirectory: async () => path.resolve("C:/private/media-test-invalid-mime"),
    runFile: runJson({ filename: "archivo.bin", mimeType: null }),
    removePath: async () => {},
  }), /incompletos/);
  await assert.rejects(() => fetchRemoteTriggerMedia(bot, "YWJj", {
    makeTempDirectory: async () => { throw new Error("sin temporal"); },
  }), /sin temporal/);
});

test("ejecuta deploy y rollback y conserva salida saneada", async () => {
  const bot = parseRuntimeConfig(sampleConfig(path.resolve("C:/bots/galerazo"))).bots.galerazo;
  const calls = [];
  const manager = deploymentManager({
    readTextFile: async () => "registry.example/project/image:latest\n",
    spawnProcess: (command, args, options) => {
      calls.push({ command, args, options });
      return createChild({ stdout: "línea completa\n   \nresto", stderr: "warning\n" });
    },
  });
  const deploy = await waitForJob(manager.start(bot, "deploy"));
  const rollback = await waitForJob(manager.start(bot, "rollback"));
  const stop = await waitForJob(manager.start(bot, "stop"));
  assert.equal(deploy.status, "succeeded");
  assert.equal(rollback.status, "succeeded");
  assert.equal(stop.status, "succeeded");
  assert.equal(calls.length, 3);
  assert.match(calls[2].args[4], /Invoke-GceBotctl\.ps1$/);
  assert.equal(calls.every((call) => call.options.shell === false), true);
  assert.ok(deploy.logs.some((entry) => entry.message === "resto"));
  assert.ok(deploy.logs.some((entry) => entry.message === "warning"));
});

test("falla jobs inválidos, limita logs y evita operaciones simultáneas", async () => {
  const bot = parseRuntimeConfig(sampleConfig(path.resolve("C:/bots/galerazo"))).bots.galerazo;
  const pendingChild = createChild({ autoFinish: false });
  const pendingManager = deploymentManager({
    readTextFile: async () => "registry.example/project/image:latest",
    spawnProcess: () => pendingChild,
  });
  const pending = pendingManager.start(bot, "deploy");
  assert.equal(pendingManager.get(pending.id), pending);
  assert.equal(pendingManager.get("ausente"), null);
  assert.equal(pendingManager.getActive(bot.id), pending);
  assert.equal(pendingManager.getActiveCount(), 1);
  assert.throws(() => pendingManager.start(bot, "rollback"), (error) => error.statusCode === 409);
  for (let index = 0; index < 100 && !pending.currentStep; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  pendingManager.stopChildren();
  assert.equal(pendingChild.killed, true);
  pendingChild.emit("close", 0);
  await waitForJob(pending);

  const lines = Array.from({ length: 510 }, (_, index) => `línea ${index}`).join("\n");
  const noisyManager = deploymentManager({
    readTextFile: async () => "registry.example/project/image:latest",
    spawnProcess: () => createChild({ stdout: lines }),
  });
  const noisy = await waitForJob(noisyManager.start(bot, "deploy"));
  assert.equal(noisy.logs.length, 500);

  const bufferedManager = deploymentManager({
    readTextFile: async () => "registry.example/project/image:latest",
    spawnProcess: () => createChild({ stdout: "x".repeat(8101) }),
  });
  const buffered = await waitForJob(bufferedManager.start(bot, "deploy"));
  assert.ok(buffered.logs.some((entry) => entry.message.length === 2000));

  const invalidImage = deploymentManager({
    readTextFile: async () => "imagen inválida",
    spawnProcess: () => createChild(),
  });
  assert.equal((await waitForJob(invalidImage.start(bot, "release"))).status, "failed");

  const forbidden = deploymentManager();
  assert.match((await waitForJob(forbidden.start(bot, "desconocida"))).error, /no permitida/i);

  const failedProcess = deploymentManager({
    readTextFile: async () => "registry.example/project/image:latest",
    spawnProcess: () => createChild({ code: null, stderr: "password=secreto" }),
  });
  const failed = await waitForJob(failedProcess.start(bot, "deploy"));
  assert.equal(failed.status, "failed");
  assert.doesNotMatch(JSON.stringify(failed), /password=secreto/);

  const spawnError = deploymentManager({
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
    readiness: { release: true, deploy: true, rollback: true, credentials: true, runtime: true, triggers: true, stop: true },
    checks: [],
  };
  const harness = await startTestServer({
    jobManager,
    botInspector: async () => inspection,
    credentialInspector: async () => credentialFields(),
    runtimeInspector: async () => ({ vm: { status: "running" }, container: { status: "running" }, telegram: { connected: true }, resources: {}, logs: [] }),
    triggerInspector: async () => ({
      observedAt: "2026-07-22T12:00:00Z",
      triggers: [
        { id: "YWJj", name: "Con media", media: { filename: "foto.jpg", mimeType: "image/jpeg", kind: "image", source: "remote" } },
        { id: "ZGVm", name: "Texto" },
      ],
    }),
    triggerMediaFetcher: async () => ({ data: Buffer.from("media"), filename: "foto real.jpg", mimeType: "image/jpeg" }),
    triggerModerator: async () => ({ triggerDeleted: true, userBlocked: false, announcementSent: true }),
  });
  try {
    const health = await fetch(`${harness.base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).activeJobs, 1);
    const missingUrl = await harness.dispatch({ headers: { origin: allowedOrigin }, method: "GET", url: undefined });
    assert.equal(missingUrl.status, 404);

    const missingOrigin = await fetch(`${harness.base}/api/health`, { method: "OPTIONS" });
    assert.equal(missingOrigin.status, 400);
    const preflight = await fetch(`${harness.base}/api/health`, { method: "OPTIONS", headers: { Origin: allowedOrigin } });
    assert.equal(preflight.status, 204);

    const deployment = await fetch(`${harness.base}/api/bots/galerazo/deployment`, { headers: { Origin: allowedOrigin } });
    assert.equal(deployment.status, 200);
    assert.equal((await deployment.json()).activeJob.id, "job-visible");

    const runtime = await fetch(`${harness.base}/api/bots/galerazo/runtime`, { headers: { Origin: allowedOrigin } });
    assert.equal(runtime.status, 200);
    assert.equal((await runtime.json()).vm.status, "running");

    const triggers = await fetch(`${harness.base}/api/bots/galerazo/triggers`, { headers: { Origin: allowedOrigin } });
    assert.equal(triggers.status, 200);
    const triggerBody = await triggers.json();
    assert.match(triggerBody.triggers[0].media.url, /\/triggers\/YWJj\/media$/);
    assert.equal(triggerBody.triggers[1].media, undefined);

    const media = await fetch(`${harness.base}/api/bots/galerazo/triggers/YWJj/media`, { headers: { Origin: allowedOrigin } });
    assert.equal(media.status, 200);
    assert.equal(media.headers.get("content-type"), "image/jpeg");
    assert.match(media.headers.get("content-disposition"), /foto_real\.jpg/);
    assert.equal(await media.text(), "media");

    const moderation = await fetch(`${harness.base}/api/bots/galerazo/triggers/moderate`, {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json", "X-Bot-Control-Action": "moderate-trigger" },
      body: JSON.stringify({ confirmation: "galerazo", triggerId: "YWJj", action: "delete-trigger" }),
    });
    assert.equal(moderation.status, 200);

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

    const stop = await fetch(`${harness.base}/api/bots/galerazo/stop`, {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json", "X-Bot-Control-Action": "stop" },
      body: JSON.stringify({ confirmation: "galerazo" }),
    });
    assert.equal(stop.status, 202);

    const credentialUpdate = await fetch(`${harness.base}/api/bots/galerazo/credentials`, {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json", "X-Bot-Control-Action": "credentials" },
      body: JSON.stringify({ confirmation: "galerazo", patch: { updates: { OPENAI_API_KEY: "valor-test" }, clear: [] } }),
    });
    assert.equal(credentialUpdate.status, 202);
    assert.deepEqual(started.map((job) => job.action), ["release", "stop", "credentials"]);
    assert.equal((await fetch(`${harness.base}/no-existe`, { headers: { Origin: allowedOrigin } })).status, 404);
  } finally {
    await harness.close();
  }
  assert.equal(stopped, true);
});

test("cubre rechazos de escritura y errores saneados de la API", async () => {
  let ready = true;
  let credentialFailure = false;
  let plainJobFailure = false;
  const jobManager = {
    getActiveCount: () => 0,
    getActive: () => null,
    get: () => null,
    start: () => {
      if (plainJobFailure) {
        const failure = { toString: () => "fallo plano" };
        throw failure;
      }
      return { id: "job", status: "queued" };
    },
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
    assert.equal((await fetch(actionUrl, { method: "POST", headers: actionHeaders })).status, 400);
    assert.equal((await fetch(actionUrl, { method: "POST", headers: actionHeaders, body: JSON.stringify({ confirmation: "otro" }) })).status, 400);
    assert.equal((await fetch(actionUrl, { method: "POST", headers: actionHeaders, body: JSON.stringify({ confirmation: "galerazo", tag: "tag inválido" }) })).status, 400);
    const hugeBody = `{"confirmation":"galerazo","padding":"${"x".repeat(33000)}"}`;
    assert.equal((await fetch(actionUrl, { method: "POST", headers: actionHeaders, body: hugeBody })).status, 413);

    ready = false;
    assert.equal((await fetch(actionUrl, { method: "POST", headers: actionHeaders, body: JSON.stringify({ confirmation: "galerazo" }) })).status, 409);
    ready = true;
    assert.equal((await fetch(`${harness.base}/api/bots/desconocido/deploy`, { method: "POST", headers: actionHeaders, body: JSON.stringify({ confirmation: "desconocido" }) })).status, 409);

    assert.equal((await fetch(credentialUrl, { method: "POST", headers: { Origin: allowedOrigin }, body: "{}" })).status, 415);
    assert.equal((await fetch(credentialUrl, { method: "POST", headers: { Origin: allowedOrigin, "X-Bot-Control-Action": "credentials" } })).status, 415);
    assert.equal((await fetch(credentialUrl, { method: "POST", headers: { Origin: allowedOrigin, "Content-Type": "text/plain", "X-Bot-Control-Action": "credentials" }, body: "{}" })).status, 415);
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

    plainJobFailure = true;
    const plainFailure = await fetch(credentialUrl, {
      method: "POST",
      headers: credentialHeaders,
      body: JSON.stringify({ confirmation: "galerazo", patch: { updates: { OPENAI_API_KEY: "x" }, clear: [] } }),
    });
    assert.equal(plainFailure.status, 500);
    assert.match(await plainFailure.text(), /fallo plano/);
  } finally {
    await harness.close();
  }
});

test("cubre guardrails y fallos de estado, triggers, media y moderación", async () => {
  let runtimeReady = true;
  let triggersReady = true;
  let runtimeFailure = false;
  let triggerFailure = false;
  let mediaFailure = false;
  let fallbackMedia = false;
  let announcementSent = false;
  const jobManager = {
    getActiveCount: () => 0,
    getActive: () => null,
    get: () => null,
    start: () => ({ id: "job", status: "queued" }),
    stopChildren() {},
  };
  const botInspector = async () => ({
    readiness: {
      release: true,
      deploy: true,
      rollback: true,
      credentials: true,
      runtime: runtimeReady,
      triggers: triggersReady,
      stop: true,
    },
  });
  const harness = await startTestServer({
    jobManager,
    botInspector,
    runtimeInspector: async () => {
      if (runtimeFailure) throw new Error("token=runtime-secreto");
      return { vm: {}, container: {}, telegram: {}, resources: {}, logs: [] };
    },
    triggerInspector: async () => {
      if (triggerFailure) throw { toString: () => "fallo triggers plano" };
      return { observedAt: "ahora", triggers: [] };
    },
    triggerMediaFetcher: async () => {
      if (mediaFailure) throw new Error("password=media-secreta");
      return fallbackMedia
        ? { data: Buffer.from("x"), filename: "", mimeType: "mime inválido" }
        : { data: Buffer.from("x"), filename: "x.bin", mimeType: "application/octet-stream" };
    },
    triggerModerator: async () => ({ triggerDeleted: false, userBlocked: true, announcementSent }),
  });
  const moderationUrl = `${harness.base}/api/bots/galerazo/triggers/moderate`;
  const moderationHeaders = { Origin: allowedOrigin, "Content-Type": "application/json", "X-Bot-Control-Action": "moderate-trigger" };
  try {
    assert.equal((await fetch(`${harness.base}/api/bots/desconocido/runtime`, { headers: { Origin: allowedOrigin } })).status, 409);
    runtimeReady = false;
    assert.equal((await fetch(`${harness.base}/api/bots/galerazo/runtime`, { headers: { Origin: allowedOrigin } })).status, 409);
    runtimeReady = true;
    runtimeFailure = true;
    const runtimeError = await fetch(`${harness.base}/api/bots/galerazo/runtime`, { headers: { Origin: allowedOrigin } });
    assert.equal(runtimeError.status, 502);
    assert.doesNotMatch(await runtimeError.text(), /runtime-secreto/);
    runtimeFailure = false;

    assert.equal((await fetch(`${harness.base}/api/bots/desconocido/triggers`, { headers: { Origin: allowedOrigin } })).status, 409);
    triggersReady = false;
    assert.equal((await fetch(`${harness.base}/api/bots/galerazo/triggers`, { headers: { Origin: allowedOrigin } })).status, 409);
    assert.equal((await fetch(`${harness.base}/api/bots/galerazo/triggers/YWJj/media`, { headers: { Origin: allowedOrigin } })).status, 409);
    triggersReady = true;
    triggerFailure = true;
    const triggerError = await fetch(`${harness.base}/api/bots/galerazo/triggers`, { headers: { Origin: allowedOrigin } });
    assert.equal(triggerError.status, 502);
    assert.match(await triggerError.text(), /fallo triggers plano/);
    triggerFailure = false;

    const tooLongId = "a".repeat(2049);
    assert.equal((await fetch(`${harness.base}/api/bots/galerazo/triggers/${tooLongId}/media`, { headers: { Origin: allowedOrigin } })).status, 400);
    assert.equal((await fetch(`${harness.base}/api/bots/desconocido/triggers/YWJj/media`, { headers: { Origin: allowedOrigin } })).status, 409);
    mediaFailure = true;
    const mediaError = await fetch(`${harness.base}/api/bots/galerazo/triggers/YWJj/media`, { headers: { Origin: allowedOrigin } });
    assert.equal(mediaError.status, 502);
    assert.doesNotMatch(await mediaError.text(), /media-secreta/);
    mediaFailure = false;
    fallbackMedia = true;
    const fallback = await fetch(`${harness.base}/api/bots/galerazo/triggers/YWJj/media`);
    assert.equal(fallback.status, 200);
    assert.equal(fallback.headers.get("content-type"), "application/octet-stream");
    assert.match(fallback.headers.get("content-disposition"), /trigger-media\.bin/);

    assert.equal((await fetch(moderationUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-Bot-Control-Action": "moderate-trigger" }, body: "{}" })).status, 403);
    assert.equal((await fetch(moderationUrl, { method: "POST", headers: { Origin: allowedOrigin }, body: "{}" })).status, 415);
    assert.equal((await fetch(moderationUrl, { method: "POST", headers: { Origin: allowedOrigin, "Content-Type": "application/json" }, body: "{}" })).status, 403);
    assert.equal((await fetch(moderationUrl, { method: "POST", headers: moderationHeaders, body: JSON.stringify({ confirmation: "otro", triggerId: "YWJj", action: "block-user" }) })).status, 400);
    assert.equal((await fetch(moderationUrl, { method: "POST", headers: moderationHeaders, body: JSON.stringify({ confirmation: "galerazo", triggerId: "inválido", action: "block-user" }) })).status, 400);
    assert.equal((await fetch(moderationUrl, { method: "POST", headers: moderationHeaders, body: JSON.stringify({ confirmation: "galerazo", triggerId: "YWJj", action: "otra" }) })).status, 400);
    assert.equal((await fetch(`${harness.base}/api/bots/desconocido/triggers/moderate`, { method: "POST", headers: moderationHeaders, body: JSON.stringify({ confirmation: "desconocido", triggerId: "YWJj", action: "block-user" }) })).status, 409);
    triggersReady = false;
    assert.equal((await fetch(moderationUrl, { method: "POST", headers: moderationHeaders, body: JSON.stringify({ confirmation: "galerazo", triggerId: "YWJj", action: "block-user" }) })).status, 409);
    triggersReady = true;
    const partial = await fetch(moderationUrl, { method: "POST", headers: moderationHeaders, body: JSON.stringify({ confirmation: "galerazo", triggerId: "YWJj", action: "block-user" }) });
    assert.equal(partial.status, 207);
  } finally {
    await harness.close();
  }
});

test("ejecuta el entrypoint con éxito y reporta errores normalizados", async () => {
  const reports = [];
  const exits = [];
  const report = (message) => { reports.push(message); };
  const exit = (code) => { exits.push(code); };

  await runAgentMain(async () => {}, report, exit);
  await runAgentMain(async () => { throw new Error("fallo Error"); }, report, exit);
  const plainFailure = { toString: () => "fallo plano" };
  await runAgentMain(async () => { throw plainFailure; }, report, exit);
  assert.deepEqual(reports, ["fallo Error", "fallo plano"]);
  assert.deepEqual(exits, [1, 1]);

  const serverPath = path.resolve("agent/server.mjs");
  const serverUrl = pathToFileURL(serverPath).href;
  let dependencies = null;
  const started = startAgentIfMain(serverPath, serverUrl, async (...args) => {
    dependencies = args;
    return "iniciado";
  });
  assert.equal(await started, "iniciado");
  assert.equal(dependencies[0], startAgent);
  assert.equal(dependencies[1], console.error);
  assert.equal(dependencies[2], process.exit);
  assert.equal(startAgentIfMain(null, serverUrl, async () => {}), null);
  assert.equal(startAgentIfMain(serverPath, "file:///otro-modulo.mjs", async () => {}), null);
});

test("resuelve el puerto, inicia el agente y procesa su señal de cierre", async () => {
  const previousSigint = new Set(process.listeners("SIGINT"));
  const previousSigterm = new Set(process.listeners("SIGTERM"));
  const originalLog = console.log;
  const originalExit = process.exit;
  const originalPort = process.env.BOT_CONTROL_CENTER_AGENT_PORT;
  let message = "";
  let server = null;
  let exitCode = null;
  let resolveExit;
  const exited = new Promise((resolve) => { resolveExit = resolve; });
  console.log = (value) => { message = String(value); };
  process.exit = (code) => { exitCode = code; resolveExit(); };
  process.env.BOT_CONTROL_CENTER_AGENT_PORT = "0";
  try {
    assert.equal(resolveAgentPort(undefined), 43121);
    assert.equal(resolveAgentPort("0"), 0);
    server = await startAgent();
    assert.equal(server.listening, true);
    assert.match(message, /Agente local listo/);
    const shutdown = process.listeners("SIGINT").find((listener) => !previousSigint.has(listener));
    assert.equal(typeof shutdown, "function");
    shutdown();
    await exited;
    assert.equal(exitCode, 0);
    assert.equal(server.listening, false);
  } finally {
    console.log = originalLog;
    process.exit = originalExit;
    if (originalPort === undefined) delete process.env.BOT_CONTROL_CENTER_AGENT_PORT;
    else process.env.BOT_CONTROL_CENTER_AGENT_PORT = originalPort;
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    for (const listener of process.listeners("SIGINT")) {
      if (!previousSigint.has(listener)) process.removeListener("SIGINT", listener);
    }
    for (const listener of process.listeners("SIGTERM")) {
      if (!previousSigterm.has(listener)) process.removeListener("SIGTERM", listener);
    }
  }
});
