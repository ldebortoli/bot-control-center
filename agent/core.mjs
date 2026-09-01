import path from "node:path";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const imagePattern = /^[A-Za-z0-9][A-Za-z0-9._/:@-]+$/;
const tagPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const gitRefPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const opaqueIdPattern = /^[A-Za-z0-9_-]{1,2048}$/;
const moderationActions = new Set(["delete-trigger", "block-user", "delete-and-block"]);
const releaseNotificationEvents = new Set(["started", "succeeded", "failed", "skipped"]);

export const credentialFieldNames = Object.freeze([
  "TELEGRAM_BOT_TOKEN",
  "OPENAI_API_KEY",
  "TELEGRAM_DEV_USER_IDS",
  "TELEGRAM_LOG_CHAT_ID",
  "TELEGRAM_ANNOUNCEMENTS_CHAT_ID",
  "GOOGLE_SHEETS_SPREADSHEET_ID",
  "GOOGLE_SHEETS_WORKSHEET_NAME",
  "GOOGLE_SHEETS_CREDENTIALS_JSON",
]);

const credentialFieldSet = new Set(credentialFieldNames);
const nonClearableCredentialFields = new Set(["TELEGRAM_BOT_TOKEN"]);

export const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} debe ser un texto no vacío.`);
  }
  return value.trim();
}

function assertIdentifier(value, label) {
  const normalized = assertString(value, label);
  if (!identifierPattern.test(normalized)) {
    throw new Error(`${label} contiene caracteres no permitidos.`);
  }
  if (/^(?:TU|YOUR)[_-]/i.test(normalized)) {
    throw new Error(`${label} todavía contiene un placeholder.`);
  }
  return normalized;
}

function assertLocalOrigin(value) {
  const origin = new URL(assertString(value, "allowedOrigins"));
  if (
    origin.protocol !== "http:" ||
    (origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1")
  ) {
    throw new Error("El agente solo admite orígenes HTTP locales.");
  }
  return origin.origin;
}

export function validateReleaseSchedule(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("releaseSchedule debe ser un objeto JSON.");
  }
  if (typeof raw.enabled !== "boolean") {
    throw new Error("releaseSchedule.enabled debe ser booleano.");
  }
  const updateDependencies = raw.updateDependencies ?? false;
  if (typeof updateDependencies !== "boolean") {
    throw new Error("releaseSchedule.updateDependencies debe ser booleano.");
  }
  const notifyLogChannel = raw.notifyLogChannel ?? false;
  if (typeof notifyLogChannel !== "boolean") {
    throw new Error("releaseSchedule.notifyLogChannel debe ser booleano.");
  }
  if (!Number.isInteger(raw.dayOfMonth) || raw.dayOfMonth < 1 || raw.dayOfMonth > 28) {
    throw new Error("releaseSchedule.dayOfMonth debe estar entre 1 y 28.");
  }
  const time = assertString(raw.time, "releaseSchedule.time");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("releaseSchedule.time debe usar el formato HH:MM.");
  }
  const branch = assertString(raw.branch ?? "main", "releaseSchedule.branch");
  const remote = assertString(raw.remote ?? "origin", "releaseSchedule.remote");
  if (!gitRefPattern.test(branch) || branch.includes("..") || branch.endsWith("/")) {
    throw new Error("releaseSchedule.branch no es una referencia Git válida.");
  }
  if (!identifierPattern.test(remote)) {
    throw new Error("releaseSchedule.remote no es un remoto Git válido.");
  }
  return {
    enabled: raw.enabled,
    updateDependencies,
    notifyLogChannel,
    dayOfMonth: raw.dayOfMonth,
    time,
    branch,
    remote,
  };
}

export function resolveInside(root, relativePath, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} debe permanecer dentro del repositorio del bot.`);
  }
  return resolved;
}

export function parseRuntimeConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("La configuración local debe ser un objeto JSON.");
  }

  const allowedOrigins = Array.isArray(raw.allowedOrigins)
    ? [...new Set(raw.allowedOrigins.map(assertLocalOrigin))]
    : defaultAllowedOrigins;
  if (allowedOrigins.length === 0) {
    throw new Error("allowedOrigins debe incluir al menos un origen local.");
  }

  if (!raw.bots || typeof raw.bots !== "object" || Array.isArray(raw.bots)) {
    throw new Error("La configuración debe incluir el objeto bots.");
  }

  const bots = {};
  for (const [id, entry] of Object.entries(raw.bots)) {
    if (!identifierPattern.test(id) || !entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`La configuración del bot ${id} no es válida.`);
    }

    const repositoryPath = path.resolve(assertString(entry.repositoryPath, `${id}.repositoryPath`));
    bots[id] = {
      id,
      repositoryPath,
      projectId: assertIdentifier(entry.projectId, `${id}.projectId`),
      location: assertIdentifier(entry.location ?? "us-central1", `${id}.location`),
      repository: assertIdentifier(entry.repository ?? "bots", `${id}.repository`),
      zone: assertIdentifier(entry.zone, `${id}.zone`),
      instance: assertIdentifier(entry.instance, `${id}.instance`),
      imageFile: resolveInside(
        repositoryPath,
        entry.imageFile ?? path.join("deploy", "out", "last-image.txt"),
        `${id}.imageFile`,
      ),
      releaseSchedule: entry.releaseSchedule === undefined
        ? null
        : validateReleaseSchedule(entry.releaseSchedule),
    };
  }

  return { allowedOrigins, bots };
}

export function isAllowedOrigin(origin, allowedOrigins) {
  return typeof origin === "string" && allowedOrigins.includes(origin);
}

export function isValidImageReference(value) {
  return typeof value === "string" && imagePattern.test(value.trim());
}

export function isValidTag(value) {
  return value === undefined || (typeof value === "string" && tagPattern.test(value));
}

export function isValidOpaqueId(value) {
  return typeof value === "string" && opaqueIdPattern.test(value);
}

export function redactOutput(value) {
  return String(value)
    .replace(/\b\d{6,14}:[A-Za-z0-9_-]{20,}\b/g, "[TELEGRAM_TOKEN_OCULTO]")
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, "$1[CREDENCIAL_OCULTA]")
    .replace(/((?:token|password|secret|private[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, "$1[CREDENCIAL_OCULTA]")
    .replace(/\b[A-Za-z]:\\Users\\[^\\\r\n]+/gi, "%USERPROFILE%")
    .slice(0, 2000);
}

export function validateCredentialPatch(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("El parche de credenciales debe ser un objeto JSON.");
  }
  const updates = raw.updates ?? {};
  const clear = raw.clear ?? [];
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("updates debe ser un objeto JSON.");
  }
  if (!Array.isArray(clear)) {
    throw new Error("clear debe ser una lista.");
  }

  const normalizedUpdates = {};
  for (const [name, value] of Object.entries(updates)) {
    if (!credentialFieldSet.has(name)) {
      throw new Error(`La credencial ${name} no está permitida.`);
    }
    if (name === "GOOGLE_SHEETS_CREDENTIALS_JSON") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("GOOGLE_SHEETS_CREDENTIALS_JSON debe ser un objeto JSON.");
      }
      for (const required of ["type", "client_email", "private_key"]) {
        if (typeof value[required] !== "string" || !value[required].trim()) {
          throw new Error(`La credencial de Google Sheets no incluye ${required}.`);
        }
      }
      normalizedUpdates[name] = value;
      continue;
    }
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${name} debe ser un texto no vacío.`);
    }
    if (/\r|\n/.test(value)) {
      throw new Error(`${name} no puede contener saltos de línea.`);
    }
    normalizedUpdates[name] = value.trim();
  }

  const normalizedClear = [...new Set(clear.map((name) => {
    if (typeof name !== "string" || !credentialFieldSet.has(name)) {
      throw new Error(`La credencial ${String(name)} no está permitida.`);
    }
    if (nonClearableCredentialFields.has(name)) {
      throw new Error(`${name} no se puede borrar desde el panel.`);
    }
    if (Object.hasOwn(normalizedUpdates, name)) {
      throw new Error(`${name} no puede actualizarse y borrarse al mismo tiempo.`);
    }
    return name;
  }))];

  if (Object.keys(normalizedUpdates).length === 0 && normalizedClear.length === 0) {
    throw new Error("No hay cambios de credenciales para aplicar.");
  }
  const normalized = { updates: normalizedUpdates, clear: normalizedClear };
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 32768) {
    throw new Error("El parche de credenciales supera el límite permitido.");
  }
  return normalized;
}

export function powershellStep(label, scriptPath, namedArguments = [], switches = []) {
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
  ];
  for (const [name, value] of namedArguments) {
    args.push(`-${name}`, value);
  }
  for (const name of switches) args.push(`-${name}`);
  return { label, command: "powershell.exe", args };
}

export function createPublishStep(bot, tag) {
  const namedArguments = [
    ["ProjectId", bot.projectId],
    ["Location", bot.location],
    ["Repository", bot.repository],
  ];
  if (tag) namedArguments.push(["Tag", tag]);
  return powershellStep(
    "Construir, probar y publicar imagen",
    resolveInside(bot.repositoryPath, path.join("scripts", "deploy", "Publish-DockerImage.ps1"), "publishScript"),
    namedArguments,
  );
}

export function createDependencyUpdateStep(bot) {
  return powershellStep(
    "Buscar y validar actualizaciones estables de dependencias",
    resolveInside(
      bot.repositoryPath,
      path.join("scripts", "deploy", "Update-Dependencies.ps1"),
      "dependencyUpdateScript",
    ),
  );
}

export function createDeployStep(bot, image) {
  if (!isValidImageReference(image)) {
    throw new Error("La referencia de imagen publicada no es válida.");
  }
  return powershellStep(
    "Desplegar en Google Compute Engine",
    resolveInside(bot.repositoryPath, path.join("scripts", "deploy", "Deploy-Gce.ps1"), "deployScript"),
    [
      ["ProjectId", bot.projectId],
      ["Zone", bot.zone],
      ["Instance", bot.instance],
      ["Image", image.trim()],
    ],
  );
}

export function createRollbackStep(bot) {
  return powershellStep(
    "Restaurar la imagen anterior",
    resolveInside(bot.repositoryPath, path.join("scripts", "deploy", "Rollback-Gce.ps1"), "rollbackScript"),
    [
      ["ProjectId", bot.projectId],
      ["Zone", bot.zone],
      ["Instance", bot.instance],
    ],
  );
}

export function createCredentialStatusStep(bot) {
  return powershellStep(
    "Consultar presencia de credenciales",
    resolveInside(bot.repositoryPath, path.join("scripts", "deploy", "Get-GceBotSecretStatus.ps1"), "credentialStatusScript"),
    [
      ["ProjectId", bot.projectId],
      ["Zone", bot.zone],
      ["Instance", bot.instance],
    ],
  );
}

export function createCredentialUpdateStep(bot, patchFile) {
  const resolvedPatch = path.resolve(assertString(patchFile, "patchFile"));
  return powershellStep(
    "Aplicar credenciales remotas por IAP",
    resolveInside(bot.repositoryPath, path.join("scripts", "deploy", "Patch-GceBotSecrets.ps1"), "credentialUpdateScript"),
    [
      ["ProjectId", bot.projectId],
      ["Zone", bot.zone],
      ["Instance", bot.instance],
      ["PatchFile", resolvedPatch],
    ],
    ["AcknowledgeSecretUpdate"],
  );
}

function createBotctlStep(bot, action, namedArguments = [], switches = []) {
  return powershellStep(
    `Galerazo botctl: ${action}`,
    resolveInside(bot.repositoryPath, path.join("scripts", "deploy", "Invoke-GceBotctl.ps1"), "botctlScript"),
    [
      ["ProjectId", bot.projectId],
      ["Zone", bot.zone],
      ["Instance", bot.instance],
      ["Action", action],
      ...namedArguments,
    ],
    switches,
  );
}

export function createRuntimeStatusStep(bot) {
  return createBotctlStep(bot, "status");
}

export function createTriggerListStep(bot) {
  return createBotctlStep(bot, "triggers");
}

export function createTriggerMediaStep(bot, triggerId, outputFile) {
  if (!isValidOpaqueId(triggerId)) throw new Error("El identificador del trigger no es válido.");
  const resolvedOutput = path.resolve(assertString(outputFile, "outputFile"));
  return createBotctlStep(bot, "media", [
    ["TriggerId", triggerId],
    ["OutputFile", resolvedOutput],
  ]);
}

export function createModerationStep(bot, triggerId, action) {
  if (!isValidOpaqueId(triggerId)) throw new Error("El identificador del trigger no es válido.");
  if (!moderationActions.has(action)) throw new Error("La acción de moderación no está permitida.");
  return createBotctlStep(bot, "moderate", [
    ["TriggerId", triggerId],
    ["ModerationAction", action],
  ], ["AcknowledgeModeration"]);
}

export function createStopStep(bot) {
  return createBotctlStep(bot, "stop", [], ["AcknowledgeStop"]);
}

export function createScheduledNotificationStep(bot, event, failureDetail) {
  if (!releaseNotificationEvents.has(event)) {
    throw new Error("El evento de notificación del release no está permitido.");
  }
  const namedArguments = [["ReleaseEvent", event]];
  if (event === "failed") {
    const detail = redactOutput(assertString(failureDetail, "failureDetail"))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 800);
    namedArguments.push(["ReleaseDetail", detail]);
  } else if (failureDetail !== undefined) {
    throw new Error("El detalle de notificación solo se admite para un release fallido.");
  }
  return createBotctlStep(bot, "notify-release", namedArguments);
}

export function botctlRuntimePath(bot) {
  return resolveInside(bot.repositoryPath, path.join("deploy", "gce", "botctl.py"), "botctlRuntime");
}
