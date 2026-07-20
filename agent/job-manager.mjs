import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createDeployStep, createPublishStep, createRollbackStep, isValidImageReference, redactOutput } from "./core.mjs";

const maxLogEntries = 500;

function timestamp() {
  return new Date().toISOString();
}

export class DeploymentJobManager {
  constructor({ spawnProcess = spawn, readTextFile = readFile } = {}) {
    this.spawnProcess = spawnProcess;
    this.readTextFile = readTextFile;
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

  start(bot, action, { tag } = {}) {
    if (this.getActive(bot.id)) {
      throw Object.assign(new Error("Ya hay una operación activa para este bot."), { statusCode: 409 });
    }

    const job = {
      id: randomUUID(),
      botId: bot.id,
      action,
      status: "queued",
      createdAt: timestamp(),
      startedAt: null,
      finishedAt: null,
      image: null,
      currentStep: null,
      logs: [],
      error: null,
    };
    this.jobs.set(job.id, job);
    this.activeByBot.set(bot.id, job.id);
    void this.#run(job, bot, tag);
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

  async #run(job, bot, tag) {
    job.status = "running";
    job.startedAt = timestamp();
    this.#log(job, "info", `Operación ${job.action} iniciada para ${bot.id}.`);
    try {
      if (job.action === "release") {
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
      } else {
        throw new Error("Acción no permitida.");
      }
      job.status = "succeeded";
      this.#log(job, "success", "Operación completada correctamente.");
    } catch (error) {
      job.status = "failed";
      job.error = redactOutput(error instanceof Error ? error.message : String(error));
      this.#log(job, "error", job.error);
    } finally {
      job.currentStep = null;
      job.finishedAt = timestamp();
      this.activeByBot.delete(bot.id);
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
        buffers[level] = flush ? "" : lines.pop() ?? "";
        for (const line of lines) this.#log(job, level, line);
        if (flush && buffers[level]) this.#log(job, level, buffers[level]);
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
