import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseRuntimeConfig, validateReleaseSchedule } from "../agent/core.mjs";
import { DeploymentJobManager } from "../agent/job-manager.mjs";
import {
  acquireBotOperationLock,
  isProcessActive,
  readScheduledRunState,
  scheduledReleasePaths,
  scheduledRunState,
  writeScheduledRunState,
} from "../agent/release-scheduler.mjs";
import { saveBotReleaseSchedule } from "../agent/runtime-config.mjs";
import { createAgentServer, installWindowsReleaseSchedule } from "../agent/server.mjs";
import { runScheduledRelease } from "../scripts/run-scheduled-release.mjs";

const allowedOrigin = "http://localhost:3000";
const localCommit = "b".repeat(40);
const remoteCommit = "a".repeat(40);
const dependencyCommit = "c".repeat(40);
const publishedImage = `us-central1-docker.pkg.dev/demo/bots/galerazobot:${localCommit.slice(0, 12)}`;

function runtimeConfig(repositoryPath, releaseSchedule = {
  enabled: true,
  updateDependencies: false,
  dayOfMonth: 1,
  time: "03:00",
  branch: "main",
  remote: "origin",
}) {
  const bot = {
    repositoryPath,
    projectId: "project-123",
    location: "us-central1",
    repository: "bots",
    zone: "us-central1-a",
    instance: "galerazo-prod",
  };
  if (releaseSchedule !== null) bot.releaseSchedule = releaseSchedule;
  return {
    allowedOrigins: [allowedOrigin, "http://127.0.0.1:3000"],
    bots: {
      galerazo: bot,
    },
  };
}

function childProcess(code = 0) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  queueMicrotask(() => child.emit("close", code));
  return child;
}

async function waitForJob(job) {
  for (let index = 0; index < 100 && ["queued", "running"].includes(job.status); index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(["succeeded", "failed", "skipped"].includes(job.status));
  return job;
}

function scheduledHarness({
  status = "",
  dependencyStatus = "",
  updatedCommit = dependencyCommit,
  local = localCommit,
  remote = remoteCommit,
  ancestors = new Set([[remoteCommit, localCommit].join(" ")]),
  liveImage = "registry.example/bot:old",
  snapshotImage = publishedImage,
  failGit = null,
  failWorktreeRemoval = false,
  worktreeRemovalError = null,
  failPrune = false,
  stateFailure = false,
  releaseSchedule,
} = {}) {
  const repositoryPath = path.resolve("C:/bots/galerazo");
  const bot = parseRuntimeConfig(runtimeConfig(repositoryPath, releaseSchedule)).bots.galerazo;
  const temporaryRoot = path.resolve("C:/temporary/scheduled-release");
  const snapshotRoot = path.join(temporaryRoot, "source");
  const gitCalls = [];
  const processCalls = [];
  const stateWrites = [];
  const fileWrites = [];
  let lockReleased = false;
  let removed = false;

  const runFile = async (_command, args, options) => {
    assert.equal(options.shell, false);
    gitCalls.push(args);
    if (failGit && args.join(" ").includes(failGit.match)) throw failGit.error;
    if (args[0] === "status") {
      return { stdout: options.cwd === snapshotRoot ? dependencyStatus : status };
    }
    if (args[0] === "rev-parse" && args[1] === "HEAD") return { stdout: updatedCommit };
    if (args[0] === "rev-parse" && args[1].startsWith("refs/heads/")) return { stdout: local };
    if (args[0] === "rev-parse" && args[1].startsWith("refs/remotes/")) return { stdout: remote };
    if (args[0] === "merge-base") {
      if (ancestors.has(`${args[2]} ${args[3]}`)) return { stdout: "" };
      throw Object.assign(new Error("no es ancestro"), { code: 1 });
    }
    if (args[0] === "worktree" && args[1] === "remove" && (failWorktreeRemoval || worktreeRemovalError)) {
      throw worktreeRemovalError ?? new Error("cleanup falló");
    }
    if (args[0] === "worktree" && args[1] === "prune" && failPrune) throw new Error("prune falló");
    return { stdout: "" };
  };
  const manager = new DeploymentJobManager({
    runFile,
    spawnProcess: (command, args, options) => {
      processCalls.push({ command, args, options });
      return childProcess();
    },
    readTextFile: async (target) => target.startsWith(snapshotRoot) ? snapshotImage : liveImage,
    makeTempDirectory: async () => temporaryRoot,
    makeDirectory: async () => {},
    writeTextFile: async (...args) => { fileWrites.push(args); },
    removePath: async () => { removed = true; },
    acquireOperationLock: async () => async () => { lockReleased = true; },
    writeScheduleState: async (_botId, job) => {
      if (stateFailure) throw stateFailure === true ? new Error("state falló") : stateFailure;
      stateWrites.push(scheduledRunState(job));
    },
  });
  return {
    bot,
    manager,
    gitCalls,
    processCalls,
    stateWrites,
    fileWrites,
    wasLockReleased: () => lockReleased,
    wasRemoved: () => removed,
  };
}

test("valida la programación mensual y la incorpora a cada bot", () => {
  const normalized = validateReleaseSchedule({ enabled: true, dayOfMonth: 1, time: "03:00" });
  assert.deepEqual(normalized, { enabled: true, updateDependencies: false, dayOfMonth: 1, time: "03:00", branch: "main", remote: "origin" });
  assert.equal(validateReleaseSchedule({ ...normalized, updateDependencies: true }).updateDependencies, true);
  assert.deepEqual(parseRuntimeConfig(runtimeConfig(path.resolve("C:/bot"))).bots.galerazo.releaseSchedule, normalized);
  assert.equal(parseRuntimeConfig(runtimeConfig(path.resolve("C:/bot"), null)).bots.galerazo.releaseSchedule, null);
  for (const invalid of [
    null,
    [],
    { enabled: "sí", dayOfMonth: 1, time: "03:00" },
    { enabled: true, updateDependencies: "sí", dayOfMonth: 1, time: "03:00" },
    { enabled: true, dayOfMonth: 0, time: "03:00" },
    { enabled: true, dayOfMonth: 29, time: "03:00" },
    { enabled: true, dayOfMonth: 1.5, time: "03:00" },
    { enabled: true, dayOfMonth: 1, time: "" },
    { enabled: true, dayOfMonth: 1, time: "25:00" },
    { enabled: true, dayOfMonth: 1, time: "03:00", branch: "rama inválida" },
    { enabled: true, dayOfMonth: 1, time: "03:00", branch: "main..otra" },
    { enabled: true, dayOfMonth: 1, time: "03:00", branch: "feature/" },
    { enabled: true, dayOfMonth: 1, time: "03:00", remote: "origin inválido" },
  ]) assert.throws(() => validateReleaseSchedule(invalid));
});

test("guarda la programación local de forma atómica y limpia temporales ante error", async () => {
  const raw = runtimeConfig(path.resolve("C:/bot"), null);
  const writes = [];
  const moves = [];
  const removed = [];
  const schedule = { enabled: true, updateDependencies: false, dayOfMonth: 2, time: "04:15", branch: "main", remote: "origin" };
  const saved = await saveBotReleaseSchedule("C:/config.json", "galerazo", schedule, {
    readText: async () => JSON.stringify(raw),
    writeText: async (...args) => { writes.push(args); },
    movePath: async (...args) => { moves.push(args); },
    removePath: async (...args) => { removed.push(args); },
    tokenFactory: () => "token",
  });
  assert.deepEqual(saved, schedule);
  assert.match(writes[0][1], /"releaseSchedule"/);
  assert.deepEqual(moves[0], ["C:/config.json.token.tmp", "C:/config.json"]);
  assert.equal(removed.length, 0);
  await assert.rejects(() => saveBotReleaseSchedule("C:/config.json", "otro", schedule, {
    readText: async () => JSON.stringify(raw),
  }), /No existe/);
  await assert.rejects(() => saveBotReleaseSchedule("C:/config.json", "galerazo", schedule, {
    readText: async () => JSON.stringify(raw),
    writeText: async () => { throw new Error("disco lleno"); },
    removePath: async (...args) => { removed.push(args); },
    tokenFactory: () => "fallo",
  }), /disco lleno/);
  assert.deepEqual(removed.at(-1), ["C:/config.json.fallo.tmp", { force: true }]);
});

test("mantiene estado y exclusión mutua fuera del repositorio", async () => {
  const paths = scheduledReleasePaths("galerazo", { LOCALAPPDATA: "C:/Local" });
  assert.match(paths.lock, /BotControlCenter.*galerazo\.lock\.json$/);
  assert.match(scheduledReleasePaths("galerazo", {}).root, /BotControlCenter/);
  assert.throws(() => scheduledReleasePaths("bot inválido", {}));
  assert.throws(() => scheduledReleasePaths(null, {}));
  assert.equal(isProcessActive(0), false);
  assert.equal(isProcessActive(1.5), false);
  assert.equal(isProcessActive(42, () => {}), true);
  assert.equal(isProcessActive(42, () => { throw Object.assign(new Error(), { code: "ESRCH" }); }), false);
  assert.equal(isProcessActive(42, () => { throw Object.assign(new Error(), { code: "EPERM" }); }), true);

  const removals = [];
  let lockText = "";
  const release = await acquireBotOperationLock("galerazo", {
    environment: { LOCALAPPDATA: "C:/Local" },
    makeDirectory: async () => {},
    openFile: async () => ({ writeFile: async (value) => { lockText = value; }, close: async () => {} }),
    readText: async () => lockText,
    removePath: async (...args) => { removals.push(args); },
    tokenFactory: () => "lock-token",
    pid: 99,
    now: () => "2026-08-09T10:00:00.000Z",
  });
  assert.match(lockText, /lock-token/);
  await release();
  assert.equal(removals.length, 1);

  const job = { id: "job", botId: "galerazo", action: "scheduled-release", status: "succeeded", createdAt: "a", startedAt: "b", finishedAt: "c", image: null, error: null, logs: [{ message: "ok" }] };
  const state = scheduledRunState(job);
  assert.equal(state.targetCommit, null);
  assert.equal(state.skipReason, null);
  assert.equal(scheduledRunState({ ...job, logs: null }).logs.length, 0);
  let stateText = "";
  await writeScheduledRunState("galerazo", job, {
    environment: { LOCALAPPDATA: "C:/Local" },
    makeDirectory: async () => {},
    writeText: async (_target, value) => { stateText = value; },
    movePath: async () => {},
    removePath: async () => {},
    tokenFactory: () => "state-token",
  });
  assert.match(stateText, /"status": "succeeded"/);
  assert.equal((await readScheduledRunState("galerazo", {
    environment: { LOCALAPPDATA: "C:/Local" },
    readText: async () => stateText,
  })).id, "job");
  assert.equal(await readScheduledRunState("galerazo", { readText: async () => "[]" }), null);
  assert.equal(await readScheduledRunState("galerazo", { readText: async () => "null" }), null);
  assert.equal(await readScheduledRunState("galerazo", { readText: async () => '"texto"' }), null);
  assert.equal(await readScheduledRunState("galerazo", { readText: async () => { throw new Error(); } }), null);
});

test("rechaza locks activos, recupera locks huérfanos y limpia fallos de escritura", async () => {
  const exists = Object.assign(new Error("existe"), { code: "EEXIST" });
  await assert.rejects(() => acquireBotOperationLock("galerazo", {
    makeDirectory: async () => {},
    openFile: async () => { throw exists; },
    readText: async () => JSON.stringify({ pid: 10, startedAt: "ayer" }),
    processIsActive: () => true,
  }), /desde ayer/);
  await assert.rejects(() => acquireBotOperationLock("galerazo", {
    makeDirectory: async () => {},
    openFile: async () => { throw exists; },
    readText: async () => "roto",
  }), /otra operación/);

  let attempts = 0;
  const moved = [];
  const release = await acquireBotOperationLock("galerazo", {
    makeDirectory: async () => {},
    openFile: async () => {
      attempts += 1;
      if (attempts === 1) throw exists;
      return { writeFile: async () => {}, close: async () => {} };
    },
    readText: async () => JSON.stringify({ pid: 999, token: "viejo" }),
    processIsActive: () => false,
    movePath: async (...args) => { moved.push(args); },
    removePath: async () => {},
    tokenFactory: () => "nuevo",
  });
  assert.equal(moved.length, 1);
  await release();

  await assert.rejects(() => acquireBotOperationLock("galerazo", {
    makeDirectory: async () => {},
    openFile: async () => { throw exists; },
    readText: async () => JSON.stringify({ pid: 999 }),
    processIsActive: () => false,
    movePath: async () => { throw Object.assign(new Error("rename falló"), { code: "EPERM" }); },
    tokenFactory: () => "rename",
  }), /rename falló/);

  let missingStaleAttempts = 0;
  await assert.rejects(() => acquireBotOperationLock("galerazo", {
    makeDirectory: async () => {},
    openFile: async () => { missingStaleAttempts += 1; throw exists; },
    readText: async () => JSON.stringify({ pid: 999 }),
    processIsActive: () => false,
    movePath: async () => { throw Object.assign(new Error("ya movido"), { code: "ENOENT" }); },
    tokenFactory: () => "missing-stale",
  }), /otra operación/);
  assert.equal(missingStaleAttempts, 2);

  let closed = false;
  let cleaned = false;
  await assert.rejects(() => acquireBotOperationLock("galerazo", {
    makeDirectory: async () => {},
    openFile: async () => ({ writeFile: async () => { throw new Error("write falló"); }, close: async () => { closed = true; } }),
    removePath: async () => { cleaned = true; },
  }), /write falló/);
  assert.equal(closed && cleaned, true);
  await assert.rejects(() => acquireBotOperationLock("galerazo", {
    makeDirectory: async () => {},
    openFile: async () => { throw Object.assign(new Error("permiso"), { code: "EPERM" }); },
  }), /permiso/);

  const releaseWithMissingFile = await acquireBotOperationLock("galerazo", {
    makeDirectory: async () => {},
    openFile: async () => ({ writeFile: async () => {}, close: async () => {} }),
    readText: async () => { throw new Error("ya no existe"); },
  });
  await releaseWithMissingFile();

  let stateTemporaryRemoved = false;
  await assert.rejects(() => writeScheduledRunState("galerazo", {
    id: "job",
    botId: "galerazo",
    action: "scheduled-release",
    status: "failed",
    logs: [],
  }, {
    makeDirectory: async () => {},
    writeText: async () => { throw new Error("state write falló"); },
    removePath: async () => { stateTemporaryRemoved = true; },
    tokenFactory: () => "fail-state",
  }), /state write falló/);
  assert.equal(stateTemporaryRemoved, true);
});

test("publica el commit local fijado, lo sube sin force y despliega desde un worktree", async () => {
  const harness = scheduledHarness();
  const job = await waitForJob(harness.manager.start(harness.bot, "scheduled-release"));
  assert.equal(job.status, "succeeded", JSON.stringify(job, null, 2));
  assert.equal(job.targetCommit, localCommit);
  assert.equal(job.image, publishedImage);
  assert.equal(harness.processCalls.length, 2);
  assert.ok(harness.processCalls.every((call) => call.options.cwd.includes("scheduled-release")));
  const push = harness.gitCalls.find((args) => args[0] === "push");
  assert.deepEqual(push.slice(0, 3), ["push", "--porcelain", "origin"]);
  assert.doesNotMatch(push.join(" "), /--force/);
  assert.equal(harness.fileWrites[0][1], `${publishedImage}\n`);
  assert.equal(harness.stateWrites.at(-1).status, "succeeded");
  assert.equal(harness.wasLockReleased(), true);
  assert.equal(harness.wasRemoved(), true);
});

test("actualiza, valida y confirma dependencias antes de publicar el hash final", async () => {
  const schedule = {
    enabled: true,
    updateDependencies: true,
    dayOfMonth: 1,
    time: "03:00",
    branch: "main",
    remote: "origin",
  };
  const dependencyImage = `us-central1-docker.pkg.dev/demo/bots/galerazobot:${dependencyCommit.slice(0, 12)}`;
  const harness = scheduledHarness({
    dependencyStatus: " M requirements.txt",
    releaseSchedule: schedule,
    snapshotImage: dependencyImage,
  });
  const job = await waitForJob(harness.manager.start(harness.bot, "scheduled-release"));
  assert.equal(job.status, "succeeded", JSON.stringify(job, null, 2));
  assert.equal(job.targetCommit, dependencyCommit);
  assert.equal(job.image, dependencyImage);
  assert.equal(harness.processCalls.length, 3);
  assert.match(harness.processCalls[0].args[4], /Update-Dependencies\.ps1$/);
  assert.ok(harness.gitCalls.some((args) => args[0] === "add" && args.includes("requirements.txt")));
  assert.ok(harness.gitCalls.some((args) => args[0] === "commit" && args.includes("Update locked dependencies")));
  const dependencyPush = harness.gitCalls.filter((args) => args[0] === "push").at(-1);
  assert.equal(dependencyPush.at(-1), `${dependencyCommit}:refs/heads/main`);
  assert.doesNotMatch(dependencyPush.join(" "), /--force/);
});

test("revisa dependencias sin desplegar cuando el lock y la imagen ya están actuales", async () => {
  const schedule = {
    enabled: true,
    updateDependencies: true,
    dayOfMonth: 1,
    time: "03:00",
    branch: "main",
    remote: "origin",
  };
  const harness = scheduledHarness({
    local: localCommit,
    remote: localCommit,
    liveImage: publishedImage,
    releaseSchedule: schedule,
  });
  const job = await waitForJob(harness.manager.start(harness.bot, "scheduled-release"));
  assert.equal(job.status, "skipped");
  assert.equal(job.skipReason, "no-changes");
  assert.equal(harness.processCalls.length, 1);
  assert.ok(job.logs.some((entry) => /dependencias estables ya están actualizadas/.test(entry.message)));
});

test("rechaza archivos inesperados o una validación fallida de dependencias", async () => {
  const schedule = {
    enabled: true,
    updateDependencies: true,
    dayOfMonth: 1,
    time: "03:00",
    branch: "main",
    remote: "origin",
  };
  const unexpected = scheduledHarness({
    dependencyStatus: " M requirements.txt\n M app.py",
    releaseSchedule: schedule,
  });
  const unexpectedJob = await waitForJob(unexpected.manager.start(unexpected.bot, "scheduled-release"));
  assert.equal(unexpectedJob.status, "failed");
  assert.match(unexpectedJob.error, /archivos no permitidos/);
  assert.equal(unexpected.processCalls.length, 1);

  const invalid = scheduledHarness({ releaseSchedule: schedule });
  invalid.manager.spawnProcess = () => childProcess(1);
  const invalidJob = await waitForJob(invalid.manager.start(invalid.bot, "scheduled-release"));
  assert.equal(invalidJob.status, "failed");
  assert.match(invalidJob.error, /actualizaciones estables.*código 1/i);
  assert.equal(invalid.gitCalls.some((args) => args[0] === "commit"), false);
});

test("omite un release sin commits nuevos y pospone árboles sucios o ramas divergentes", async () => {
  const unchanged = scheduledHarness({ local: localCommit, remote: localCommit, liveImage: publishedImage });
  const noChanges = await waitForJob(unchanged.manager.start(unchanged.bot, "scheduled-release"));
  assert.equal(noChanges.status, "skipped");
  assert.equal(noChanges.skipReason, "no-changes");
  assert.equal(unchanged.processCalls.length, 0);

  const dirty = scheduledHarness({ status: " M archivo.py" });
  const dirtyJob = await waitForJob(dirty.manager.start(dirty.bot, "scheduled-release"));
  assert.equal(dirtyJob.skipReason, "working-tree-dirty");
  assert.equal(dirty.gitCalls.length, 1);

  const diverged = scheduledHarness({ ancestors: new Set() });
  const divergedJob = await waitForJob(diverged.manager.start(diverged.bot, "scheduled-release"));
  assert.equal(divergedJob.skipReason, "branches-diverged");
});

test("usa el remoto adelantado y mantiene el deploy aunque falle la limpieza auxiliar", async () => {
  const remoteAhead = scheduledHarness({
    local: remoteCommit,
    remote: localCommit,
    ancestors: new Set([[remoteCommit, localCommit].join(" ")]),
    snapshotImage: publishedImage,
    failWorktreeRemoval: true,
    failPrune: true,
    releaseSchedule: null,
  });
  const job = await waitForJob(remoteAhead.manager.start(remoteAhead.bot, "scheduled-release"));
  assert.equal(job.status, "succeeded");
  assert.equal(job.targetCommit, localCommit);
  assert.ok(job.logs.some((entry) => entry.level === "warning" && /worktree/.test(entry.message)));
  assert.equal(remoteAhead.gitCalls.some((args) => args[0] === "push"), false);
});

test("normaliza fallos de Git, locks, imágenes y persistencia del estado", async () => {
  const gitError = scheduledHarness({
    ancestors: new Set(),
    failGit: { match: "merge-base", error: Object.assign(new Error("git roto"), { code: 2 }) },
  });
  assert.equal((await waitForJob(gitError.manager.start(gitError.bot, "scheduled-release"))).status, "failed");

  const missingImage = scheduledHarness();
  missingImage.manager.readTextFile = async (target) => {
    if (target.includes("source")) return "imagen inválida";
    throw new Error("sin previa");
  };
  const invalid = await waitForJob(missingImage.manager.start(missingImage.bot, "scheduled-release"));
  assert.equal(invalid.status, "failed");
  assert.match(invalid.error, /referencia de imagen válida/);

  const stateFailure = scheduledHarness({ stateFailure: true });
  const stateJob = await waitForJob(stateFailure.manager.start(stateFailure.bot, "scheduled-release"));
  assert.equal(stateJob.status, "succeeded");
  assert.ok(stateJob.logs.some((entry) => /guardar el estado/.test(entry.message)));

  const locked = scheduledHarness();
  locked.manager.acquireOperationLock = async () => { throw Object.assign(new Error("ocupado"), { statusCode: 409 }); };
  const lockedJob = await waitForJob(locked.manager.start(locked.bot, "scheduled-release"));
  assert.equal(lockedJob.status, "failed");
  assert.equal(lockedJob.error, "ocupado");
});

test("cubre fallos previos al worktree y errores planos sin perder el resultado", async () => {
  const addFailure = scheduledHarness({
    failGit: { match: "worktree add", error: new Error("no se creó el worktree") },
  });
  const addJob = await waitForJob(addFailure.manager.start(addFailure.bot, "scheduled-release"));
  assert.equal(addJob.status, "failed");
  assert.equal(addFailure.gitCalls.some((args) => args[1] === "remove"), false);
  assert.equal(addFailure.wasRemoved(), true);

  const plainCleanup = scheduledHarness({
    worktreeRemovalError: { toString: () => "cleanup plano" },
    failPrune: false,
  });
  const cleanupJob = await waitForJob(plainCleanup.manager.start(plainCleanup.bot, "scheduled-release"));
  assert.equal(cleanupJob.status, "succeeded");
  assert.ok(cleanupJob.logs.some((entry) => /cleanup plano/.test(entry.message)));
  assert.ok(plainCleanup.gitCalls.some((args) => args[1] === "prune"));

  const plainState = scheduledHarness({ stateFailure: { toString: () => "state plano" } });
  const stateJob = await waitForJob(plainState.manager.start(plainState.bot, "scheduled-release"));
  assert.equal(stateJob.status, "succeeded");
  assert.ok(stateJob.logs.some((entry) => /state plano/.test(entry.message)));

  const plainLock = scheduledHarness();
  plainLock.manager.acquireOperationLock = async () => { throw { toString: () => "lock plano" }; };
  const lockJob = await waitForJob(plainLock.manager.start(plainLock.bot, "scheduled-release"));
  assert.equal(lockJob.status, "failed");
  assert.equal(lockJob.error, "lock plano");

  const defaultStdout = scheduledHarness({ local: localCommit, remote: localCommit, liveImage: publishedImage });
  const originalRunFile = defaultStdout.manager.runFile;
  defaultStdout.manager.runFile = async (command, args, options) => args[0] === "fetch"
    ? {}
    : originalRunFile(command, args, options);
  assert.equal((await waitForJob(defaultStdout.manager.start(defaultStdout.bot, "scheduled-release"))).skipReason, "no-changes");
});

test("construye la tarea de Windows con argumentos fijos y soporta deshabilitarla", async () => {
  const calls = [];
  const schedule = { enabled: true, updateDependencies: false, dayOfMonth: 1, time: "03:00", branch: "main", remote: "origin" };
  const installed = await installWindowsReleaseSchedule("C:/config.json", "galerazo", schedule, {
    platform: "win32",
    nodePath: "C:/node/node.exe",
    runFile: async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: '{"enabled":true,"taskName":"Bot Control Center - Release - galerazo"}\n' };
    },
  });
  assert.equal(installed.enabled, true);
  assert.equal(calls[0].command, "powershell.exe");
  assert.equal(calls[0].options.shell, false);
  assert.ok(calls[0].args.includes("-DayOfMonth"));
  assert.equal(calls[0].args.includes("-Disable"), false);
  await installWindowsReleaseSchedule("C:/config.json", "galerazo", { ...schedule, enabled: false }, {
    platform: "win32",
    nodePath: "C:/node/node.exe",
    runFile: async (_command, args) => {
      assert.ok(args.includes("-Disable"));
      return { stdout: '{"enabled":false}\n' };
    },
  });
  await assert.rejects(() => installWindowsReleaseSchedule("C:/x", "galerazo", schedule, { platform: "linux" }), /Windows/);
  await assert.rejects(() => installWindowsReleaseSchedule("C:/x", "galerazo", schedule, {
    platform: "win32",
    runFile: async () => ({ stdout: "sin json" }),
  }), /estado de la tarea/);
});

async function startScheduleServer(overrides = {}, config = runtimeConfig(path.resolve("C:/bot"))) {
  const temporary = await mkdtemp(path.join(tmpdir(), "bot-control-schedule-api-"));
  const configPath = path.join(temporary, "runtime.local.json");
  await writeFile(configPath, JSON.stringify(config), "utf8");
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

test("expone, guarda y ejecuta el release programado desde la API local", async () => {
  const calls = [];
  const job = { id: "scheduled", status: "queued", action: "scheduled-release", logs: [] };
  const jobManager = {
    getActiveCount: () => 0,
    getActive: () => null,
    get: () => job,
    start: (_bot, action) => { calls.push(action); return job; },
    stopChildren() {},
  };
  const inspection = {
    configured: true,
    readiness: { release: true, "scheduled-release": true },
    releaseSchedule: runtimeConfig("C:/bot").bots.galerazo.releaseSchedule,
    checks: [],
  };
  const harness = await startScheduleServer({
    jobManager,
    botInspector: async () => inspection,
    scheduleStateReader: async () => ({ id: "last", status: "skipped", skipReason: "no-changes" }),
    scheduleInstaller: async (_config, _bot, schedule) => ({ enabled: schedule.enabled, nextRunAt: "2026-09-01T03:00:00-03:00" }),
    scheduleSaver: async (_config, _bot, schedule) => schedule,
  });
  const headers = { Origin: allowedOrigin, "Content-Type": "application/json", "X-Bot-Control-Action": "release-schedule" };
  try {
    const deployment = await fetch(`${harness.base}/api/bots/galerazo/deployment`, { headers: { Origin: allowedOrigin } });
    assert.equal((await deployment.json()).lastScheduledRun.id, "last");
    const schedule = runtimeConfig("C:/bot").bots.galerazo.releaseSchedule;
    const saved = await fetch(`${harness.base}/api/bots/galerazo/release-schedule`, {
      method: "POST",
      headers,
      body: JSON.stringify({ confirmation: "galerazo", schedule }),
    });
    assert.equal(saved.status, 200);
    const run = await fetch(`${harness.base}/api/bots/galerazo/scheduled-release`, {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json", "X-Bot-Control-Action": "scheduled-release" },
      body: JSON.stringify({ confirmation: "galerazo" }),
    });
    assert.equal(run.status, 202);
    assert.deepEqual(calls, ["scheduled-release"]);
  } finally {
    await harness.close();
  }
});

test("protege la configuración programada y revierte la tarea si falla el guardado", async () => {
  let ready = true;
  let saveFails = false;
  const installed = [];
  const config = runtimeConfig(path.resolve("C:/bot"), null);
  const harness = await startScheduleServer({
    botInspector: async () => ({ readiness: { "scheduled-release": ready } }),
    scheduleInstaller: async (_config, _bot, schedule) => { installed.push(schedule); return { enabled: schedule.enabled }; },
    scheduleSaver: async () => { if (saveFails) throw new Error("no se guardó"); },
    scheduleStateReader: async () => null,
  }, config);
  const url = `${harness.base}/api/bots/galerazo/release-schedule`;
  const schedule = { enabled: true, updateDependencies: false, dayOfMonth: 1, time: "03:00", branch: "main", remote: "origin" };
  const headers = { Origin: allowedOrigin, "Content-Type": "application/json", "X-Bot-Control-Action": "release-schedule" };
  const request = (body, customHeaders = headers) => fetch(url, { method: "POST", headers: customHeaders, body: JSON.stringify(body) });
  try {
    assert.equal((await request({}, { "Content-Type": "application/json", "X-Bot-Control-Action": "release-schedule" })).status, 403);
    assert.equal((await request({}, { Origin: allowedOrigin })).status, 415);
    assert.equal((await request({}, { Origin: allowedOrigin, "Content-Type": "application/json" })).status, 403);
    assert.equal((await request({ confirmation: "otro", schedule })).status, 400);
    assert.equal((await request({ confirmation: "galerazo", schedule: {} })).status, 500);
    ready = false;
    assert.equal((await request({ confirmation: "galerazo", schedule })).status, 409);
    const disabled = { ...schedule, enabled: false };
    assert.equal((await request({ confirmation: "galerazo", schedule: disabled })).status, 200);
    ready = true;
    saveFails = true;
    assert.equal((await request({ confirmation: "galerazo", schedule })).status, 500);
    assert.equal(installed.at(-1).enabled, false);

    const missingHarness = await startScheduleServer({
      botInspector: async () => ({ readiness: {} }),
      scheduleStateReader: async () => null,
    }, { allowedOrigins: [allowedOrigin], bots: {} });
    try {
      const missing = await fetch(`${missingHarness.base}/api/bots/galerazo/release-schedule`, {
        method: "POST",
        headers,
        body: JSON.stringify({ confirmation: "galerazo", schedule }),
      });
      assert.equal(missing.status, 409);
    } finally {
      await missingHarness.close();
    }
  } finally {
    await harness.close();
  }
});

test("el runner respeta la configuración y devuelve el resultado del manager", async () => {
  const bot = parseRuntimeConfig(runtimeConfig(path.resolve("C:/bot"))).bots.galerazo;
  const result = await runScheduledRelease(["--bot", "galerazo", "--config", "C:/config.json"], {
    loadConfig: async () => ({ config: { bots: { galerazo: bot } }, error: null }),
    createManager: () => ({
      start: () => ({ status: "succeeded", logs: [] }),
    }),
  });
  assert.equal(result.status, "succeeded");
  const disabled = { ...bot, releaseSchedule: { ...bot.releaseSchedule, enabled: false } };
  assert.equal((await runScheduledRelease(["--bot", "galerazo"], {
    loadConfig: async () => ({ config: { bots: { galerazo: disabled } }, error: null }),
  })).skipReason, "schedule-disabled");
  await assert.rejects(() => runScheduledRelease(["--otro"], {}), /Argumento no permitido/);
  await assert.rejects(() => runScheduledRelease(["--bot", "inválido"], {}), /identificador/);
  await assert.rejects(() => runScheduledRelease(["--bot", "ausente"], {
    loadConfig: async () => ({ config: { bots: {} }, error: "sin config" }),
  }), /sin config/);
});
