"use client";

import { useCallback, useEffect, useState } from "react";
import type { BotDefinition } from "@/lib/control-center/types";

const agentBaseUrl = "http://127.0.0.1:43121";

type RuntimeStatus = {
  observedAt: string;
  vm: { status: string };
  container: {
    exists: boolean;
    status: string;
    running: boolean;
    health: string;
    restartCount: number;
    recentRestarts: number;
    restartLoop: boolean;
    image: string | null;
    startedAt: string | null;
  };
  telegram: { connected: boolean; username: string | null; error: string | null };
  resources: {
    cpuPercent: string | null;
    memoryUsage: string | null;
    memoryPercent: string | null;
    diskUsedBytes: number | null;
    diskTotalBytes: number | null;
    diskPercent: number | null;
  };
  database: { available: boolean; bytes: number | null };
  logs: string[];
  errors: string[];
  alerts: string[];
};

type StopJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
};

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Error HTTP ${response.status}`);
  return body;
}

function bytes(value: number | null) {
  if (value === null) return "Sin datos";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  return `${current.toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
}

export function RuntimeStatusPanel({ bot }: { bot: BotDefinition }) {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [job, setJob] = useState<StopJob | null>(null);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${agentBaseUrl}/api/bots/${encodeURIComponent(bot.id)}/runtime`, { cache: "no-store" });
      setRuntime(await readResponse<RuntimeStatus>(response));
      setError("");
    } catch (runtimeError) {
      setRuntime(null);
      setError(runtimeError instanceof Error ? runtimeError.message : "No se pudo consultar el bot remoto.");
    } finally {
      setLoading(false);
    }
  }, [bot.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${agentBaseUrl}/api/jobs/${job.id}`, { cache: "no-store" });
        const next = await readResponse<StopJob>(response);
        setJob(next);
        if (next.status === "succeeded") {
          setMessage("Contenedor detenido. La base, la imagen y la configuración se conservaron.");
          void refresh();
        } else if (next.status === "failed") {
          setMessage(next.error ?? "No se pudo detener el contenedor.");
          void refresh();
        }
      } catch (pollError) {
        setMessage(pollError instanceof Error ? pollError.message : "No se pudo seguir la detención.");
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job, refresh]);

  async function stopContainer() {
    if (!window.confirm(`¿Confirmás detener el contenedor de ${bot.name}? Esto corta el bucle de reinicios y conserva la base, la imagen y la configuración.`)) return;
    setMessage("");
    try {
      const response = await fetch(`${agentBaseUrl}/api/bots/${encodeURIComponent(bot.id)}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bot-Control-Action": "stop" },
        body: JSON.stringify({ confirmation: bot.id }),
      });
      setJob(await readResponse<StopJob>(response));
    } catch (stopError) {
      setMessage(stopError instanceof Error ? stopError.message : "No se pudo iniciar la detención.");
    }
  }

  const stopping = job?.status === "queued" || job?.status === "running";

  return (
    <section className="panel runtime-panel" aria-live="polite">
      <div className="panel__header panel__header--wrap">
        <div><span className="eyebrow">ESTADO REAL · CONEXIÓN REMOTA</span><h2>Operación de {bot.name}</h2></div>
        <div className="runtime-actions">
          {runtime?.container.exists ? <button className="runtime-stop" disabled={stopping} onClick={() => void stopContainer()} type="button">{stopping ? "Deteniendo…" : "Detener contenedor"}</button> : null}
          <button className="remote-refresh-button" disabled={loading || stopping} onClick={() => void refresh()} type="button">{loading ? "Actualizando…" : "Actualizar estado"}</button>
        </div>
      </div>

      {error ? <div className="runtime-alert runtime-alert--error" role="alert"><strong>Sin conexión con el bot</strong><span>{error}</span><small>No se muestran métricas, logs ni estados de ejemplo.</small></div> : null}
      {message ? <p className="moderation-feedback" role="status">{message}</p> : null}

      {runtime ? (
        <>
          {runtime.alerts.length ? <div className="runtime-alert"><strong>Requiere atención</strong><span>{runtime.alerts.join(" ")}</span></div> : null}
          <div className="runtime-grid">
            <article><span>VM</span><strong>{runtime.vm.status}</strong><small>Compute Engine</small></article>
            <article><span>Contenedor</span><strong>{runtime.container.status}</strong><small>{runtime.container.running ? "running" : "stopped"}</small></article>
            <article><span>Healthcheck</span><strong>{runtime.container.health}</strong><small>{runtime.container.health === "healthy" ? "saludable" : "revisar"}</small></article>
            <article className={runtime.container.restartLoop ? "runtime-card--danger" : ""}><span>Reinicios</span><strong>{runtime.container.restartCount}</strong><small>{runtime.container.recentRestarts} en 15 min</small></article>
            <article><span>Telegram</span><strong>{runtime.telegram.connected ? "conectado" : "sin conexión"}</strong><small>{runtime.telegram.username ? `@${runtime.telegram.username}` : (runtime.telegram.error ?? "getMe")}</small></article>
            <article><span>CPU</span><strong>{runtime.resources.cpuPercent ?? "Sin datos"}</strong><small>contenedor</small></article>
            <article><span>RAM</span><strong>{runtime.resources.memoryUsage ?? "Sin datos"}</strong><small>{runtime.resources.memoryPercent ?? "contenedor"}</small></article>
            <article><span>Disco VM</span><strong>{runtime.resources.diskPercent === null ? "Sin datos" : `${runtime.resources.diskPercent}%`}</strong><small>{bytes(runtime.resources.diskUsedBytes)} / {bytes(runtime.resources.diskTotalBytes)}</small></article>
            <article><span>SQLite</span><strong>{runtime.database.available ? "disponible" : "no disponible"}</strong><small>{bytes(runtime.database.bytes)}</small></article>
          </div>

          <div className="runtime-image"><span>Imagen desplegada</span><code>{runtime.container.image ?? "Sin contenedor desplegado"}</code></div>
          <div className="runtime-log-grid">
            <div><div className="runtime-log-title"><strong>Últimos logs</strong><span>{runtime.logs.length}</span></div><pre>{runtime.logs.length ? runtime.logs.join("\n") : "Sin logs disponibles."}</pre></div>
            <div><div className="runtime-log-title"><strong>Errores recientes</strong><span>{runtime.errors.length}</span></div><pre>{runtime.errors.length ? runtime.errors.join("\n") : "No se detectaron errores en el tramo consultado."}</pre></div>
          </div>
          <p className="runtime-observed">Actualizado {new Date(runtime.observedAt).toLocaleString("es-AR")} · La detención usa <code>docker compose stop</code>; no ejecuta <code>down</code> ni borra datos.</p>
        </>
      ) : null}
    </section>
  );
}
