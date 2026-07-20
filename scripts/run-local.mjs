import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processes = [];
let stopping = false;

function relay(stream, target, prefix) {
  stream?.on("data", (chunk) => {
    const lines = String(chunk).split(/(?<=\n)/);
    for (const line of lines) {
      if (line) target.write(`[${prefix}] ${line}`);
    }
  });
}

function start(label, args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: process.env,
    detached: process.platform !== "win32",
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  relay(child.stdout, process.stdout, label);
  relay(child.stderr, process.stderr, label);
  processes.push(child);
  child.once("error", (error) => {
    console.error(`[${label}] ${error.message}`);
    shutdown(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(`[${label}] finalizó antes de tiempo (${signal ?? code ?? "sin código"}).`);
      shutdown(code || 1);
    }
  });
  return child;
}

function stopTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) stopTree(child);
  process.exit(exitCode);
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
process.once("exit", () => {
  for (const child of processes) stopTree(child);
});

start("ui", ["scripts/run-vinext.mjs", "dev", "--host", "127.0.0.1", "--port", "3000"]);
start("agent", ["agent/server.mjs"]);
