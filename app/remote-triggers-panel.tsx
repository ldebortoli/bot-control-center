"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BotDefinition, TriggerDefinition, TriggerModerationAction, TriggerModerationResult } from "@/lib/control-center/types";
import { TriggerMediaViewer } from "./trigger-media-viewer";

const agentBaseUrl = "http://127.0.0.1:43121";

type TriggerResponse = {
  observedAt: string;
  triggers: TriggerDefinition[];
};

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Error HTTP ${response.status}`);
  return body;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function mediaGlyph(trigger: TriggerDefinition) {
  if (trigger.media?.kind === "video") return "▶";
  if (trigger.media?.kind === "audio") return "♫";
  if (trigger.media?.kind === "image") return "▧";
  if (trigger.media?.kind === "sticker") return "★";
  if (trigger.media?.kind === "file") return "↓";
  return "Aa";
}

export function RemoteTriggersPanel({ bot }: { bot: BotDefinition }) {
  const [triggers, setTriggers] = useState<TriggerDefinition[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [moderating, setModerating] = useState(false);
  const [message, setMessage] = useState("");

  const selected = useMemo(
    () => triggers.find((trigger) => trigger.id === selectedId) ?? triggers[0] ?? null,
    [selectedId, triggers],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${agentBaseUrl}/api/bots/${encodeURIComponent(bot.id)}/triggers`, { cache: "no-store" });
      const payload = await readResponse<TriggerResponse>(response);
      setTriggers(payload.triggers);
      setObservedAt(payload.observedAt);
      setSelectedId((current) => payload.triggers.some((trigger) => trigger.id === current) ? current : (payload.triggers[0]?.id ?? ""));
    } catch {
      setTriggers([]);
      setSelectedId("");
      setError("Error de conexión. No pude cargar los triggers.");
    } finally {
      setLoading(false);
    }
  }, [bot.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function moderate(trigger: TriggerDefinition, action: TriggerModerationAction) {
    const label = {
      "delete-trigger": "eliminar el trigger",
      "block-user": "bloquear al usuario en el bot",
      "delete-and-block": "eliminar el trigger y bloquear al usuario en el bot",
    }[action];
    if (!window.confirm(`¿Confirmás ${label}? Se enviará una advertencia a “${trigger.chat.title}”.`)) return;
    setModerating(true);
    setMessage("");
    try {
      const response = await fetch(`${agentBaseUrl}/api/bots/${encodeURIComponent(bot.id)}/triggers/moderate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bot-Control-Action": "moderate-trigger",
        },
        body: JSON.stringify({ confirmation: bot.id, triggerId: trigger.id, action }),
      });
      const result = await readResponse<TriggerModerationResult>(response);
      const actionResult = result.triggerDeleted && result.userBlocked
        ? "Trigger eliminado y usuario bloqueado."
        : result.triggerDeleted
          ? "Trigger eliminado."
          : result.userBlocked
            ? "Usuario bloqueado."
            : "La acción no modificó datos.";
      setMessage(`${actionResult} ${result.announcementSent ? "Advertencia enviada al chat." : "La advertencia no pudo enviarse; revisá el detalle remoto."}`);
      await refresh();
    } catch (moderationError) {
      setMessage(moderationError instanceof Error ? moderationError.message : "No se pudo completar la moderación.");
    } finally {
      setModerating(false);
    }
  }

  return (
    <section className="trigger-workspace">
      <div className="panel trigger-panel">
        <div className="panel__header">
          <div><span className="eyebrow">DATOS REALES · GCP IAP</span><h2>Visualizador de triggers</h2></div>
          <button className="remote-refresh-button" disabled={loading} onClick={() => void refresh()} type="button">
            {loading ? "Cargando…" : "Actualizar"}
          </button>
        </div>

        {message ? <p className="moderation-feedback" role="status">{message}</p> : null}

        {loading && triggers.length === 0 ? (
          <div className="trigger-empty" aria-live="polite"><span aria-hidden="true">↻</span><h3>Consultando la VM</h3><p>Leyendo la base SQLite real por IAP…</p></div>
        ) : null}

        {error ? (
          <div className="trigger-empty trigger-empty--error" role="alert">
            <span aria-hidden="true">!</span><h3>{error}</h3><p>El bot, su infraestructura o el adaptador remoto pueden no estar disponibles.</p>
            <button className="remote-refresh-button" onClick={() => void refresh()} type="button">Reintentar</button>
          </div>
        ) : null}

        {!loading && !error && !selected ? (
            <div className="trigger-empty"><span aria-hidden="true">✓</span><h3>No hay triggers configurados</h3><p>La consulta al origen real terminó correctamente y devolvió cero resultados.</p></div>
        ) : null}

        {!error && selected ? (
          <div className="trigger-browser">
            <div className="trigger-list" aria-label="Triggers reales disponibles">
              <div className="trigger-list__head"><span>{triggers.length} reales</span><small>{observedAt ? `Actualizado ${formatDate(observedAt)}` : "Adaptador remoto"}</small></div>
              {triggers.map((trigger) => (
                <button
                  className={`trigger-list__item ${trigger.id === selected.id ? "trigger-list__item--active" : ""}`}
                  key={trigger.id}
                  onClick={() => { setSelectedId(trigger.id); setMessage(""); }}
                  type="button"
                >
                  <span className={`trigger-kind trigger-kind--${trigger.media?.kind ?? "text"}`}>{mediaGlyph(trigger)}</span>
                  <span><strong>{trigger.name}</strong><code>{trigger.phrase}</code><small>{trigger.chat.title} · {formatDate(trigger.createdAt)}</small></span>
                  {trigger.createdBy.blocked ? <b className="blocked-mini">Bloqueado</b> : null}
                </button>
              ))}
            </div>

            <article className="trigger-inspector">
              <header className="trigger-inspector__header">
                <div><span className="eyebrow">TRIGGER REAL SELECCIONADO</span><h3>{selected.name}</h3><code>{selected.phrase}</code></div>
                <span className={selected.enabled ? "remote-state remote-state--ok" : "remote-state remote-state--warning"}>
                  {selected.enabled ? "Triggers activos en el chat" : "Triggers pausados en el chat"}
                </span>
              </header>

              <TriggerMediaViewer key={selected.id} media={selected.media} triggerName={selected.name} />
              <div className="trigger-response"><span className="eyebrow">RESPUESTA</span><p>{selected.response}</p></div>
              <dl className="trigger-metadata">
                <div><dt>Agregado por</dt><dd><strong>{selected.createdBy.displayName}</strong><span>{selected.createdBy.username ? `@${selected.createdBy.username}` : selected.createdBy.id}</span></dd></div>
                <div><dt>Chat</dt><dd><strong>{selected.chat.title}</strong><span>ID {selected.chat.id}</span></dd></div>
                <div><dt>Creado</dt><dd><strong>{formatDate(selected.createdAt)}</strong><span>Persistencia remota</span></dd></div>
                <div><dt>Datos de uso</dt><dd><strong>No registrados</strong><span>El origen no informó hits por trigger</span></dd></div>
              </dl>

              {selected.createdBy.blocked ? <p className="blocked-notice"><span>!</span> Este usuario ya está bloqueado en Galerazo.</p> : null}
              <div className="moderation-actions">
                <div><span className="eyebrow">MODERACIÓN REMOTA</span><p>Las acciones modifican SQLite y envían una advertencia al chat de origen.</p></div>
                <div className="moderation-actions__buttons">
                  <button className="danger-button danger-button--outline" disabled={moderating} onClick={() => void moderate(selected, "delete-trigger")} type="button">Eliminar trigger</button>
                  <button className="warning-button" disabled={moderating || selected.createdBy.blocked} onClick={() => void moderate(selected, "block-user")} type="button">{selected.createdBy.blocked ? "Usuario bloqueado" : "Bloquear usuario"}</button>
                  <button className="danger-button" disabled={moderating || selected.createdBy.blocked} onClick={() => void moderate(selected, "delete-and-block")} type="button">Eliminar y bloquear</button>
                </div>
              </div>
            </article>
          </div>
        ) : null}

        <p className="guardrail"><span>i</span> No se muestran fixtures: toda la lista proviene del adaptador remoto. Los archivos se descargan bajo demanda sin exponer credenciales.</p>
      </div>
    </section>
  );
}
