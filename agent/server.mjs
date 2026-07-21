import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import {
  createCredentialStatusStep,
  createCredentialUpdateStep,
  createDeployStep,
  createPublishStep,
  createRollbackStep,
  credentialFieldNames,
  isAllowedOrigin,
  isValidImageReference,
  isValidTag,
  redactOutput,
  validateCredentialPatch,
} from "./core.mjs";
import { DeploymentJobManager } from "./job-manager.mjs";
import { defaultConfigPath, loadRuntimeConfig } from "./runtime-config.mjs";

const execFileAsync = promisify(execFile);
const defaultPort = 43121;
const listenHost = "127.0.0.1";

async function commandExists(name) {
  try {
    const finder = process.platform === "win32" ? "where.exe" : "which";
    await execFileAsync(finder, [name], { windowsHide: true });
    return true;
  } catch {
    if (process.platform !== "win32") return false;
    const fallback = name === "gcloud" && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd")
      : name === "docker" && process.env.ProgramFiles
        ? path.join(process.env.ProgramFiles, "Docker", "Docker", "resources", "bin", "docker.exe")
        : null;
    return fallback ? fileExists(fallback) : false;
  }
}

async function fileExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readLatestImage(bot) {
  try {
    const image = (await readFile(bot.imageFile, "utf8")).trim();
    return isValidImageReference(image) ? image : null;
  } catch {
    return null;
  }
}

export async function inspectCredentialStatus(bot, runFile = execFileAsync) {
  const step = createCredentialStatusStep(bot);
  const { stdout } = await runFile(step.command, step.args, {
    cwd: bot.repositoryPath,
    env: process.env,
    shell: false,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  let parsed = null;
  for (const line of String(stdout).split(/\r?\n/).reverse()) {
    if (!line.trim().startsWith("{")) continue;
    try {
      parsed = JSON.parse(line);
      break;
    } catch {
      // gcloud puede escribir mensajes informativos antes del JSON final.
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("La VM no devolvió un estado de credenciales válido.");
  }
  return Object.fromEntries(credentialFieldNames.map((name) => {
    if (typeof parsed[name] !== "boolean") {
      throw new Error(`La VM no informó un estado booleano para ${name}.`);
    }
    return [name, parsed[name]];
  }));
}

export async function inspectBot(configState, botId) {
  const bot = configState.config.bots[botId];
  if (!bot) {
    return {
      configured: false,
      configError: configState.error ?? `No existe configuración local para ${botId}.`,
      target: null,
      latestImage: null,
      readiness: { release: false, deploy: false, rollback: false, credentials: false },
      checks: [],
    };
  }

  const publishStep = createPublishStep(bot);
  const deployStep = createDeployStep(bot, "registry.invalid/project/repository/image:probe");
  const rollbackStep = createRollbackStep(bot);
  const credentialStatusStep = createCredentialStatusStep(bot);
  const credentialUpdateStep = createCredentialUpdateStep(bot, path.join(bot.repositoryPath, "credential-probe.json"));
  const [repositoryOk, publishOk, deployOk, rollbackOk, credentialStatusOk, credentialUpdateOk, powershellOk, dockerOk, gcloudOk, gitOk, latestImage] = await Promise.all([
    fileExists(bot.repositoryPath),
    fileExists(publishStep.args[4]),
    fileExists(deployStep.args[4]),
    fileExists(rollbackStep.args[4]),
    fileExists(credentialStatusStep.args[4]),
    fileExists(credentialUpdateStep.args[4]),
    commandExists("powershell.exe"),
    commandExists("docker"),
    commandExists("gcloud"),
    commandExists("git"),
    readLatestImage(bot),
  ]);

  const checks = [
    { id: "config", label: "Configuración local", ok: true },
    { id: "repository", label: "Repositorio Galerazo", ok: repositoryOk },
    { id: "powershell", label: "PowerShell", ok: powershellOk },
    { id: "docker", label: "Docker", ok: dockerOk },
    { id: "gcloud", label: "Google Cloud CLI", ok: gcloudOk },
    { id: "git", label: "Git", ok: gitOk },
    { id: "scripts", label: "Scripts de deploy versionados", ok: publishOk && deployOk && rollbackOk },
    { id: "credential-scripts", label: "Scripts de credenciales versionados", ok: credentialStatusOk && credentialUpdateOk },
  ];
  const scriptsAndBase = repositoryOk && powershellOk && publishOk && deployOk && rollbackOk;
  const credentialBase = repositoryOk && powershellOk && gcloudOk && credentialStatusOk && credentialUpdateOk;

  return {
    configured: true,
    configError: configState.error,
    target: {
      projectId: bot.projectId,
      location: bot.location,
      repository: bot.repository,
      zone: bot.zone,
      instance: bot.instance,
    },
    latestImage,
    readiness: {
      release: scriptsAndBase && dockerOk && gcloudOk && gitOk,
      deploy: scriptsAndBase && gcloudOk && Boolean(latestImage),
      rollback: scriptsAndBase && gcloudOk,
      credentials: credentialBase,
    },
    checks,
  };
}

function json(response, statusCode, body, origin, allowedOrigins) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && isAllowedOrigin(origin, allowedOrigins)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 32768) throw Object.assign(new Error("Solicitud demasiado grande."), { statusCode: 413 });
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("El cuerpo debe ser JSON válido."), { statusCode: 400 });
  }
}

export function createAgentServer({
  configPath = process.env.BOT_CONTROL_CENTER_CONFIG || defaultConfigPath,
  jobManager = new DeploymentJobManager(),
  credentialInspector = inspectCredentialStatus,
  botInspector = inspectBot,
} = {}) {
  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    const configState = await loadRuntimeConfig(configPath);
    const allowedOrigins = configState.config.allowedOrigins;

    if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
      json(response, 403, { error: "Origen no autorizado." }, null, allowedOrigins);
      return;
    }

    if (request.method === "OPTIONS") {
      if (!origin) {
        json(response, 400, { error: "Falta Origin." }, null, allowedOrigins);
        return;
      }
      response.writeHead(204, {
        "Access-Control-Allow-Headers": "Content-Type, X-Bot-Control-Action",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      });
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", `http://${listenHost}`);
    if (request.method === "GET" && url.pathname === "/api/health") {
      json(response, 200, {
        status: "online",
        localOnly: true,
        activeJobs: jobManager.getActiveCount(),
        configuredBots: Object.keys(configState.config.bots),
        configError: configState.error,
      }, origin, allowedOrigins);
      return;
    }

    const deploymentMatch = url.pathname.match(/^\/api\/bots\/([A-Za-z0-9._:-]+)\/deployment$/);
    if (request.method === "GET" && deploymentMatch) {
      const botId = deploymentMatch[1];
      const deployment = await botInspector(configState, botId);
      json(response, 200, {
        agent: { status: "online", localOnly: true },
        botId,
        ...deployment,
        activeJob: jobManager.getActive(botId),
      }, origin, allowedOrigins);
      return;
    }

    const credentialsMatch = url.pathname.match(/^\/api\/bots\/([A-Za-z0-9._:-]+)\/credentials$/);
    if (request.method === "GET" && credentialsMatch) {
      const botId = credentialsMatch[1];
      try {
        const bot = configState.config.bots[botId];
        if (!bot) {
          throw Object.assign(new Error(configState.error ?? "Bot sin configuración local."), { statusCode: 409 });
        }
        const inspection = await botInspector(configState, botId);
        if (!inspection.readiness.credentials) {
          throw Object.assign(new Error("La administración de credenciales no está lista. Revisá la configuración, gcloud y los scripts."), { statusCode: 409 });
        }
        const fields = await credentialInspector(bot);
        json(response, 200, {
          botId,
          fields,
          writable: true,
          activeJob: jobManager.getActive(botId),
        }, origin, allowedOrigins);
      } catch (error) {
        json(response, error?.statusCode ?? 502, {
          error: redactOutput(error instanceof Error ? error.message : String(error)),
        }, origin, allowedOrigins);
      }
      return;
    }

    const jobMatch = url.pathname.match(/^\/api\/jobs\/([A-Za-z0-9-]+)$/);
    if (request.method === "GET" && jobMatch) {
      const job = jobManager.get(jobMatch[1]);
      json(response, job ? 200 : 404, job ?? { error: "Operación no encontrada." }, origin, allowedOrigins);
      return;
    }

    const actionMatch = url.pathname.match(/^\/api\/bots\/([A-Za-z0-9._:-]+)\/(release|deploy|rollback)$/);
    if (request.method === "POST" && actionMatch) {
      try {
        const [, botId, action] = actionMatch;
        if (!origin || !isAllowedOrigin(origin, allowedOrigins)) {
          throw Object.assign(new Error("Falta un origen local autorizado."), { statusCode: 403 });
        }
        if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
          throw Object.assign(new Error("Se requiere Content-Type application/json."), { statusCode: 415 });
        }
        if (request.headers["x-bot-control-action"] !== action) {
          throw Object.assign(new Error("Falta la cabecera de confirmación de acción."), { statusCode: 403 });
        }

        const body = await readJsonBody(request);
        if (body.confirmation !== botId) {
          throw Object.assign(new Error("La confirmación no coincide con el bot."), { statusCode: 400 });
        }
        if (!isValidTag(body.tag)) {
          throw Object.assign(new Error("El tag Docker no es válido."), { statusCode: 400 });
        }

        const bot = configState.config.bots[botId];
        if (!bot) {
          throw Object.assign(new Error(configState.error ?? "Bot sin configuración local."), { statusCode: 409 });
        }
        const inspection = await botInspector(configState, botId);
        if (!inspection.readiness[action]) {
          throw Object.assign(new Error(`La acción ${action} no está lista. Revisá la configuración y herramientas.`), { statusCode: 409 });
        }

        const job = jobManager.start(bot, action, { tag: body.tag });
        json(response, 202, job, origin, allowedOrigins);
      } catch (error) {
        json(response, error?.statusCode ?? 500, {
          error: error instanceof Error ? error.message : String(error),
        }, origin, allowedOrigins);
      }
      return;
    }

    if (request.method === "POST" && credentialsMatch) {
      try {
        const botId = credentialsMatch[1];
        if (!origin || !isAllowedOrigin(origin, allowedOrigins)) {
          throw Object.assign(new Error("Falta un origen local autorizado."), { statusCode: 403 });
        }
        if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
          throw Object.assign(new Error("Se requiere Content-Type application/json."), { statusCode: 415 });
        }
        if (request.headers["x-bot-control-action"] !== "credentials") {
          throw Object.assign(new Error("Falta la cabecera de confirmación de acción."), { statusCode: 403 });
        }
        const body = await readJsonBody(request);
        if (body.confirmation !== botId) {
          throw Object.assign(new Error("La confirmación no coincide con el bot."), { statusCode: 400 });
        }
        const credentialPatch = validateCredentialPatch(body.patch);
        const bot = configState.config.bots[botId];
        if (!bot) {
          throw Object.assign(new Error(configState.error ?? "Bot sin configuración local."), { statusCode: 409 });
        }
        const inspection = await botInspector(configState, botId);
        if (!inspection.readiness.credentials) {
          throw Object.assign(new Error("La administración de credenciales no está lista."), { statusCode: 409 });
        }
        const job = jobManager.start(bot, "credentials", { credentialPatch });
        json(response, 202, job, origin, allowedOrigins);
      } catch (error) {
        json(response, error?.statusCode ?? 500, {
          error: redactOutput(error instanceof Error ? error.message : String(error)),
        }, origin, allowedOrigins);
      }
      return;
    }

    json(response, 404, { error: "Ruta no encontrada." }, origin, allowedOrigins);
  });

  server.on("close", () => jobManager.stopChildren());
  return server;
}

export async function startAgent({ port = Number(process.env.BOT_CONTROL_CENTER_AGENT_PORT || defaultPort) } = {}) {
  const server = createAgentServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, listenHost, resolve);
  });
  console.log(`Agente local listo en http://${listenHost}:${port}`);
  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  startAgent().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
