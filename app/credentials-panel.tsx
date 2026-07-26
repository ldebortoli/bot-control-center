"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { BotDefinition } from "@/lib/control-center/types";

const agentBaseUrl = "http://127.0.0.1:43121";

const credentialFields = [
  { key: "TELEGRAM_BOT_TOKEN", label: "Token de Telegram", hint: "Obligatorio para iniciar el bot", clearable: false },
  { key: "OPENAI_API_KEY", label: "Clave de OpenAI", hint: "Moderación opcional de contenido", clearable: true },
  { key: "TELEGRAM_DEV_USER_IDS", label: "IDs de desarrolladores", hint: "Separados por coma", clearable: true },
  { key: "TELEGRAM_LOG_CHAT_ID", label: "Chat de logs", hint: "ID numérico de Telegram", clearable: true },
  { key: "TELEGRAM_ANNOUNCEMENTS_CHAT_ID", label: "Chat de anuncios", hint: "ID numérico de Telegram", clearable: true },
  { key: "GOOGLE_SHEETS_SPREADSHEET_ID", label: "ID del spreadsheet", hint: "Opcional para gastos", clearable: true },
  { key: "GOOGLE_SHEETS_WORKSHEET_NAME", label: "Nombre de la hoja", hint: "Ej. Gastos", clearable: true },
] as const;

const googleCredentialsKey = "GOOGLE_SHEETS_CREDENTIALS_JSON";
type CredentialKey = typeof credentialFields[number]["key"] | typeof googleCredentialsKey;
type CredentialStatus = Record<CredentialKey, boolean>;
type CredentialJob = {
  id: string;
  action: "credentials";
  status: "queued" | "running" | "succeeded" | "failed";
  currentStep: string | null;
  error: string | null;
  logs: { at: string; level: string; message: string }[];
};
type CredentialInfo = {
  fields: CredentialStatus;
  writable: boolean;
  activeJob: CredentialJob | null;
};

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Error HTTP ${response.status}`);
  return body;
}

function emptyValues(): Record<CredentialKey, string> {
  return Object.fromEntries([
    ...credentialFields.map((field) => [field.key, ""]),
    [googleCredentialsKey, ""],
  ]) as Record<CredentialKey, string>;
}

export function CredentialsPanel({ bot }: { bot: BotDefinition }) {
  const [info, setInfo] = useState<CredentialInfo | null>(null);
  const [values, setValues] = useState<Record<CredentialKey, string>>(emptyValues);
  const [clearFields, setClearFields] = useState<Set<CredentialKey>>(new Set());
  const [job, setJob] = useState<CredentialJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch(`${agentBaseUrl}/api/bots/${encodeURIComponent(bot.id)}/credentials`, {
        cache: "no-store",
      });
      const next = await readResponse<CredentialInfo>(response);
      setInfo(next);
      if (next.activeJob?.action === "credentials") setJob(next.activeJob);
      setError("");
    } catch (nextError) {
      setInfo(null);
      setError(nextError instanceof Error ? nextError.message : "No se pudo consultar la configuración remota.");
    } finally {
      setLoading(false);
    }
  }, [bot.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshStatus]);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${agentBaseUrl}/api/jobs/${job.id}`, { cache: "no-store" });
        const next = await readResponse<CredentialJob>(response);
        setJob(next);
        if (next.status === "succeeded") {
          setMessage("Credenciales actualizadas. Se aplicarán cuando reinicies o despliegues el bot.");
          void refreshStatus();
        } else if (next.status === "failed") {
          setError(next.error ?? "La actualización remota falló.");
          void refreshStatus();
        }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "No se pudo actualizar el estado de la operación.");
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job, refreshStatus]);

  const pendingCount = useMemo(
    () => Object.values(values).filter((value) => value.trim()).length + clearFields.size,
    [clearFields, values],
  );
  const busy = job?.status === "queued" || job?.status === "running";

  function updateValue(key: CredentialKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    if (value.trim()) {
      setClearFields((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  function toggleClear(key: CredentialKey, checked: boolean) {
    setClearFields((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
    if (checked) setValues((current) => ({ ...current, [key]: "" }));
  }

  async function submitChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const updates: Record<string, string | Record<string, unknown>> = {};
    for (const field of credentialFields) {
      const value = values[field.key].trim();
      if (value) updates[field.key] = value;
    }
    const googleJson = values[googleCredentialsKey].trim();
    if (googleJson) {
      try {
        const parsed = JSON.parse(googleJson) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        updates[googleCredentialsKey] = parsed as Record<string, unknown>;
      } catch {
        setError("Las credenciales de Google Sheets deben ser un objeto JSON válido.");
        return;
      }
    }
    const clear = [...clearFields];
    if (Object.keys(updates).length === 0 && clear.length === 0) {
      setError("No hay cambios para aplicar. Los campos vacíos conservan el valor remoto.");
      return;
    }
    if (!window.confirm(`¿Confirmás ${pendingCount} cambio${pendingCount === 1 ? "" : "s"} de configuración remota para ${bot.name}? Los valores existentes no podrán leerse desde el panel.`)) return;

    try {
      const response = await fetch(`${agentBaseUrl}/api/bots/${encodeURIComponent(bot.id)}/credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bot-Control-Action": "credentials",
        },
        body: JSON.stringify({ confirmation: bot.id, patch: { updates, clear } }),
      });
      const next = await readResponse<CredentialJob>(response);
      setJob(next);
      setValues(emptyValues());
      setClearFields(new Set());
      setMessage("Transferencia privada iniciada; el panel ya descartó los valores ingresados.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "No se pudo iniciar la actualización.");
    }
  }

  return (
    <div className="credentials-workspace">
      <section className="panel credentials-hero">
        <div>
          <span className="eyebrow">CONFIGURACIÓN REMOTA · IAP</span>
          <h2>Credenciales de {bot.name}</h2>
          <p>El panel sólo consulta si cada valor existe. Nunca descarga tokens ni claves desde la VM.</p>
        </div>
        <button disabled={loading || busy} onClick={() => void refreshStatus()} type="button">Actualizar estado</button>
      </section>

      {error && !info ? (
        <section className="panel credentials-empty">
          <span aria-hidden="true">!</span><h3>No se pudo abrir la configuración remota</h3><p>{error}</p>
          <button onClick={() => void refreshStatus()} type="button">Reintentar</button>
        </section>
      ) : null}

      {info ? (
        <form className="credentials-grid" onSubmit={submitChanges}>
          <section className="panel credentials-form">
            <div className="panel__header">
              <div><span className="eyebrow">NUEVOS VALORES</span><h2>Actualizar configuración</h2></div>
              <span className="contract-badge">ENMASCARADO</span>
            </div>
            <p className="credentials-guidance">Dejá un campo vacío para conservar el valor actual. Marcá “Borrar” sólo cuando quieras quitar un dato opcional.</p>
            <div className="credentials-fields">
              {credentialFields.map((field) => (
                <label className="credential-field" key={field.key}>
                  <span className="credential-field__heading">
                    <strong>{field.label}</strong>
                    <small className={info.fields[field.key] ? "credential-present" : "credential-missing"}>
                      {info.fields[field.key] ? "✓ Presente" : "— Ausente"}
                    </small>
                  </span>
                  <input
                    autoComplete="new-password"
                    disabled={clearFields.has(field.key) || busy}
                    onChange={(event) => updateValue(field.key, event.target.value)}
                    placeholder={`${field.hint} · vacío conserva`}
                    type="password"
                    value={values[field.key]}
                  />
                  {field.clearable ? (
                    <span className="credential-clear">
                      <input checked={clearFields.has(field.key)} disabled={busy} onChange={(event) => toggleClear(field.key, event.target.checked)} type="checkbox" />
                      Borrar valor remoto
                    </span>
                  ) : <small className="credential-protected">El token principal no se puede borrar desde el panel.</small>}
                </label>
              ))}

              <label className="credential-field credential-field--wide">
                <span className="credential-field__heading">
                  <strong>JSON de cuenta de servicio de Google Sheets</strong>
                  <small className={info.fields[googleCredentialsKey] ? "credential-present" : "credential-missing"}>
                    {info.fields[googleCredentialsKey] ? "✓ Presente" : "— Ausente"}
                  </small>
                </span>
                <textarea
                  autoComplete="off"
                  className="credential-secret-textarea"
                  disabled={clearFields.has(googleCredentialsKey) || busy}
                  onChange={(event) => updateValue(googleCredentialsKey, event.target.value)}
                  placeholder="Pegá el objeto JSON completo; vacío conserva el archivo remoto"
                  spellCheck={false}
                  value={values[googleCredentialsKey]}
                />
                <span className="credential-clear">
                  <input checked={clearFields.has(googleCredentialsKey)} disabled={busy} onChange={(event) => toggleClear(googleCredentialsKey, event.target.checked)} type="checkbox" />
                  Borrar credencial remota de Sheets
                </span>
              </label>
            </div>
            <div className="credentials-submit">
              <p>{pendingCount ? `${pendingCount} cambio${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"}` : "Sin cambios pendientes"}</p>
              <button disabled={busy || pendingCount === 0 || !info.writable} type="submit">{busy ? "Aplicando…" : "Aplicar por IAP"}</button>
            </div>
            {error ? <p className="credentials-error" role="alert">{error}</p> : null}
            {message ? <p className="credentials-message" role="status">{message}</p> : null}
          </section>

          <aside className="panel credentials-audit" aria-live="polite">
            <div className="panel__header"><div><span className="eyebrow">AUDITORÍA</span><h2>Última operación</h2></div></div>
            {job ? (
              <>
                <span className={`deploy-job-status deploy-job-status--${job.status}`}>
                  {{ queued: "En cola", running: "En curso", succeeded: "Completada", failed: "Falló" }[job.status]}
                </span>
                {job.currentStep ? <p>{job.currentStep}</p> : null}
                <div className="credentials-log" role="log">
                  {job.logs.map((entry, index) => <p key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleTimeString("es-AR")}</time>{entry.message}</p>)}
                </div>
              </>
            ) : <p>No hay cambios de credenciales en esta sesión.</p>}
            <p className="guardrail"><span>i</span> Los cambios quedan guardados en la VM. El contenedor actual conserva su entorno: aplicalos con un deploy o una futura acción explícita de recreación.</p>
          </aside>
        </form>
      ) : null}
    </div>
  );
}
