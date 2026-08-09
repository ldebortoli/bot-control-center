import path from "node:path";
import { fileURLToPath } from "node:url";
import { DeploymentJobManager } from "../agent/job-manager.mjs";
import { defaultConfigPath, loadRuntimeConfig } from "../agent/runtime-config.mjs";

function parseArguments(args) {
  const parsed = { botId: null, configPath: defaultConfigPath };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--bot" && args[index + 1]) parsed.botId = args[++index];
    else if (args[index] === "--config" && args[index + 1]) parsed.configPath = path.resolve(args[++index]);
    else throw new Error(`Argumento no permitido: ${args[index]}`);
  }
  if (!parsed.botId || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(parsed.botId)) {
    throw new Error("Falta un identificador de bot válido.");
  }
  return parsed;
}

async function waitForJob(job) {
  while (job.status === "queued" || job.status === "running") {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return job;
}

export async function runScheduledRelease(args = process.argv.slice(2), {
  loadConfig = loadRuntimeConfig,
  createManager = () => new DeploymentJobManager(),
} = {}) {
  const { botId, configPath } = parseArguments(args);
  const configState = await loadConfig(configPath);
  const bot = configState.config.bots[botId];
  if (!bot) throw new Error(configState.error ?? `No existe configuración local para ${botId}.`);
  if (!bot.releaseSchedule?.enabled) {
    return { status: "skipped", skipReason: "schedule-disabled", error: null, logs: [] };
  }

  const manager = createManager();
  const job = await waitForJob(manager.start(bot, "scheduled-release"));
  for (const entry of job.logs) {
    const output = entry.level === "error" ? console.error : console.log;
    output(`[${entry.at}] ${entry.level.toUpperCase()} ${entry.message}`);
  }
  return job;
}

async function main() {
  try {
    const job = await runScheduledRelease();
    if (job.status === "succeeded" || job.skipReason === "no-changes" || job.skipReason === "schedule-disabled") return;
    process.exitCode = job.status === "skipped" ? 2 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entry && entry === fileURLToPath(import.meta.url)) void main();
