import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createDeployStep,
  createPublishStep,
  isAllowedOrigin,
  parseRuntimeConfig,
  redactOutput,
  resolveInside,
} from "../agent/core.mjs";
import { DeploymentJobManager } from "../agent/job-manager.mjs";
import { createAgentServer } from "../agent/server.mjs";

function sampleConfig(repositoryPath) {
  return {
    allowedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
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

test("valida configuración local y mantiene las rutas dentro del repositorio", () => {
  const repositoryPath = path.resolve("C:/bots/galerazo");
  const config = parseRuntimeConfig(sampleConfig(repositoryPath));
  const bot = config.bots.galerazo;

  assert.equal(bot.repositoryPath, repositoryPath);
  assert.equal(isAllowedOrigin("http://localhost:3000", config.allowedOrigins), true);
  assert.equal(isAllowedOrigin("https://example.com", config.allowedOrigins), false);
  assert.throws(() => resolveInside(repositoryPath, "../../otro.ps1", "script"));
  assert.throws(() => parseRuntimeConfig({ ...sampleConfig(repositoryPath), allowedOrigins: ["https://example.com"] }));
  assert.throws(() => parseRuntimeConfig({
    ...sampleConfig(repositoryPath),
    bots: {
      galerazo: {
        ...sampleConfig(repositoryPath).bots.galerazo,
        projectId: "TU_PROYECTO_GCP",
      },
    },
  }));
});

test("construye únicamente invocaciones PowerShell de scripts versionados", () => {
  const bot = parseRuntimeConfig(sampleConfig(path.resolve("C:/bots/galerazo"))).bots.galerazo;
  const publish = createPublishStep(bot, "abc123");
  const deploy = createDeployStep(bot, "us-central1-docker.pkg.dev/demo/bots/galerazobot:abc123");

  assert.equal(publish.command, "powershell.exe");
  assert.deepEqual(publish.args.slice(0, 4), ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]);
  assert.match(publish.args[4], /Publish-DockerImage\.ps1$/);
  assert.match(deploy.args[4], /Deploy-Gce\.ps1$/);
  assert.ok(!deploy.args.includes(";"));
});

test("oculta credenciales conocidas antes de conservar logs", () => {
  const output = redactOutput("token=123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef password=hunter2");
  assert.doesNotMatch(output, /ABCDEFGHIJKLMNOPQRSTUVWXYZ|hunter2/);
  assert.match(output, /OCULT[AO]/);
});

test("el job de release publica y después despliega sin usar shell", async () => {
  const calls = [];
  const image = "us-central1-docker.pkg.dev/demo/bots/galerazobot:abc123";
  const spawnProcess = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => child.emit("close", 0));
    return child;
  };
  const bot = parseRuntimeConfig(sampleConfig(path.resolve("C:/bots/galerazo"))).bots.galerazo;
  const manager = new DeploymentJobManager({ spawnProcess, readTextFile: async () => image });
  const job = manager.start(bot, "release", { tag: "abc123" });

  for (let index = 0; index < 20 && job.status === "running"; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.equal(job.status, "succeeded");
  assert.equal(job.image, image);
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.options.shell === false), true);
  assert.match(calls[0].args[4], /Publish-DockerImage\.ps1$/);
  assert.match(calls[1].args[4], /Deploy-Gce\.ps1$/);
});

test("el servidor escucha localmente y rechaza orígenes externos", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "bot-control-agent-"));
  const configPath = path.join(temporary, "runtime.local.json");
  await writeFile(configPath, JSON.stringify(sampleConfig(temporary)), "utf8");
  const server = createAgentServer({ configPath });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${base}/api/health`, { headers: { Origin: "http://localhost:3000" } });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("access-control-allow-origin"), "http://localhost:3000");

    const rejected = await fetch(`${base}/api/health`, { headers: { Origin: "https://attacker.example" } });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get("access-control-allow-origin"), null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  }
});
