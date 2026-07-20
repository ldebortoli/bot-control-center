import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultAllowedOrigins, parseRuntimeConfig } from "./core.mjs";

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
