import path from "node:path";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const imagePattern = /^[A-Za-z0-9][A-Za-z0-9._/:@-]+$/;
const tagPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

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

export function redactOutput(value) {
  return String(value)
    .replace(/\b\d{6,14}:[A-Za-z0-9_-]{20,}\b/g, "[TELEGRAM_TOKEN_OCULTO]")
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, "$1[CREDENCIAL_OCULTA]")
    .replace(/((?:token|password|secret|private[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, "$1[CREDENCIAL_OCULTA]")
    .slice(0, 2000);
}

export function powershellStep(label, scriptPath, namedArguments = []) {
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
