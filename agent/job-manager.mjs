import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  createCredentialUpdateStep,
  createDeployStep,
  createPublishStep,
  createRollbackStep,
  createStopStep,
  isValidImageReference,
  redactOutput,
  validateCredentialPatch,
} from "./core.mjs";
import {
  acquireBotOperationLock,
  writeScheduledRunState,
} from "./release-scheduler.mjs";

const maxLogEntries = 500;
const execFileAsync = promisify(execFile);

function timestamp() {
  return new Date().toISOString();
}

export class DeploymentJobManager {
  constructor({
    spawnProcess = spawn,
    readTextFile = readFile,
    makeTempDirectory = mkdtemp,
    makeDirectory = mkdir,
    writePrivateFile = writeFile,
    writeTextFile = writeFile,
    removePath = rm,
    runFile = execFileAsync,
    acquireOperationLock = acquireBotOperationLock,
    writeScheduleState = writeScheduledRunState,
  } = {}) {
    this.spawnProcess = spawnProcess;
    this.readTextFile = readTextFile;
    this.makeTempDirectory = makeTempDirectory;
    this.makeDirectory = makeDirectory;
    this.writePrivateFile = writePrivateFile;
    this.writeTextFile = writeTextFile;
    this.removePath = removePath;
    this.runFile = runFile;
    this.acquireOperationLock = acquireOperationLock;
    this.writeScheduleState = writeScheduleState;
    this.jobs = new Map();
    this.activeByBot = new Map();
    this.children = new Set();
  }

  get(jobId) {
    return this.jobs.get(jobId) ?? null;
  }

  getActive(botId) {
    const jobId = this.activeByBot.get(botId);
    return jobId ? this.get(jobId) : null;
  }

  getActiveCount() {
    return this.activeByBot.size;
  }

  start(bot, action, { tag, credentialPatch } = {}) {
    if (this.getActive(bot.id)) {
      throw Object.assign(new Error("Ya hay una operación activa para este bot."), { statusCode: 409 });
    }

    const privateOptions = action === "credentials"
      ? { credentialPatch: validateCredentialPatch(credentialPatch) }
      : { tag };
    const job = {
      id: randomUUID(),
      botId: bot.id,
      action,
      status: "queued",
      createdAt: timestamp(),
      startedAt: null,
      finishedAt: null,
      image: null,
      targetCommit: null,
      skipReason: null,
      currentStep: null,
      logs: [],
      error: null,
    };
    this.jobs.set(job.id, job);
    this.activeByBot.set(bot.id, job.id);
    void this.#run(job, bot, privateOptions);
    return job;
  }

  stopChildren() {
    for (const child of this.children) child.kill();
  }

  #log(job, level, message) {
    const clean = redactOutput(message).trim();
    if (!clean) return;
    job.logs.push({ at: timestamp(), level, message: clean });
    if (job.logs.length > maxLogEntries) job.logs.splice(0, job.logs.length - maxLogEntries);
  }

  async #run(job, bot, { tag, credentialPatch }) {
    let releaseOperationLock = null;
    let finalStatus = "failed";
    job.status = "running";
    job.startedAt = timestamp();
    this.#log(job, "info", `Operación ${job.action} iniciada para ${bot.id}.`);
    await this.#recordScheduleState(job);
    try {
      releaseOperationLock = await this.acquireOperationLock(bot.id);
      if (job.action === "scheduled-release") {
        await this.#runScheduledRelease(job, bot);
      } else if (job.action === "release") {
        await this.#runStep(job, bot, createPublishStep(bot, tag));
        job.image = (await this.readTextFile(bot.imageFile, "utf8")).trim();
        if (!isValidImageReference(job.image)) {
          throw new Error("El publicador no dejó una referencia de imagen válida.");
        }
        this.#log(job, "info", `Imagen lista: ${job.image}`);
        await this.#runStep(job, bot, createDeployStep(bot, job.image));
      } else if (job.action === "deploy") {
        job.image = (await this.readTextFile(bot.imageFile, "utf8")).trim();
        await this.#runStep(job, bot, createDeployStep(bot, job.image));
      } else if (job.action === "rollback") {
        await this.#runStep(job, bot, createRollbackStep(bot));
      } else if (job.action === "credentials") {
        await this.#runCredentialUpdate(job, bot, credentialPatch);
      } else if (job.action === "stop") {
        await this.#runStep(job, bot, createStopStep(bot));
      } else {
        throw new Error("Acción no permitida.");
      }
      if (job.skipReason) {
        finalStatus = "skipped";
      } else {
        finalStatus = "succeeded";
        this.#log(job, "success", "Operación completada correctamente.");
      }
    } catch (error) {
      finalStatus = "failed";
      job.error = redactOutput(error instanceof Error ? error.message : String(error));
      this.#log(job, "error", job.error);
    } finally {
      job.currentStep = null;
      job.finishedAt = timestamp();
      if (releaseOperationLock) await releaseOperationLock();
      this.activeByBot.delete(bot.id);
      await this.#recordScheduleState(job, finalStatus);
      job.status = finalStatus;
    }
  }

  async #recordScheduleState(job, status = job.status) {
    if (job.action !== "scheduled-release") return;
    try {
      await this.writeScheduleState(job.botId, { ...job, status });
    } catch (error) {
      this.#log(job, "warning", `No se pudo guardar el estado del release programado: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async #git(repositoryPath, args) {
    const { stdout = "" } = await this.runFile("git", args, {
      cwd: repositoryPath,
      env: process.env,
      shell: false,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    return String(stdout).trim();
  }

  async #isAncestor(repositoryPath, ancestor, descendant) {
    try {
      await this.#git(repositoryPath, ["merge-base", "--is-ancestor", ancestor, descendant]);
      return true;
    } catch (error) {
      if (error?.code === 1) return false;
      throw error;
    }
  }

  #skip(job, reason, message) {
    job.skipReason = reason;
    this.#log(job, reason === "no-changes" ? "success" : "warning", message);
  }

  async #runScheduledRelease(job, bot) {
    const schedule = bot.releaseSchedule ?? { branch: "main", remote: "origin" };
    this.#log(job, "info", "Verificando que el repositorio esté estable antes de fijar el release.");
    const workingTree = await this.#git(bot.repositoryPath, ["status", "--porcelain=v1", "--untracked-files=normal"]);
    if (workingTree) {
      this.#skip(
        job,
        "working-tree-dirty",
        "Release pospuesto: hay cambios locales sin commit. No se subirá trabajo a medio editar.",
      );
      return;
    }

    await this.#git(bot.repositoryPath, ["fetch", "--prune", schedule.remote, schedule.branch]);
    const localCommit = await this.#git(bot.repositoryPath, ["rev-parse", `refs/heads/${schedule.branch}`]);
    const remoteCommit = await this.#git(bot.repositoryPath, ["rev-parse", `refs/remotes/${schedule.remote}/${schedule.branch}`]);
    let targetCommit;

    if (localCommit === remoteCommit) {
      targetCommit = localCommit;
    } else if (await this.#isAncestor(bot.repositoryPath, remoteCommit, localCommit)) {
      targetCommit = localCommit;
      this.#log(job, "info", `Subiendo el corte ${targetCommit.slice(0, 12)} a ${schedule.remote}/${schedule.branch}.`);
      await this.#git(bot.repositoryPath, [
        "push",
        "--porcelain",
        schedule.remote,
        `${targetCommit}:refs/heads/${schedule.branch}`,
      ]);
    } else if (await this.#isAncestor(bot.repositoryPath, localCommit, remoteCommit)) {
      targetCommit = remoteCommit;
      this.#log(job, "info", `El remoto está adelantado; se usará ${targetCommit.slice(0, 12)} sin modificar el directorio vivo.`);
    } else {
      this.#skip(
        job,
        "branches-diverged",
        `Release pospuesto: ${schedule.branch} local y ${schedule.remote}/${schedule.branch} divergen.`,
      );
      return;
    }

    job.targetCommit = targetCommit;
    const targetTag = targetCommit.slice(0, 12);
    let latestImage = "";
    try {
      latestImage = (await this.readTextFile(bot.imageFile, "utf8")).trim();
    } catch {
      // La ausencia de una imagen previa significa que existe algo para publicar.
    }
    if (latestImage.slice(latestImage.lastIndexOf(":") + 1) === targetTag) {
      this.#skip(job, "no-changes", `Sin cambios nuevos: ${targetTag} ya es la última imagen publicada.`);
      return;
    }

    const temporaryRoot = await this.makeTempDirectory(path.join(tmpdir(), "bot-control-release-"));
    const snapshotRoot = path.join(temporaryRoot, "source");
    let worktreeAdded = false;
    try {
      this.#log(job, "info", `Corte inmutable fijado en ${targetCommit}. Los commits posteriores quedan para el próximo ciclo.`);
      await this.#git(bot.repositoryPath, ["worktree", "add", "--detach", snapshotRoot, targetCommit]);
      worktreeAdded = true;
      const imageRelativePath = path.relative(bot.repositoryPath, bot.imageFile);
      const snapshotBot = {
        ...bot,
        repositoryPath: snapshotRoot,
        imageFile: path.resolve(snapshotRoot, imageRelativePath),
      };

      await this.#runStep(job, snapshotBot, createPublishStep(snapshotBot, targetTag));
      job.image = (await this.readTextFile(snapshotBot.imageFile, "utf8")).trim();
      if (!isValidImageReference(job.image)) {
        throw new Error("El publicador no dejó una referencia de imagen válida.");
      }
      this.#log(job, "info", `Imagen del corte lista: ${job.image}`);
      await this.#runStep(job, snapshotBot, createDeployStep(snapshotBot, job.image));
      await this.makeDirectory(path.dirname(bot.imageFile), { recursive: true });
      await this.writeTextFile(bot.imageFile, `${job.image}\n`, "utf8");
    } finally {
      if (worktreeAdded) {
        try {
          await this.#git(bot.repositoryPath, ["worktree", "remove", "--force", snapshotRoot]);
        } catch (error) {
          this.#log(job, "warning", `No se pudo retirar el worktree temporal: ${error instanceof Error ? error.message : String(error)}`);
          try {
            await this.#git(bot.repositoryPath, ["worktree", "prune"]);
          } catch {
            // La limpieza del directorio temporal continúa aunque Git no pueda podar metadata.
          }
        }
      }
      await this.removePath(temporaryRoot, { recursive: true, force: true });
    }
  }

  async #runCredentialUpdate(job, bot, credentialPatch) {
    let directory = null;
    try {
      directory = await this.makeTempDirectory(path.join(tmpdir(), "bot-control-credentials-"));
      const patchFile = path.join(directory, "secret-patch.json");
      await this.writePrivateFile(patchFile, JSON.stringify(credentialPatch), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await this.#runStep(job, bot, createCredentialUpdateStep(bot, patchFile));
    } finally {
      if (directory) await this.removePath(directory, { recursive: true, force: true });
    }
  }

  #runStep(job, bot, step) {
    job.currentStep = step.label;
    this.#log(job, "info", step.label);
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(step.command, step.args, {
        cwd: bot.repositoryPath,
        env: process.env,
        shell: false,
        windowsHide: true,
      });
      this.children.add(child);
      const buffers = { stdout: "", stderr: "" };
      const consume = (level, chunk, flush = false) => {
        buffers[level] += chunk === null ? "" : String(chunk);
        const lines = buffers[level].split(/\r?\n/);
        buffers[level] = lines.pop();
        for (const line of lines) this.#log(job, level, line);
        if (flush && buffers[level]) {
          this.#log(job, level, buffers[level]);
          buffers[level] = "";
        }
        if (buffers[level].length > 8000) {
          this.#log(job, level, buffers[level]);
          buffers[level] = "";
        }
      };
      child.stdout?.on("data", (chunk) => consume("stdout", chunk));
      child.stderr?.on("data", (chunk) => consume("stderr", chunk));
      child.once("error", (error) => {
        this.children.delete(child);
        reject(error);
      });
      child.once("close", (code) => {
        this.children.delete(child);
        consume("stdout", null, true);
        consume("stderr", null, true);
        if (code === 0) resolve();
        else reject(new Error(`${step.label} terminó con código ${code ?? "desconocido"}.`));
      });
    });
  }
}
