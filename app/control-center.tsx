"use client";

import { useMemo, useState } from "react";
import { validateReadonlyQuery } from "@/lib/control-center/query-policy";
import type { BotDefinition, LogLevel, TriggerDefinition } from "@/lib/control-center/types";

type View = "overview" | "logs" | "triggers" | "sql";

const views: { id: View; label: string; glyph: string }[] = [
  { id: "overview", label: "Resumen", glyph: "⌁" },
  { id: "logs", label: "Logs", glyph: "≡" },
  { id: "triggers", label: "Triggers", glyph: "↯" },
  { id: "sql", label: "SQL", glyph: "⌘" },
];

const statusCopy = {
  online: "En línea",
  degraded: "Atención",
  offline: "Sin conexión",
};

const transportCopy = {
  "gcp-iap": "IAP / SSH",
  ssh: "SSH",
  railway: "Railway API",
};

function StatusDot({ status }: { status: BotDefinition["status"] }) {
  return <span className={`status-dot status-dot--${status}`} aria-hidden="true" />;
}

function EmptyCapability({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <span className="empty-state__mark">⌁</span>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

export function ControlCenter({ bots }: { bots: BotDefinition[] }) {
  const [selectedId, setSelectedId] = useState(bots[0]?.id ?? "");
  const [view, setView] = useState<View>("overview");
  const [logFilter, setLogFilter] = useState<"all" | LogLevel>("all");
  const [logSearch, setLogSearch] = useState("");
  const [query, setQuery] = useState(
    "SELECT trigger, COUNT(*) AS ejecuciones\nFROM trigger_events\nGROUP BY trigger\nORDER BY ejecuciones DESC\nLIMIT 20;",
  );
  const [queryState, setQueryState] = useState<"idle" | "success" | "error">("idle");
  const [queryMessage, setQueryMessage] = useState("La ejecución usa datos demo; todavía no se conecta a una base real.");
  const [refreshLabel, setRefreshLabel] = useState("hace 18 s");
  const [triggerState, setTriggerState] = useState<Record<string, boolean>>({});

  const bot = bots.find((item) => item.id === selectedId) ?? bots[0] ?? null;
  const botLogs = useMemo(() => bot?.logs ?? [], [bot]);

  const filteredLogs = useMemo(() => {
    const needle = logSearch.trim().toLocaleLowerCase("es");
    return botLogs.filter((entry) => {
      const levelMatches = logFilter === "all" || entry.level === logFilter;
      const textMatches =
        !needle ||
        `${entry.source} ${entry.message}`.toLocaleLowerCase("es").includes(needle);
      return levelMatches && textMatches;
    });
  }, [botLogs, logFilter, logSearch]);

  const queryColumns = bot?.queryRows[0] ? Object.keys(bot.queryRows[0]) : [];

  function selectBot(id: string) {
    setSelectedId(id);
    setView("overview");
    setLogFilter("all");
    setLogSearch("");
    setQueryState("idle");
    setQueryMessage("La ejecución usa datos demo; todavía no se conecta a una base real.");
  }

  function runQuery() {
    if (!bot.capabilities.includes("sql")) {
      setQueryState("error");
      setQueryMessage("Este bot no declaró la capacidad SQL.");
      return;
    }

    const check = validateReadonlyQuery(query);
    setQueryState(check.safe ? "success" : "error");
    setQueryMessage(
      check.safe
        ? `${check.message} Resultado demo: ${bot.queryRows.length} filas en 38 ms.`
        : check.message,
    );
  }

  function toggleTrigger(trigger: TriggerDefinition) {
    setTriggerState((current) => ({
      ...current,
      [trigger.id]: !(current[trigger.id] ?? trigger.enabled),
    }));
  }

  if (!bot) {
    return <main className="fatal-state">No hay bots registrados.</main>;
  }

  return (
    <div className="control-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__signal" aria-hidden="true"><i /><i /><i /></span>
          <div>
            <strong>Bot Control</strong>
            <span>Centro de operaciones</span>
          </div>
        </div>

        <div className="local-mode">
          <span>●</span>
          <div>
            <strong>Modo local</strong>
            <small>Sin conexiones reales</small>
          </div>
        </div>

        <div className="sidebar__heading">
          <span>FLOTA</span>
          <span>{bots.length} bots</span>
        </div>

        <nav className="bot-list" aria-label="Bots registrados">
          {bots.map((item) => (
            <button
              className={`bot-item ${item.id === bot.id ? "bot-item--active" : ""}`}
              key={item.id}
              onClick={() => selectBot(item.id)}
              type="button"
            >
              <span className="bot-avatar">{item.initials}</span>
              <span className="bot-item__copy">
                <strong>{item.name}</strong>
                <small><StatusDot status={item.status} />{statusCopy[item.status]}</small>
              </span>
              <span className="bot-item__chevron">›</span>
            </button>
          ))}
        </nav>

        <div className="sidebar__footer">
          <span className="sidebar__footer-icon">⌁</span>
          <div>
            <strong>Core preparado</strong>
            <small>Adaptadores desacoplados</small>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs"><span>Flota</span><b>/</b><strong>{bot.name}</strong></div>
          <div className="topbar__actions">
            <span className="last-update">Actualizado {refreshLabel}</span>
            <button className="refresh-button" type="button" onClick={() => setRefreshLabel("ahora")}>
              <span aria-hidden="true">↻</span> Actualizar
            </button>
          </div>
        </header>

        <div className="workspace">
          <section className="bot-hero">
            <div className="bot-avatar bot-avatar--hero">{bot.initials}</div>
            <div className="bot-hero__main">
              <div className="bot-hero__title">
                <h1>{bot.name}</h1>
                <span className={`status-pill status-pill--${bot.status}`}><StatusDot status={bot.status} />{bot.statusLabel}</span>
              </div>
              <p>{bot.description}</p>
              <div className="identity-row">
                <span>{bot.provider}</span>
                <i>•</i>
                <span>{transportCopy[bot.transport]}</span>
                <i>•</i>
                <span>{bot.environment}</span>
              </div>
            </div>
            <div className="version-card">
              <small>VERSIÓN ACTIVA</small>
              <strong>{bot.version}</strong>
              <span>commit {bot.commit}</span>
            </div>
          </section>

          <nav className="view-tabs" aria-label="Vistas del bot">
            {views.map((item) => (
              <button
                key={item.id}
                type="button"
                className={view === item.id ? "view-tab view-tab--active" : "view-tab"}
                onClick={() => setView(item.id)}
              >
                <span aria-hidden="true">{item.glyph}</span>{item.label}
                {item.id === "triggers" && bot.triggers.length > 0 ? <b>{bot.triggers.length}</b> : null}
              </button>
            ))}
          </nav>

          {view === "overview" ? (
            <div className="content-stack">
              <section className="metrics-grid" aria-label="Métricas principales">
                {bot.metrics.map((metric) => (
                  <article className={`metric-card metric-card--${metric.tone ?? "default"}`} key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <small>{metric.detail}</small>
                  </article>
                ))}
              </section>

              <div className="overview-grid">
                <section className="panel service-panel">
                  <div className="panel__header">
                    <div><span className="eyebrow">SERVICIO</span><h2>Estado del proceso</h2></div>
                    <span className={`service-state service-state--${bot.status}`}>{bot.status === "offline" ? "inactive" : "active"}</span>
                  </div>
                  <div className="service-command">
                    <span>$</span>
                    <code>systemctl status {bot.id}.service</code>
                  </div>
                  <dl className="service-details">
                    <div><dt>Host</dt><dd>{bot.host}</dd></div>
                    <div><dt>Transporte</dt><dd>{transportCopy[bot.transport]}</dd></div>
                    <div><dt>Acceso</dt><dd>{bot.status === "offline" ? "no disponible" : "solo lectura"}</dd></div>
                    <div><dt>Última señal</dt><dd>{bot.updatedAt}</dd></div>
                  </dl>
                  <p className="guardrail"><span>✓</span> Los controles destructivos están desactivados en esta etapa.</p>
                </section>

                <section className="panel activity-panel">
                  <div className="panel__header">
                    <div><span className="eyebrow">ACTIVIDAD</span><h2>Últimos eventos</h2></div>
                    <button type="button" onClick={() => setView("logs")}>Ver logs</button>
                  </div>
                  <div className="activity-list">
                    {bot.logs.slice(0, 4).map((entry) => (
                      <div className="activity-row" key={entry.id}>
                        <span className={`log-mark log-mark--${entry.level}`} />
                        <div><strong>{entry.source}</strong><p>{entry.message}</p></div>
                        <time>{entry.timestamp}</time>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="panel capability-panel">
                <div className="panel__header">
                  <div><span className="eyebrow">ARQUITECTURA</span><h2>Capacidades declaradas</h2></div>
                  <span className="contract-badge">contrato botctl</span>
                </div>
                <div className="capability-list">
                  {(["status", "logs", "sql", "triggers"] as const).map((capability) => {
                    const enabled = bot.capabilities.includes(capability);
                    return (
                      <div className={enabled ? "capability capability--enabled" : "capability"} key={capability}>
                        <span>{enabled ? "✓" : "—"}</span>
                        <div><strong>{capability}</strong><small>{enabled ? "Disponible" : "No declarado"}</small></div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          ) : null}

          {view === "logs" ? (
            <section className="panel logs-panel">
              <div className="panel__header panel__header--wrap">
                <div><span className="eyebrow">STREAM REMOTO · DEMO</span><h2>Logs del proceso</h2></div>
                <div className="log-tools">
                  <label className="search-field"><span>⌕</span><input value={logSearch} onChange={(event) => setLogSearch(event.target.value)} placeholder="Buscar en logs…" /></label>
                  <div className="level-filter">
                    {(["all", "info", "warning", "error"] as const).map((level) => (
                      <button className={logFilter === level ? "active" : ""} key={level} onClick={() => setLogFilter(level)} type="button">
                        {level === "all" ? "Todos" : level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="terminal-head"><span>LIVE TAIL</span><span>{filteredLogs.length} entradas</span></div>
              <div className="terminal" role="log" aria-live="polite">
                {filteredLogs.length ? filteredLogs.map((entry) => (
                  <div className="terminal-row" key={entry.id}>
                    <time>{entry.timestamp}</time>
                    <span className={`terminal-level terminal-level--${entry.level}`}>{entry.level}</span>
                    <strong>{entry.source}</strong>
                    <p>{entry.message}</p>
                  </div>
                )) : <p className="terminal-empty">No hay entradas que coincidan con el filtro.</p>}
              </div>
            </section>
          ) : null}

          {view === "triggers" ? (
            bot.capabilities.includes("triggers") ? (
              <section className="panel trigger-panel">
                <div className="panel__header">
                  <div><span className="eyebrow">MÓDULO GALERAZO</span><h2>Triggers configurados</h2></div>
                  <span className="demo-badge">Cambios locales</span>
                </div>
                <div className="trigger-table-wrap">
                  <table className="trigger-table">
                    <thead><tr><th>Trigger</th><th>Respuesta</th><th>Uso</th><th>Última vez</th><th>Estado</th></tr></thead>
                    <tbody>
                      {bot.triggers.map((trigger) => {
                        const enabled = triggerState[trigger.id] ?? trigger.enabled;
                        return (
                          <tr key={trigger.id}>
                            <td><strong>{trigger.name}</strong><code>{trigger.phrase}</code></td>
                            <td>{trigger.response}</td>
                            <td><b>{trigger.hits}</b> ejecuciones</td>
                            <td>{trigger.lastHit}</td>
                            <td><button className={enabled ? "toggle toggle--on" : "toggle"} onClick={() => toggleTrigger(trigger)} type="button" aria-pressed={enabled}><span /></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="guardrail"><span>i</span> Esta vista demuestra el módulo específico de Galerazo. Todavía no escribe cambios en el bot.</p>
              </section>
            ) : <EmptyCapability title="Este bot no expone triggers" detail="Las capacidades son opcionales y cada bot declara únicamente las que soporta." />
          ) : null}

          {view === "sql" ? (
            bot.capabilities.includes("sql") ? (
              <div className="sql-grid">
                <section className="panel query-panel">
                  <div className="panel__header">
                    <div><span className="eyebrow">CONSOLA SQLITE</span><h2>Consulta segura</h2></div>
                    <span className="readonly-badge">READ ONLY</span>
                  </div>
                  <div className="editor-wrap">
                    <div className="editor-gutter">1<br />2<br />3<br />4<br />5</div>
                    <textarea aria-label="Consulta SQL" spellCheck={false} value={query} onChange={(event) => { setQuery(event.target.value); setQueryState("idle"); }} />
                  </div>
                  <div className="query-actions">
                    <p className={`query-message query-message--${queryState}`}>{queryMessage}</p>
                    <button className="run-button" type="button" onClick={runQuery}><span>▶</span> Ejecutar consulta</button>
                  </div>
                  <div className="sql-rules">
                    <span>Permitido: SELECT · WITH · EXPLAIN</span>
                    <span>Límite futuro: 500 filas · 5 s</span>
                  </div>
                </section>

                <section className="panel result-panel">
                  <div className="panel__header">
                    <div><span className="eyebrow">RESULTADO</span><h2>{queryState === "success" ? `${bot.queryRows.length} filas` : "Esperando ejecución"}</h2></div>
                    <span className="demo-badge">Datos demo</span>
                  </div>
                  {queryState === "success" && bot.queryRows.length ? (
                    <div className="result-table-wrap"><table className="result-table"><thead><tr>{queryColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{bot.queryRows.map((row, index) => <tr key={index}>{queryColumns.map((column) => <td key={column}>{row[column]}</td>)}</tr>)}</tbody></table></div>
                  ) : (
                    <div className="result-placeholder"><span>⌘</span><p>Validá y ejecutá una consulta para ver el resultado de ejemplo.</p></div>
                  )}
                </section>
              </div>
            ) : <EmptyCapability title="SQL no está disponible" detail="Este bot no declaró acceso a una base SQLite de solo lectura." />
          ) : null}
        </div>
      </main>
    </div>
  );
}
