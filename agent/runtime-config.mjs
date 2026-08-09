import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultAllowedOrigins, parseRuntimeConfig, validateReleaseSchedule } from "./core.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const defaultConfigPath = path.join(projectRoot, "config", "runtime.local.json");

export async function loadRuntimeConfig(configPath = defaultConfigPath) {
  try {
    const raw = JSON.parse(await readFile(configPath, "utf8"));
    return { config: parseRuntimeConfig(raw), error: null, path: configPath };
  } catch (error) {
    const message = error?.code === "ENOENT"
      ? `Falta ${path.relative(projectRoot, configPath)}. Copiá config/runtime.example.json y completalo.`
      : `Configuración local inválida: ${error instanceof Error ? error.message : String(error)}`;
    return {
      config: { allowedOrigins: defaultAllowedOrigins, bots: {} },
      error: message,
      path: configPath,
    };
  }
}

export async function saveBotReleaseSchedule(configPath, botId, schedule, {
  readText = readFile,
  writeText = writeFile,
  movePath = rename,
  removePath = rm,
  tokenFactory = randomUUID,
} = {}) {
  const normalized = validateReleaseSchedule(schedule);
  const raw = JSON.parse(await readText(configPath, "utf8"));
  if (!raw?.bots || typeof raw.bots !== "object" || !raw.bots[botId]) {
    throw new Error(`No existe configuración local para ${botId}.`);
  }
  raw.bots[botId].releaseSchedule = normalized;
  parseRuntimeConfig(raw);

  const temporary = `${configPath}.${tokenFactory()}.tmp`;
  try {
    await writeText(temporary, `${JSON.stringify(raw, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await movePath(temporary, configPath);
  } catch (error) {
    await removePath(temporary, { force: true });
    throw error;
  }
  return normalized;
}
