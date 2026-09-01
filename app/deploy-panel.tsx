"use client";

import { useCallback, useEffect, useState } from "react";
import type { BotDefinition } from "@/lib/control-center/types";
import { RuntimeStatusPanel } from "./runtime-status-panel";

const agentBaseUrl = "http://127.0.0.1:43121";

type DeployAction = "release" | "scheduled-release" | "deploy" | "rollback";
type AgentCheck = { id: string; label: string; ok: boolean };
type ReleaseSchedule = {
  enabled: boolean;
  updateDependencies: boolean;
  notifyLogChannel: boolean;
  dayOfMonth: number;
  time: string;
  branch: string;
  remote: string;
};
type DeploymentJob = {
  id: string;
  action: DeployAction;
  status: "queued" | "running" | "succeeded" | "failed" | "skipped";
  currentStep: string | null;
  image: string | null;
  targetCommit: string | null;
  skipReason: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  error: string | null;
  logs: { at: string; level: string; message: string }[];
};
type DeploymentInfo = {
  configured: boolean;
  configError: string | null;
  target: {
    projectId: string;
    location: string;
    repository: string;
    zone: string;
    instance: string;
  } | null;
  latestImage: string | null;
  releaseSchedule: ReleaseSchedule | null;
  readiness: Record<DeployAction, boolean>;
  checks: AgentCheck[];
  activeJob: DeploymentJob | null;
  lastScheduledRun: DeploymentJob | null;
};

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Error HTTP ${response.status}`);
  return body;
}

function formatNextMonthlyRun(dayOfMonth: number, time: string, now: Date) {
  const [hour, minute] = time.split(":").map(Number);
  const next = new Date(now.getFullYear(), now.getMonth(), dayOfMonth, hour, minute, 0, 0);
  if (next <= now) next.setMonth(next.getMonth() + 1);
  return next.toLocaleString("es-AR");
}

export function DeployPanel({ bot }: { bot: BotDefinition }) {
  const [info, setInfo] = useState<DeploymentInfo | null>(null);
  const [job, setJob] = useState<DeploymentJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentError, setAgentError] = useState("");
  const [actionError, setActionError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleUpdatesDependencies, setScheduleUpdatesDependencies] = useState(false);
  const [scheduleNotifiesLogChannel, setScheduleNotifiesLogChannel] = useState(false);
  const [scheduleDay, setScheduleDay] = useState(1);
  const [scheduleTime, setScheduleTime] = useState("03:00");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [scheduledRunIsCurrent, setScheduledRunIsCurrent] = useState(false);
  const [nextRunLabel, setNextRunLabel] = useState("");

  const refreshInfo = useCallback(async (manual = false) => {
    if (manual) {
      setVerifying(true);
      setVerificationMessage("Verificando requisitos locales…");
    }
    try {
      const response = await fetch(`${agentBaseUrl}/api/bots/${encodeURIComponent(bot.id)}/deployment`, {
        cache: "no-store",
      });
      const next = await readResponse<DeploymentInfo>(response);
      setInfo(next);
      if (next.activeJob) setJob(next.activeJob);
      setScheduleEnabled(next.releaseSchedule?.enabled ?? false);
      setScheduleUpdatesDependencies(next.releaseSchedule?.updateDependencies ?? false);
      setScheduleNotifiesLogChannel(next.releaseSchedule?.notifyLogChannel ?? false);
      const nextDay = next.releaseSchedule?.dayOfMonth ?? 1;
      const nextTime = next.releaseSchedule?.time ?? "03:00";
      setScheduleDay(nextDay);
      setScheduleTime(nextTime);
      setNextRunLabel(formatNextMonthlyRun(nextDay, nextTime, new Date()));
      setScheduledRunIsCurrent(next.lastScheduledRun?.status === "running"
        && Boolean(next.lastScheduledRun.startedAt)
        && Date.now() - new Date(next.lastScheduledRun.startedAt as string).getTime() < 4 * 60 * 60 * 1000);
      setAgentError("");
      if (manual) {
        const ready = next.checks.filter((check) => check.ok).length;
        setVerificationMessage(`Verificación completada: ${ready}/${next.checks.length} requisitos listos · ${new Date().toLocaleTimeString("es-AR")}.`);
      }
    } catch (error) {
      setInfo(null);
      setAgentError(error instanceof Error ? error.message : "No se pudo contactar al agente local.");
      if (manual) setVerificationMessage("La verificación falló: no se pudo contactar al agente local.");
    } finally {
      setLoading(false);
      if (manual) setVerifying(false);
    }
  }, [bot.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshInfo(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshInfo]);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${agentBaseUrl}/api/jobs/${job.id}`, { cache: "no-store" });
        const next = await readResponse<DeploymentJob>(response);
        setJob(next);
        if (next.status === "succeeded" || next.status === "failed" || next.status === "skipped") void refreshInfo();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "No se pudo actualizar la operación.");
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job, refreshInfo]);

  async function runAction(action: DeployAction) {
    const copy = {
      release: "construir, probar y publicar una imagen nueva, y después desplegarla en producción",
      "scheduled-release": "ejecutar ahora el mismo corte seguro de la programación mensual",
      deploy: "desplegar la última imagen ya publicada en producción",
      rollback: "restaurar en producción la imagen anterior",
    }[action];
    if (!window.confirm(`¿Confirmás ${copy} para ${bot.name}? La operación seguirá aunque cierres esta vista.`)) return;

    setActionError("");
    try {
      const response = await fetch(`${agentBaseUrl}/api/bots/${encodeURIComponent(bot.id)}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bot-Control-Action": action,
        },
        body: JSON.stringify({ confirmation: bot.id }),
      });
      const next = await readResponse<DeploymentJob>(response);
      setJob(next);
      await refreshInfo();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudo iniciar la operación.");
    }
  }

  async function saveSchedule() {
    if (scheduleEnabled && !window.confirm(`¿Confirmás el release automático mensual de ${bot.name} el día ${scheduleDay} a las ${scheduleTime}?${scheduleUpdatesDependencies ? " Antes del corte buscará y validará actualizaciones estables de las dependencias." : ""}`)) return;
    setSavingSchedule(true);
    setScheduleMessage("");
    setActionError("");
    try {
      const response = await fetch(`${agentBaseUrl}/api/bots/${encodeURIComponent(bot.id)}/release-schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bot-Control-Action": "release-schedule",
        },
        body: JSON.stringify({
          confirmation: bot.id,
          schedule: {
            enabled: scheduleEnabled,
            updateDependencies: scheduleUpdatesDependencies,
            notifyLogChannel: scheduleNotifiesLogChannel,
            dayOfMonth: scheduleDay,
            time: scheduleTime,
            branch: info?.releaseSchedule?.branch ?? "main",
            remote: info?.releaseSchedule?.remote ?? "origin",
          },
        }),
      });
      const saved = await readResponse<{ schedule: ReleaseSchedule; task: { nextRunAt: string | null } }>(response);
      setScheduleMessage(saved.schedule.enabled
        ? `Programación guardada. Próxima ejecución: ${saved.task.nextRunAt ? new Date(saved.task.nextRunAt).toLocaleString("es-AR") : "el próximo día configurado"}.`
        : "Programación deshabilitada.");
      await refreshInfo();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudo guardar la programación.");
    } finally {
      setSavingSchedule(false);
    }
  }

  const busy = job?.status === "queued" || job?.status === "running" || scheduledRunIsCurrent;
  const statusLabel = job
    ? { queued: "En cola", running: "En curso", succeeded: "Completado", failed: "Falló", skipped: "Sin deploy" }[job.status]
    : "Sin operaciones";
  const scheduledStatus = info?.lastScheduledRun
    ? {
        queued: "En cola",
        running: "En curso",
        succeeded: "Desplegado",
        failed: "Falló",
        skipped: info.lastScheduledRun.skipReason === "no-changes" ? "Sin cambios" : "Pospuesto",
      }[info.lastScheduledRun.status]
    : "Todavía no ejecutado";

  return (
    <div className="deploy-workspace">
      <section className="panel deploy-hero-panel">
        <div className="deploy-hero-panel__copy">
          <span className="eyebrow">RELEASE CONTROLADA · LOCAL</span>
          <h2>Publicar y desplegar Galerazo</h2>
          <p>Un solo flujo ejecuta tests, construye la imagen, la publica en Artifact Registry y actualiza la VM por IAP. No acepta comandos libres ni guarda credenciales.</p>
        </div>
        <div className={`agent-state ${agentError ? "agent-state--offline" : "agent-state--online"}`}>
          <span />
          <div><strong>{agentError ? "Agente desconectado" : "Agente local activo"}</strong><small>127.0.0.1:43121</small></div>
        </div>
      </section>

      <RuntimeStatusPanel bot={bot} />

      {agentError ? (
        <section className="panel deploy-empty">
          <span aria-hidden="true">!</span>
          <h3>El agente local no está disponible</h3>
          <p>Abrí Bot Control Center desde su acceso de Windows o ejecutá <code>npm run dev:full</code>. El navegador por sí solo no puede ejecutar Docker ni <code>gcloud</code>.</p>
          <button type="button" onClick={() => void refreshInfo()}>Reintentar conexión</button>
        </section>
      ) : null}

      {!agentError && info ? (
        <div className="deploy-grid">
          <section className="panel deploy-actions-panel">
            <div className="panel__header">
              <div><span className="eyebrow">DESTINO</span><h2>{info.target?.instance ?? "Sin configurar"}</h2></div>
              <span className={info.configured ? "contract-badge" : "pending-badge"}>{info.configured ? "GCE + IAP" : "PENDIENTE"}</span>
            </div>

            {info.target ? (
              <dl className="deploy-target">
                <div><dt>Proyecto</dt><dd>{info.target.projectId}</dd></div>
                <div><dt>Zona</dt><dd>{info.target.zone}</dd></div>
                <div><dt>Registro</dt><dd>{info.target.location}/{info.target.repository}</dd></div>
                <div className="deploy-target__image"><dt>Última imagen</dt><dd title={info.latestImage ?? undefined}>{info.latestImage ?? "Todavía no publicada"}</dd></div>
              </dl>
            ) : <p className="deploy-config-error">{info.configError}</p>}

            <div className="deploy-primary-action">
              <button disabled={loading || busy || !info.readiness.release} onClick={() => void runAction("release")} type="button">
                <span aria-hidden="true">↑</span>
                <span><strong>{busy ? "Deploy en curso…" : "Publicar y deployar"}</strong><small>tests → imagen → registry → VM</small></span>
              </button>
              {!info.readiness.release ? <p>Completá los requisitos marcados antes de habilitar el deploy.</p> : <p>Se pedirá una confirmación explícita antes de tocar producción.</p>}
            </div>

            <div className="deploy-secondary-actions">
              <button disabled={busy || !info.readiness.deploy} onClick={() => void runAction("deploy")} type="button">Deployar última imagen</button>
              <button className="deploy-rollback" disabled={busy || !info.readiness.rollback} onClick={() => void runAction("rollback")} type="button">Rollback</button>
            </div>
            {actionError ? <p className="deploy-action-error" role="alert">{actionError}</p> : null}
          </section>

          <section className="panel deploy-checks-panel">
            <div className="panel__header">
              <div><span className="eyebrow">PRE-FLIGHT</span><h2>Requisitos locales</h2></div>
              <button disabled={verifying} type="button" onClick={() => void refreshInfo(true)}>{verifying ? "Verificando…" : "Verificar"}</button>
            </div>
            {verificationMessage ? <p className="verification-feedback" role="status">{verificationMessage}</p> : null}
            <div className="deploy-checks">
              {info.checks.map((check) => (
                <div className={check.ok ? "deploy-check deploy-check--ok" : "deploy-check"} key={check.id}>
                  <span>{check.ok ? "✓" : "×"}</span><strong>{check.label}</strong><small>{check.ok ? "Listo" : "Falta"}</small>
                </div>
              ))}
            </div>
            {info.configError ? <p className="deploy-config-note">{info.configError}</p> : null}
          </section>
        </div>
      ) : null}

      {!agentError && info?.configured ? (
        <section className="panel deploy-schedule-panel">
          <div className="panel__header">
            <div><span className="eyebrow">RELEASE PROGRAMADO</span><h2>Corte mensual seguro</h2></div>
            <span className={scheduleEnabled ? "contract-badge" : "pending-badge"}>{scheduleEnabled ? "ACTIVO" : "DESACTIVADO"}</span>
          </div>
          <div className="deploy-schedule-grid">
            <label className="deploy-schedule-toggle">
              <input checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} type="checkbox" />
              <span><strong>Publicar sólo si hay commits nuevos</strong><small>La tarea funciona aunque Bot Control Center esté cerrado.</small></span>
            </label>
            <label><span>Día del mes</span><input max={28} min={1} onChange={(event) => { const value = Number(event.target.value); setScheduleDay(value); setNextRunLabel(formatNextMonthlyRun(value, scheduleTime, new Date())); }} type="number" value={scheduleDay} /></label>
            <label><span>Hora local</span><input onChange={(event) => { const value = event.target.value; setScheduleTime(value); setNextRunLabel(formatNextMonthlyRun(scheduleDay, value, new Date())); }} type="time" value={scheduleTime} /></label>
            <div className="deploy-schedule-next"><span>Próximo corte</span><strong>{nextRunLabel || "Calculando…"}</strong><small>{info.releaseSchedule?.remote ?? "origin"}/{info.releaseSchedule?.branch ?? "main"}</small></div>
            <label className="deploy-schedule-toggle deploy-schedule-toggle--dependencies">
              <input checked={scheduleUpdatesDependencies} disabled={!scheduleEnabled} onChange={(event) => setScheduleUpdatesDependencies(event.target.checked)} type="checkbox" />
              <span><strong>Actualizar librerías antes del corte</strong><small>Si encuentra versiones estables nuevas, las valida, confirma y sube antes del deploy. Si no cambia nada, no crea ningún commit.</small></span>
            </label>
            <label className="deploy-schedule-toggle deploy-schedule-toggle--dependencies">
              <input checked={scheduleNotifiesLogChannel} disabled={!scheduleEnabled} onChange={(event) => setScheduleNotifiesLogChannel(event.target.checked)} type="checkbox" />
              <span><strong>Avisar inicio y resultado en Codex - Logs</strong><small>Publica mensajes fijos; nunca incluye credenciales ni la salida completa del deploy.</small></span>
            </label>
          </div>
          <div className="deploy-schedule-actions">
            <button disabled={savingSchedule || busy} onClick={() => void saveSchedule()} type="button">{savingSchedule ? "Guardando…" : "Guardar programación"}</button>
            <button disabled={busy || !info.readiness["scheduled-release"]} onClick={() => void runAction("scheduled-release")} type="button">Ejecutar corte seguro ahora</button>
            <div><span>Última ejecución</span><strong>{scheduledStatus}</strong>{info.lastScheduledRun?.targetCommit ? <code>{info.lastScheduledRun.targetCommit.slice(0, 12)}</code> : null}</div>
          </div>
          {scheduleMessage ? <p className="verification-feedback" role="status">{scheduleMessage}</p> : null}
          <p className="guardrail"><span>i</span> Trabaja sobre un worktree del commit fijado. Cuando la actualización de librerías está activa, sólo permite confirmar un <code>requirements.txt</code> validado y lo sube sin force; después despliega únicamente si el commit final todavía no tiene imagen. Si detecta archivos inesperados, pruebas fallidas, ramas divergentes u otro deploy, pospone y reintenta.</p>
        </section>
      ) : null}

      {!agentError && job ? (
        <section className="panel deploy-job-panel" aria-live="polite">
          <div className="panel__header">
            <div><span className="eyebrow">EJECUCIÓN AUDITADA</span><h2>{job.currentStep ?? statusLabel}</h2></div>
            <span className={`deploy-job-status deploy-job-status--${job.status}`}>{statusLabel}</span>
          </div>
          {job.image ? <p className="deploy-job-image"><span>Imagen</span><code>{job.image}</code></p> : null}
          {job.targetCommit ? <p className="deploy-job-image"><span>Commit fijado</span><code>{job.targetCommit}</code></p> : null}
          <div className="deploy-terminal" role="log">
            {job.logs.length ? job.logs.map((entry, index) => (
              <div key={`${entry.at}-${index}`} className={`deploy-terminal__line deploy-terminal__line--${entry.level}`}>
                <time>{new Date(entry.at).toLocaleTimeString("es-AR")}</time><span>{entry.message}</span>
              </div>
            )) : <p>Esperando la primera salida del proceso…</p>}
          </div>
          <p className="guardrail"><span>i</span> Cambiar de bot o de vista no cancela la operación. Si cerrás la aplicación durante un deploy, el launcher esperará a que termine antes de apagar el agente.</p>
        </section>
      ) : null}
    </div>
  );
}
