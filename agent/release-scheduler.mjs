import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function schedulerRoot(environment = process.env) {
  const base = environment.LOCALAPPDATA || tmpdir();
  return path.join(base, "BotControlCenter", "scheduled-releases");
}

function safeBotId(botId) {
  if (typeof botId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(botId)) {
    throw new Error("El identificador del bot no es válido para el programador.");
  }
  return botId;
}

export function scheduledReleasePaths(botId, environment = process.env) {
  const id = safeBotId(botId);
  const root = schedulerRoot(environment);
  return {
    root,
    lock: path.join(root, `${id}.lock.json`),
    state: path.join(root, `${id}.state.json`),
  };
}

export function isProcessActive(pid, killProcess = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    killProcess(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

function conflictError(owner) {
  const started = typeof owner?.startedAt === "string" ? ` desde ${owner.startedAt}` : "";
  return Object.assign(
    new Error(`Ya hay otra operación activa para este bot${started}.`),
    { statusCode: 409 },
  );
}

export async function acquireBotOperationLock(botId, {
  environment = process.env,
  makeDirectory = mkdir,
  openFile = open,
  readText = readFile,
  movePath = rename,
  removePath = rm,
  tokenFactory = randomUUID,
  processIsActive = isProcessActive,
  pid = process.pid,
  now = () => new Date().toISOString(),
} = {}) {
  const paths = scheduledReleasePaths(botId, environment);
  await makeDirectory(paths.root, { recursive: true });
  const token = tokenFactory();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle;
    try {
      handle = await openFile(paths.lock, "wx", 0o600);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let owner;
      try {
        owner = JSON.parse(await readText(paths.lock, "utf8"));
      } catch {
        throw conflictError(null);
      }
      if (processIsActive(owner.pid)) throw conflictError(owner);

      const stalePath = `${paths.lock}.stale-${token}`;
      try {
        await movePath(paths.lock, stalePath);
        await removePath(stalePath, { force: true });
      } catch (staleError) {
        if (staleError?.code !== "ENOENT") throw staleError;
      }
      continue;
    }

    try {
      await handle.writeFile(JSON.stringify({ botId, pid, token, startedAt: now() }), "utf8");
    } catch (error) {
      await handle.close();
      await removePath(paths.lock, { force: true });
      throw error;
    }
    await handle.close();

    return async () => {
      try {
        const current = JSON.parse(await readText(paths.lock, "utf8"));
        if (current.token === token) await removePath(paths.lock, { force: true });
      } catch {
        // Un lock ausente o reemplazado no debe alterar el resultado del deploy.
      }
    };
  }

  throw conflictError(null);
}

export function scheduledRunState(job) {
  return {
    id: job.id,
    botId: job.botId,
    action: job.action,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    targetCommit: job.targetCommit ?? null,
    image: job.image,
    skipReason: job.skipReason ?? null,
    error: job.error,
    logs: Array.isArray(job.logs) ? job.logs.slice(-100) : [],
  };
}

export async function writeScheduledRunState(botId, job, {
  environment = process.env,
  makeDirectory = mkdir,
  writeText = writeFile,
  movePath = rename,
  removePath = rm,
  tokenFactory = randomUUID,
} = {}) {
  const paths = scheduledReleasePaths(botId, environment);
  await makeDirectory(paths.root, { recursive: true });
  const temporary = `${paths.state}.${tokenFactory()}.tmp`;
  try {
    await writeText(temporary, `${JSON.stringify(scheduledRunState(job), null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await movePath(temporary, paths.state);
  } catch (error) {
    await removePath(temporary, { force: true });
    throw error;
  }
}

export async function readScheduledRunState(botId, {
  environment = process.env,
  readText = readFile,
} = {}) {
  try {
    const parsed = JSON.parse(await readText(scheduledReleasePaths(botId, environment).state, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
