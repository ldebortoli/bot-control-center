import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createCredentialStatusStep,
  createCredentialUpdateStep,
  createDeployStep,
  createModerationStep,
  createPublishStep,
  createRollbackStep,
  createRuntimeStatusStep,
  createTriggerListStep,
  createTriggerMediaStep,
  botctlRuntimePath,
  credentialFieldNames,
  isAllowedOrigin,
  isValidImageReference,
  isValidOpaqueId,
  isValidTag,
  redactOutput,
  validateReleaseSchedule,
  validateCredentialPatch,
} from "./core.mjs";
import { DeploymentJobManager } from "./job-manager.mjs";
import { readScheduledRunState } from "./release-scheduler.mjs";
import { defaultConfigPath, loadRuntimeConfig, saveBotReleaseSchedule } from "./runtime-config.mjs";

const execFileAsync = promisify(execFile);
const defaultPort = 43121;
const listenHost = "127.0.0.1";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moderationActions = new Set(["delete-trigger", "block-user", "delete-and-block"]);
const successfulTelegramGetUpdatesLog = /\bgetUpdates\b[^\r\n]*\bHTTP\/[0-9.]+\s+200\s+OK"?\s*$/i;

export async function commandExists(name, {
  platform = process.platform,
  environment = process.env,
  runFile = execFileAsync,
  pathExists = fileExists,
} = {}) {
  try {
    const finder = platform === "win32" ? "where.exe" : "which";
    await runFile(finder, [name], { windowsHide: true });
    return true;
  } catch {
    if (platform !== "win32") return false;
    const fallback = name === "gcloud" && environment.LOCALAPPDATA
      ? path.join(environment.LOCALAPPDATA, "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd")
      : name === "docker" && environment.ProgramFiles
        ? path.join(environment.ProgramFiles, "Docker", "Docker", "resources", "bin", "docker.exe")
        : null;
    return fallback ? pathExists(fallback) : false;
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

export async function installWindowsReleaseSchedule(configPath, botId, schedule, {
  platform = process.platform,
  runFile = execFileAsync,
  nodePath = process.execPath,
} = {}) {
  if (platform !== "win32") {
    throw Object.assign(new Error("La programación persistente sólo está disponible en Windows."), { statusCode: 409 });
  }
  const normalized = validateReleaseSchedule(schedule);
  const scriptPath = path.join(projectRoot, "scripts", "Install-ReleaseSchedule.ps1");
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-ConfigPath",
    path.resolve(configPath),
    "-NodePath",
    path.resolve(nodePath),
    "-BotId",
    botId,
    "-DayOfMonth",
    String(normalized.dayOfMonth),
    "-At",
    normalized.time,
  ];
  if (!normalized.enabled) args.push("-Disable");
  const { stdout } = await runFile("powershell.exe", args, {
    cwd: projectRoot,
    env: process.env,
    shell: false,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  return parseJsonOutput(stdout, "Windows no devolvió el estado de la tarea programada.");
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

function parseJsonOutput(stdout, message) {
  for (const line of String(stdout).split(/\r?\n/).reverse()) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // gcloud puede escribir mensajes informativos antes del JSON final.
    }
  }
  throw new Error(message);
}

async function runBotStep(bot, step, runFile = execFileAsync) {
  const { stdout } = await runFile(step.command, step.args, {
    cwd: bot.repositoryPath,
    env: process.env,
    shell: false,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout;
}

export async function inspectRuntimeStatus(bot, runFile = execFileAsync) {
  const stdout = await runBotStep(bot, createRuntimeStatusStep(bot), runFile);
  const payload = parseJsonOutput(stdout, "La VM no devolvió un estado operativo válido.");
  if (!payload.vm || !payload.container || !payload.telegram || !payload.resources || !Array.isArray(payload.logs)) {
    throw new Error("La VM devolvió un contrato operativo incompleto.");
  }
  return {
    ...payload,
    logs: payload.logs.filter((line) => !successfulTelegramGetUpdatesLog.test(String(line))),
  };
}

export async function inspectRemoteTriggers(bot, runFile = execFileAsync) {
  const stdout = await runBotStep(bot, createTriggerListStep(bot), runFile);
  const payload = parseJsonOutput(stdout, "La VM no devolvió triggers válidos.");
  if (!Array.isArray(payload.triggers)) throw new Error("La VM devolvió un contrato de triggers incompleto.");
  return payload;
}

export async function moderateRemoteTrigger(bot, triggerId, action, runFile = execFileAsync) {
  const stdout = await runBotStep(bot, createModerationStep(bot, triggerId, action), runFile);
  const payload = parseJsonOutput(stdout, "La VM no devolvió el resultado de moderación.");
  for (const field of ["triggerDeleted", "userBlocked", "announcementSent"]) {
    if (typeof payload[field] !== "boolean") throw new Error("La VM devolvió un resultado de moderación incompleto.");
  }
  return payload;
}

export async function fetchRemoteTriggerMedia(bot, triggerId, {
  runFile = execFileAsync,
  makeTempDirectory = mkdtemp,
  readBinaryFile = readFile,
  removePath = rm,
} = {}) {
  let directory = null;
  try {
    directory = await makeTempDirectory(path.join(tmpdir(), "bot-control-media-"));
    const outputFile = path.join(directory, "trigger-media.bin");
    const stdout = await runBotStep(bot, createTriggerMediaStep(bot, triggerId, outputFile), runFile);
    const metadata = parseJsonOutput(stdout, "La VM no devolvió metadatos de multimedia válidos.");
    if (typeof metadata.filename !== "string" || typeof metadata.mimeType !== "string") {
      throw new Error("La VM devolvió metadatos de multimedia incompletos.");
    }
    const data = await readBinaryFile(outputFile);
    return { data, filename: metadata.filename, mimeType: metadata.mimeType };
  } finally {
    if (directory) await removePath(directory, { recursive: true, force: true });
  }
}

export async function inspectBot(configState, botId, { commandChecker = commandExists } = {}) {
  const bot = configState.config.bots[botId];
  if (!bot) {
    return {
      configured: false,
      configError: configState.error ?? `No existe configuración local para ${botId}.`,
      target: null,
      latestImage: null,
      releaseSchedule: null,
      readiness: { release: false, "scheduled-release": false, deploy: false, rollback: false, credentials: false, runtime: false, triggers: false, stop: false },
      checks: [],
    };
  }

  const publishStep = createPublishStep(bot);
  const deployStep = createDeployStep(bot, "registry.invalid/project/repository/image:probe");
  const rollbackStep = createRollbackStep(bot);
  const credentialStatusStep = createCredentialStatusStep(bot);
  const credentialUpdateStep = createCredentialUpdateStep(bot, path.join(bot.repositoryPath, "credential-probe.json"));
  const runtimeStep = createRuntimeStatusStep(bot);
  const scheduleScript = path.join(projectRoot, "scripts", "Install-ReleaseSchedule.ps1");
  const [repositoryOk, publishOk, deployOk, rollbackOk, credentialStatusOk, credentialUpdateOk, botctlScriptOk, botctlRuntimeOk, scheduleScriptOk, powershellOk, dockerOk, gcloudOk, gitOk, latestImage] = await Promise.all([
    fileExists(bot.repositoryPath),
    fileExists(publishStep.args[4]),
    fileExists(deployStep.args[4]),
    fileExists(rollbackStep.args[4]),
    fileExists(credentialStatusStep.args[4]),
    fileExists(credentialUpdateStep.args[4]),
    fileExists(runtimeStep.args[4]),
    fileExists(botctlRuntimePath(bot)),
    fileExists(scheduleScript),
    commandChecker("powershell.exe"),
    commandChecker("docker"),
    commandChecker("gcloud"),
    commandChecker("git"),
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
    { id: "botctl", label: "Contrato remoto de estado y triggers", ok: botctlScriptOk && botctlRuntimeOk },
    { id: "scheduler", label: "Programador mensual versionado", ok: scheduleScriptOk },
  ];
  const scriptsAndBase = repositoryOk && powershellOk && publishOk && deployOk && rollbackOk;
  const credentialBase = repositoryOk && powershellOk && gcloudOk && credentialStatusOk && credentialUpdateOk;
  const botctlBase = repositoryOk && powershellOk && gcloudOk && botctlScriptOk && botctlRuntimeOk;

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
    releaseSchedule: bot.releaseSchedule,
    readiness: {
      release: scriptsAndBase && dockerOk && gcloudOk && gitOk,
      "scheduled-release": scriptsAndBase && scheduleScriptOk && dockerOk && gcloudOk && gitOk,
      deploy: scriptsAndBase && gcloudOk && Boolean(latestImage),
      rollback: scriptsAndBase && gcloudOk,
      credentials: credentialBase,
      runtime: botctlBase,
      triggers: botctlBase,
      stop: botctlBase,
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

function binary(response, body, filename, mimeType, origin, allowedOrigins) {
  const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180) || "trigger-media.bin";
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `inline; filename="${safeFilename}"`,
    "Content-Length": String(body.length),
    "Content-Type": /^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/.test(mimeType) ? mimeType : "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && isAllowedOrigin(origin, allowedOrigins)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  response.writeHead(200, headers);
  response.end(body);
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
  runtimeInspector = inspectRuntimeStatus,
  triggerInspector = inspectRemoteTriggers,
  triggerMediaFetcher = fetchRemoteTriggerMedia,
  triggerModerator = moderateRemoteTrigger,
  botInspector = inspectBot,
  scheduleInstaller = installWindowsReleaseSchedule,
  scheduleSaver = saveBotReleaseSchedule,
  scheduleStateReader = readScheduledRunState,
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
      const lastScheduledRun = await scheduleStateReader(botId);
      json(response, 200, {
        agent: { status: "online", localOnly: true },
        botId,
        ...deployment,
        activeJob: jobManager.getActive(botId),
        lastScheduledRun,
      }, origin, allowedOrigins);
      return;
    }

    const scheduleMatch = url.pathname.match(/^\/api\/bots\/([A-Za-z0-9._:-]+)\/release-schedule$/);
    if (request.method === "POST" && scheduleMatch) {
      try {
        const botId = scheduleMatch[1];
        if (!origin || !isAllowedOrigin(origin, allowedOrigins)) {
          throw Object.assign(new Error("Falta un origen local autorizado."), { statusCode: 403 });
        }
        if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
          throw Object.assign(new Error("Se requiere Content-Type application/json."), { statusCode: 415 });
        }
        if (request.headers["x-bot-control-action"] !== "release-schedule") {
          throw Object.assign(new Error("Falta la cabecera de confirmación de acción."), { statusCode: 403 });
        }
        const body = await readJsonBody(request);
        if (body.confirmation !== botId) {
          throw Object.assign(new Error("La confirmación no coincide con el bot."), { statusCode: 400 });
        }
        const schedule = validateReleaseSchedule(body.schedule);
        const bot = configState.config.bots[botId];
        if (!bot) {
          throw Object.assign(new Error(configState.error ?? "Bot sin configuración local."), { statusCode: 409 });
        }
        const inspection = await botInspector(configState, botId);
        if (schedule.enabled && !inspection.readiness["scheduled-release"]) {
          throw Object.assign(new Error("El release programado no está listo. Revisá Git, Docker, gcloud y los scripts."), { statusCode: 409 });
        }

        const previousSchedule = bot.releaseSchedule;
        const task = await scheduleInstaller(configPath, botId, schedule);
        try {
          await scheduleSaver(configPath, botId, schedule);
        } catch (error) {
          const rollbackSchedule = previousSchedule ?? {
            enabled: false,
            dayOfMonth: schedule.dayOfMonth,
            time: schedule.time,
            branch: schedule.branch,
            remote: schedule.remote,
          };
          try {
            await scheduleInstaller(configPath, botId, rollbackSchedule);
          } catch {
            // El error original de persistencia conserva prioridad sobre el rollback best-effort.
          }
          throw error;
        }
        json(response, 200, { botId, schedule, task }, origin, allowedOrigins);
      } catch (error) {
        json(response, error?.statusCode ?? 500, {
          error: redactOutput(error instanceof Error ? error.message : String(error)),
        }, origin, allowedOrigins);
      }
      return;
    }

    const runtimeMatch = url.pathname.match(/^\/api\/bots\/([A-Za-z0-9._:-]+)\/runtime$/);
    if (request.method === "GET" && runtimeMatch) {
      const botId = runtimeMatch[1];
      try {
        const bot = configState.config.bots[botId];
        if (!bot) throw Object.assign(new Error(configState.error ?? "Bot sin configuración local."), { statusCode: 409 });
        const inspection = await botInspector(configState, botId);
        if (!inspection.readiness.runtime) throw Object.assign(new Error("La observación remota no está lista."), { statusCode: 409 });
        const runtime = await runtimeInspector(bot);
        json(response, 200, { botId, ...runtime, activeJob: jobManager.getActive(botId) }, origin, allowedOrigins);
      } catch (error) {
        json(response, error?.statusCode ?? 502, { error: redactOutput(error instanceof Error ? error.message : String(error)) }, origin, allowedOrigins);
      }
      return;
    }

    const triggerMediaMatch = url.pathname.match(/^\/api\/bots\/([A-Za-z0-9._:-]+)\/triggers\/([A-Za-z0-9_-]+)\/media$/);
    if (request.method === "GET" && triggerMediaMatch) {
      const [, botId, triggerId] = triggerMediaMatch;
      try {
        if (!isValidOpaqueId(triggerId)) throw Object.assign(new Error("Identificador de trigger inválido."), { statusCode: 400 });
        const bot = configState.config.bots[botId];
        if (!bot) throw Object.assign(new Error(configState.error ?? "Bot sin configuración local."), { statusCode: 409 });
        const inspection = await botInspector(configState, botId);
        if (!inspection.readiness.triggers) throw Object.assign(new Error("La lectura remota de triggers no está lista."), { statusCode: 409 });
        const media = await triggerMediaFetcher(bot, triggerId);
        binary(response, media.data, media.filename, media.mimeType, origin, allowedOrigins);
      } catch (error) {
        json(response, error?.statusCode ?? 502, { error: redactOutput(error instanceof Error ? error.message : String(error)) }, origin, allowedOrigins);
      }
      return;
    }

    const triggersMatch = url.pathname.match(/^\/api\/bots\/([A-Za-z0-9._:-]+)\/triggers$/);
    if (request.method === "GET" && triggersMatch) {
      const botId = triggersMatch[1];
      try {
        const bot = configState.config.bots[botId];
        if (!bot) throw Object.assign(new Error(configState.error ?? "Bot sin configuración local."), { statusCode: 409 });
        const inspection = await botInspector(configState, botId);
        if (!inspection.readiness.triggers) throw Object.assign(new Error("La lectura remota de triggers no está lista."), { statusCode: 409 });
        const payload = await triggerInspector(bot);
        const triggers = payload.triggers.map((trigger) => trigger.media ? {
          ...trigger,
          media: {
            ...trigger.media,
            url: `http://${listenHost}:${resolveAgentPort(process.env.BOT_CONTROL_CENTER_AGENT_PORT)}/api/bots/${encodeURIComponent(botId)}/triggers/${encodeURIComponent(trigger.id)}/media`,
          },
        } : trigger);
        json(response, 200, { botId, observedAt: payload.observedAt, triggers }, origin, allowedOrigins);
      } catch (error) {
        json(response, error?.statusCode ?? 502, { error: redactOutput(error instanceof Error ? error.message : String(error)) }, origin, allowedOrigins);
      }
      return;
    }

    const moderationMatch = url.pathname.match(/^\/api\/bots\/([A-Za-z0-9._:-]+)\/triggers\/moderate$/);
    if (request.method === "POST" && moderationMatch) {
      try {
        const botId = moderationMatch[1];
        if (!origin || !isAllowedOrigin(origin, allowedOrigins)) throw Object.assign(new Error("Falta un origen local autorizado."), { statusCode: 403 });
        if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) throw Object.assign(new Error("Se requiere Content-Type application/json."), { statusCode: 415 });
        if (request.headers["x-bot-control-action"] !== "moderate-trigger") throw Object.assign(new Error("Falta la cabecera de confirmación de acción."), { statusCode: 403 });
        const body = await readJsonBody(request);
        if (body.confirmation !== botId) throw Object.assign(new Error("La confirmación no coincide con el bot."), { statusCode: 400 });
        if (!isValidOpaqueId(body.triggerId)) throw Object.assign(new Error("Identificador de trigger inválido."), { statusCode: 400 });
        if (!moderationActions.has(body.action)) throw Object.assign(new Error("Acción de moderación inválida."), { statusCode: 400 });
        const bot = configState.config.bots[botId];
        if (!bot) throw Object.assign(new Error(configState.error ?? "Bot sin configuración local."), { statusCode: 409 });
        const inspection = await botInspector(configState, botId);
        if (!inspection.readiness.triggers) throw Object.assign(new Error("La moderación remota no está lista."), { statusCode: 409 });
        const result = await triggerModerator(bot, body.triggerId, body.action);
        json(response, result.announcementSent ? 200 : 207, result, origin, allowedOrigins);
      } catch (error) {
        json(response, error?.statusCode ?? 502, { error: redactOutput(error instanceof Error ? error.message : String(error)) }, origin, allowedOrigins);
      }
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

    const actionMatch = url.pathname.match(/^\/api\/bots\/([A-Za-z0-9._:-]+)\/(release|scheduled-release|deploy|rollback|stop)$/);
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

export function resolveAgentPort(value) {
  return Number(value || defaultPort);
}

export async function startAgent({ port = resolveAgentPort(process.env.BOT_CONTROL_CENTER_AGENT_PORT) } = {}) {
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

export async function runAgentMain(start, reportError, exit) {
  try {
    await start();
  } catch (error) {
    reportError(error instanceof Error ? error.message : String(error));
    exit(1);
  }
}

export function startAgentIfMain(
  entry = process.argv[1],
  moduleUrl = import.meta.url,
  run = runAgentMain,
) {
  if (entry && moduleUrl === pathToFileURL(path.resolve(entry)).href) {
    return run(startAgent, console.error, process.exit);
  }
  return null;
}

void startAgentIfMain();
