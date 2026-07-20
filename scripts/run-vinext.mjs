import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const mode = process.argv[2];
const allowedModes = new Set(["dev", "build", "start"]);

if (!allowedModes.has(mode)) {
  console.error("Uso: node scripts/run-vinext.mjs <dev|build|start>");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executable = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vinext.cmd" : "vinext",
);

const result = spawnSync(executable, [mode, ...process.argv.slice(3)], {
  cwd: root,
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: path.join(root, ".wrangler", "wrangler.log"),
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
