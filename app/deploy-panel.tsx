"use client";

import { useCallback, useEffect, useState } from "react";
import type { BotDefinition } from "@/lib/control-center/types";
import { RuntimeStatusPanel } from "./runtime-status-panel";

const agentBaseUrl = "http://127.0.0.1:43121";

type DeployAction = "release" | "deploy" | "rollback";
type AgentCheck = { id: string; label: string; ok: boolean };
type DeploymentJob = {
  id: string;
  action: DeployAction;
  status: "queued" | "running" | "succeeded" | "failed";
  currentStep: string | null;
  image: string | null;
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
  readiness: Record<DeployAction, boolean>;
  checks: AgentCheck[];
  activeJob: DeploymentJob | null;
};

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Error HTTP ${response.status}`);
  return body;
}

export function DeployPanel({ bot }: { bot: BotDefinition }) {
  const [info, setInfo] = useState<DeploymentInfo | null>(null);
  const [job, setJob] = useState<DeploymentJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentError, setAgentError] = useState("");
  const [actionError, setActionError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");

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
        if (next.status === "succeeded" || next.status === "failed") void refreshInfo();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "No se pudo actualizar la operación.");
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job, refreshInfo]);

  async function runAction(action: DeployAction) {
    const copy = {
      release: "construir, probar y publicar una imagen nueva, y después desplegarla en producción",
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

  const busy = job?.status === "queued" || job?.status === "running";
  const statusLabel = job
    ? { queued: "En cola", running: "En curso", succeeded: "Completado", failed: "Falló" }[job.status]
    : "Sin operaciones";

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

      {!agentError && job ? (
        <section className="panel deploy-job-panel" aria-live="polite">
          <div className="panel__header">
            <div><span className="eyebrow">EJECUCIÓN AUDITADA</span><h2>{job.currentStep ?? statusLabel}</h2></div>
            <span className={`deploy-job-status deploy-job-status--${job.status}`}>{statusLabel}</span>
          </div>
          {job.image ? <p className="deploy-job-image"><span>Imagen</span><code>{job.image}</code></p> : null}
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
