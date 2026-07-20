"use client";

import { useEffect, useMemo, useState } from "react";
import { validateReadonlyQuery } from "@/lib/control-center/query-policy";
import type {
  BotDefinition,
  LogLevel,
  TriggerDefinition,
  TriggerModerationAction,
} from "@/lib/control-center/types";
import { TriggerMediaViewer } from "./trigger-media-viewer";

type View = "overview" | "logs" | "triggers" | "sql";
type FleetSnapshot = { activeIds: string[]; customBots: BotDefinition[] };
type ModerationAnnouncement = {
  id: string;
  action: TriggerModerationAction;
  chatId: string;
  chatTitle: string;
  message: string;
  createdAt: string;
};
type BotModerationState = {
  removedTriggerIds: string[];
  blockedUserIds: string[];
  announcements: ModerationAnnouncement[];
};
type ModerationSnapshot = Record<string, BotModerationState>;

const fleetStorageKey = "bot-control-center.fleet.v1";
const moderationStorageKey = "bot-control-center.moderation.v1";
const initiallyInactiveBotIds = new Set(["reshare"]);
const emptyModerationState: BotModerationState = {
  removedTriggerIds: [],
  blockedUserIds: [],
  announcements: [],
};

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

const providerByTransport: Record<BotDefinition["transport"], string> = {
  "gcp-iap": "Google Compute Engine",
  ssh: "Servidor SSH",
  railway: "Railway",
};

function isStoredBot(value: unknown): value is BotDefinition {
  if (!value || typeof value !== "object") return false;
  const bot = value as Partial<BotDefinition>;
  return Boolean(
    bot.id &&
    bot.name &&
    bot.initials &&
    bot.transport &&
    Array.isArray(bot.capabilities) &&
    Array.isArray(bot.metrics) &&
    Array.isArray(bot.logs) &&
    Array.isArray(bot.triggers) &&
    Array.isArray(bot.queryRows),
  );
}

function isModerationSnapshot(value: unknown): value is ModerationSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const state = entry as Partial<BotModerationState>;
    return (
      Array.isArray(state.removedTriggerIds) &&
      state.removedTriggerIds.every((id) => typeof id === "string") &&
      Array.isArray(state.blockedUserIds) &&
      state.blockedUserIds.every((id) => typeof id === "string") &&
      Array.isArray(state.announcements)
    );
  });
}

function createLocalBot(name: string, transport: BotDefinition["transport"]): BotDefinition {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("es") ?? "")
    .join("") || "BT";
  const idBase = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "bot";

  return {
    id: `${idBase}-${Date.now().toString(36)}`,
    name,
    initials,
    description: "Bot agregado localmente; pendiente de configurar su adaptador remoto.",
    status: "offline",
    statusLabel: "Sin configurar",
    provider: providerByTransport[transport],
    transport,
    environment: "local · pendiente",
    host: "sin configurar",
    version: "—",
    commit: "local",
    updatedAt: "sin conexión",
    capabilities: ["status", "logs"],
    metrics: [
      { label: "Uptime", value: "—", detail: "sin conexión" },
      { label: "CPU", value: "—", detail: "sin conexión" },
      { label: "Memoria", value: "—", detail: "sin conexión" },
      { label: "Disco", value: "—", detail: "sin conexión" },
      { label: "Base SQLite", value: "—", detail: "no declarada" },
      { label: "Eventos hoy", value: "—", detail: "sin datos" },
    ],
    logs: [
      {
        id: `${idBase}-registry`,
        timestamp: "ahora",
        level: "info",
        source: "registro",
        message: "Bot agregado a la flota local; falta configurar el transporte remoto.",
      },
    ],
    triggers: [],
    queryRows: [],
  };
}

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
  const defaultActiveIds = useMemo(
    () => bots.filter((item) => !initiallyInactiveBotIds.has(item.id)).map((item) => item.id),
    [bots],
  );
  const [customBots, setCustomBots] = useState<BotDefinition[]>([]);
  const [activeIds, setActiveIds] = useState<string[]>(defaultActiveIds);
  const [selectedId, setSelectedId] = useState(defaultActiveIds[0] ?? bots[0]?.id ?? "");
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
  const [selectedTriggerId, setSelectedTriggerId] = useState("");
  const [moderationByBot, setModerationByBot] = useState<ModerationSnapshot>({});
  const [moderationMessage, setModerationMessage] = useState("");
  const [fleetOpen, setFleetOpen] = useState(false);
  const [fleetMessage, setFleetMessage] = useState("");
  const [newBotName, setNewBotName] = useState("");
  const [newBotTransport, setNewBotTransport] = useState<BotDefinition["transport"]>("ssh");

  const allBots = useMemo(() => [...bots, ...customBots], [bots, customBots]);
  const activeBots = useMemo(
    () => allBots.filter((item) => activeIds.includes(item.id)),
    [activeIds, allBots],
  );
  const availableBots = useMemo(
    () => allBots.filter((item) => !activeIds.includes(item.id)),
    [activeIds, allBots],
  );
  const bot = activeBots.find((item) => item.id === selectedId) ?? activeBots[0] ?? null;
  const botLogs = useMemo(() => bot?.logs ?? [], [bot]);
  const botModeration = bot ? moderationByBot[bot.id] ?? emptyModerationState : emptyModerationState;
  const visibleTriggers = useMemo(
    () => bot?.triggers.filter((trigger) => !botModeration.removedTriggerIds.includes(trigger.id)) ?? [],
    [bot, botModeration.removedTriggerIds],
  );
  const selectedTrigger =
    visibleTriggers.find((trigger) => trigger.id === selectedTriggerId) ?? visibleTriggers[0] ?? null;
  const selectedUserBlocked = selectedTrigger
    ? botModeration.blockedUserIds.includes(selectedTrigger.createdBy.id)
    : false;

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(fleetStorageKey);
        if (!raw) return;
        const stored = JSON.parse(raw) as Partial<FleetSnapshot>;
        const storedCustomBots = Array.isArray(stored.customBots)
          ? stored.customBots.filter(isStoredBot)
          : [];
        const knownIds = new Set([...bots, ...storedCustomBots].map((item) => item.id));
        const storedActiveIds = Array.isArray(stored.activeIds)
          ? stored.activeIds.filter((id): id is string => typeof id === "string" && knownIds.has(id))
          : [];

        setCustomBots(storedCustomBots);
        if (storedActiveIds.length > 0) setActiveIds(storedActiveIds);
      } catch {
        window.localStorage.removeItem(fleetStorageKey);
      }
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, [bots]);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(moderationStorageKey);
        if (!raw) return;
        const stored = JSON.parse(raw) as unknown;
        if (isModerationSnapshot(stored)) setModerationByBot(stored);
      } catch {
        window.localStorage.removeItem(moderationStorageKey);
      }
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

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
    setSelectedTriggerId("");
    setModerationMessage("");
    setLogFilter("all");
    setLogSearch("");
    setQueryState("idle");
    setQueryMessage("La ejecución usa datos demo; todavía no se conecta a una base real.");
  }

  function persistFleet(nextActiveIds: string[], nextCustomBots = customBots) {
    setActiveIds(nextActiveIds);
    setCustomBots(nextCustomBots);
    window.localStorage.setItem(
      fleetStorageKey,
      JSON.stringify({ activeIds: nextActiveIds, customBots: nextCustomBots } satisfies FleetSnapshot),
    );
  }

  function removeFromFleet(id: string) {
    if (activeIds.length <= 1) {
      setFleetMessage("La flota debe conservar al menos un bot activo.");
      return;
    }

    const removedBot = allBots.find((item) => item.id === id);
    const nextActiveIds = activeIds.filter((item) => item !== id);
    persistFleet(nextActiveIds);
    if (selectedId === id) setSelectedId(nextActiveIds[0] ?? "");
    setFleetMessage(`${removedBot?.name ?? "El bot"} fue quitado de la flota.`);
  }

  function addToFleet(id: string) {
    if (activeIds.includes(id)) return;
    const addedBot = allBots.find((item) => item.id === id);
    persistFleet([...activeIds, id]);
    setFleetMessage(`${addedBot?.name ?? "El bot"} fue agregado a la flota.`);
  }

  function registerBot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newBotName.trim();
    if (!name) {
      setFleetMessage("Escribí un nombre para registrar el bot.");
      return;
    }

    const newBot = createLocalBot(name, newBotTransport);
    const nextCustomBots = [...customBots, newBot];
    persistFleet([...activeIds, newBot.id], nextCustomBots);
    setNewBotName("");
    setFleetMessage(`${newBot.name} fue registrado y agregado a la flota.`);
    selectBot(newBot.id);
    setFleetOpen(false);
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
    if (!bot) return;
    const stateKey = `${bot.id}:${trigger.id}`;
    setTriggerState((current) => ({
      ...current,
      [stateKey]: !(current[stateKey] ?? trigger.enabled),
    }));
  }

  function moderateTrigger(trigger: TriggerDefinition, action: TriggerModerationAction) {
    if (!bot) return;

    const actionLabel = {
      "delete-trigger": "eliminar el trigger",
      "block-user": "bloquear al usuario",
      "delete-and-block": "eliminar el trigger y bloquear al usuario",
    }[action];
    const confirmed = window.confirm(
      `¿Confirmás ${actionLabel}? También se enviará un aviso de moderación a “${trigger.chat.title}”.`,
    );
    if (!confirmed) return;

    const actor = trigger.createdBy.username
      ? `@${trigger.createdBy.username}`
      : trigger.createdBy.displayName;
    const message = {
      "delete-trigger": `⚠️ Aviso de moderación: se eliminó el trigger “${trigger.phrase}”, agregado por ${actor}.`,
      "block-user": `⚠️ Aviso de moderación: ${actor} fue bloqueado por uso abusivo de triggers.`,
      "delete-and-block": `⚠️ Aviso de moderación: se eliminó el trigger “${trigger.phrase}” y ${actor} fue bloqueado por uso abusivo.`,
    }[action];
    const deletesTrigger = action === "delete-trigger" || action === "delete-and-block";
    const blocksUser = action === "block-user" || action === "delete-and-block";
    const announcement: ModerationAnnouncement = {
      id: `${bot.id}-${trigger.id}-${Date.now()}`,
      action,
      chatId: trigger.chat.id,
      chatTitle: trigger.chat.title,
      message,
      createdAt: new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(new Date()),
    };

    setModerationByBot((current) => {
      const previous = current[bot.id] ?? emptyModerationState;
      const nextState: BotModerationState = {
        removedTriggerIds: deletesTrigger
          ? [...new Set([...previous.removedTriggerIds, trigger.id])]
          : previous.removedTriggerIds,
        blockedUserIds: blocksUser
          ? [...new Set([...previous.blockedUserIds, trigger.createdBy.id])]
          : previous.blockedUserIds,
        announcements: [announcement, ...previous.announcements].slice(0, 20),
      };
      const next = { ...current, [bot.id]: nextState };
      window.localStorage.setItem(moderationStorageKey, JSON.stringify(next));
      return next;
    });
    setModerationMessage(
      `Acción aplicada en modo local. Se registró el aviso para ${trigger.chat.title}.`,
    );
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
          <span>{activeBots.length} bots</span>
        </div>

        <button
          className="fleet-manage-button"
          onClick={() => { setFleetMessage(""); setFleetOpen(true); }}
          type="button"
        >
          <span aria-hidden="true">＋</span> Administrar flota
        </button>

        <nav className="bot-list" aria-label="Bots registrados">
          {activeBots.map((item) => (
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
                {item.id === "triggers" && visibleTriggers.length > 0 ? <b>{visibleTriggers.length}</b> : null}
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
                  <p className="guardrail"><span>✓</span> La moderación de triggers exige confirmación y auditoría; las demás acciones destructivas siguen desactivadas.</p>
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
              <section className="trigger-workspace">
                <div className="panel trigger-panel">
                  <div className="panel__header">
                    <div><span className="eyebrow">BIBLIOTECA Y MODERACIÓN</span><h2>Visualizador de triggers</h2></div>
                    <span className="demo-badge">Modo local</span>
                  </div>

                  {moderationMessage ? <p className="moderation-feedback" role="status">{moderationMessage}</p> : null}

                  {selectedTrigger ? (
                    <div className="trigger-browser">
                      <div className="trigger-list" aria-label="Triggers disponibles">
                        <div className="trigger-list__head">
                          <span>{visibleTriggers.length} disponibles</span>
                          <small>Elegí uno para inspeccionarlo</small>
                        </div>
                        {visibleTriggers.map((trigger) => {
                          const blocked = botModeration.blockedUserIds.includes(trigger.createdBy.id);
                          return (
                            <button
                              className={`trigger-list__item ${trigger.id === selectedTrigger.id ? "trigger-list__item--active" : ""}`}
                              key={trigger.id}
                              onClick={() => { setSelectedTriggerId(trigger.id); setModerationMessage(""); }}
                              type="button"
                            >
                              <span className={`trigger-kind trigger-kind--${trigger.media?.kind ?? "text"}`}>
                                {trigger.media?.kind === "video" ? "▶" : trigger.media?.kind === "audio" ? "♫" : "Aa"}
                              </span>
                              <span>
                                <strong>{trigger.name}</strong>
                                <code>{trigger.phrase}</code>
                                <small>{trigger.chat.title} · {trigger.lastHit}</small>
                              </span>
                              {blocked ? <b className="blocked-mini">Bloqueado</b> : null}
                            </button>
                          );
                        })}
                      </div>

                      <article className="trigger-inspector">
                        <header className="trigger-inspector__header">
                          <div>
                            <span className="eyebrow">TRIGGER SELECCIONADO</span>
                            <h3>{selectedTrigger.name}</h3>
                            <code>{selectedTrigger.phrase}</code>
                          </div>
                          <label className="trigger-enabled-control">
                            <span>{(triggerState[`${bot.id}:${selectedTrigger.id}`] ?? selectedTrigger.enabled) ? "Activo" : "Pausado"}</span>
                            <button
                              aria-label={`${(triggerState[`${bot.id}:${selectedTrigger.id}`] ?? selectedTrigger.enabled) ? "Pausar" : "Activar"} ${selectedTrigger.name}`}
                              aria-pressed={triggerState[`${bot.id}:${selectedTrigger.id}`] ?? selectedTrigger.enabled}
                              className={(triggerState[`${bot.id}:${selectedTrigger.id}`] ?? selectedTrigger.enabled) ? "toggle toggle--on" : "toggle"}
                              onClick={() => toggleTrigger(selectedTrigger)}
                              type="button"
                            ><span /></button>
                          </label>
                        </header>

                        <TriggerMediaViewer key={selectedTrigger.id} media={selectedTrigger.media} triggerName={selectedTrigger.name} />

                        <div className="trigger-response">
                          <span className="eyebrow">RESPUESTA</span>
                          <p>{selectedTrigger.response}</p>
                        </div>

                        <dl className="trigger-metadata">
                          <div>
                            <dt>Agregado por</dt>
                            <dd><strong>{selectedTrigger.createdBy.displayName}</strong><span>{selectedTrigger.createdBy.username ? `@${selectedTrigger.createdBy.username}` : selectedTrigger.createdBy.id}</span></dd>
                          </div>
                          <div>
                            <dt>Chat</dt>
                            <dd><strong>{selectedTrigger.chat.title}</strong><span>ID {selectedTrigger.chat.id}</span></dd>
                          </div>
                          <div>
                            <dt>Creado</dt>
                            <dd><strong>{selectedTrigger.createdAt}</strong><span>por Telegram</span></dd>
                          </div>
                          <div>
                            <dt>Uso</dt>
                            <dd><strong>{selectedTrigger.hits} ejecuciones</strong><span>Última vez {selectedTrigger.lastHit}</span></dd>
                          </div>
                        </dl>

                        {selectedUserBlocked ? (
                          <p className="blocked-notice"><span>!</span> Este usuario ya está bloqueado en la simulación local.</p>
                        ) : null}

                        <div className="moderation-actions">
                          <div>
                            <span className="eyebrow">ACCIONES DE MODERACIÓN</span>
                            <p>Cada acción pide confirmación y publica una advertencia en el chat de origen.</p>
                          </div>
                          <div className="moderation-actions__buttons">
                            <button className="danger-button danger-button--outline" onClick={() => moderateTrigger(selectedTrigger, "delete-trigger")} type="button">Eliminar trigger</button>
                            <button className="warning-button" disabled={selectedUserBlocked} onClick={() => moderateTrigger(selectedTrigger, "block-user")} type="button">{selectedUserBlocked ? "Usuario bloqueado" : "Bloquear usuario"}</button>
                            <button className="danger-button" disabled={selectedUserBlocked} onClick={() => moderateTrigger(selectedTrigger, "delete-and-block")} type="button">Eliminar y bloquear</button>
                          </div>
                        </div>
                      </article>
                    </div>
                  ) : (
                    <div className="trigger-empty">
                      <span aria-hidden="true">✓</span>
                      <h3>No quedan triggers visibles</h3>
                      <p>Las eliminaciones de esta demostración están guardadas en este equipo.</p>
                    </div>
                  )}

                  <p className="guardrail"><span>i</span> Las acciones se simulan y persisten localmente. Al conectar un bot real, el adaptador deberá ejecutar la moderación y confirmar el envío del aviso al chat.</p>
                </div>

                {botModeration.announcements.length ? (
                  <section className="panel moderation-log" aria-live="polite">
                    <div className="panel__header">
                      <div><span className="eyebrow">AUDITORÍA LOCAL</span><h2>Avisos enviados a chats</h2></div>
                      <span className="demo-badge">{botModeration.announcements.length} acciones</span>
                    </div>
                    <div className="moderation-log__list">
                      {botModeration.announcements.map((announcement) => (
                        <article key={announcement.id}>
                          <span className="moderation-log__icon">!</span>
                          <div><strong>{announcement.chatTitle}</strong><p>{announcement.message}</p><small>Chat {announcement.chatId} · {announcement.createdAt}</small></div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
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

      {fleetOpen ? (
        <div className="fleet-overlay" role="presentation">
          <section aria-labelledby="fleet-manager-title" aria-modal="true" className="fleet-manager" role="dialog">
            <header className="fleet-manager__header">
              <div>
                <span className="eyebrow">REGISTRO LOCAL</span>
                <h2 id="fleet-manager-title">Administrar flota</h2>
                <p>Elegí qué bots aparecen en el panel. No se guardan credenciales.</p>
              </div>
              <button aria-label="Cerrar administrador de flota" onClick={() => setFleetOpen(false)} type="button">×</button>
            </header>

            {fleetMessage ? <p className="fleet-message" role="status">{fleetMessage}</p> : null}

            <div className="fleet-manager__grid">
              <div className="fleet-manager__section">
                <h3>En la flota <span>{activeBots.length}</span></h3>
                <div className="fleet-manager__list">
                  {activeBots.map((item) => (
                    <article className="fleet-manager__item" key={item.id}>
                      <span className="bot-avatar">{item.initials}</span>
                      <div><strong>{item.name}</strong><small>{transportCopy[item.transport]}</small></div>
                      <button disabled={activeBots.length <= 1} onClick={() => removeFromFleet(item.id)} type="button">Quitar</button>
                    </article>
                  ))}
                </div>
              </div>

              <div className="fleet-manager__section">
                <h3>Disponibles <span>{availableBots.length}</span></h3>
                <div className="fleet-manager__list">
                  {availableBots.length ? availableBots.map((item) => (
                    <article className="fleet-manager__item" key={item.id}>
                      <span className="bot-avatar">{item.initials}</span>
                      <div><strong>{item.name}</strong><small>{transportCopy[item.transport]}</small></div>
                      <button className="fleet-add-button" onClick={() => addToFleet(item.id)} type="button">Agregar</button>
                    </article>
                  )) : <p className="fleet-manager__empty">No hay bots disponibles fuera de la flota.</p>}
                </div>
              </div>
            </div>

            <form className="fleet-register" onSubmit={registerBot}>
              <div>
                <span className="eyebrow">NUEVO REGISTRO</span>
                <h3>Agregar otro bot</h3>
                <p>Se crea como desconectado hasta configurar su adaptador remoto.</p>
              </div>
              <label>
                <span>Nombre</span>
                <input onChange={(event) => setNewBotName(event.target.value)} placeholder="Ej. Bot de reportes" value={newBotName} />
              </label>
              <label>
                <span>Transporte previsto</span>
                <select onChange={(event) => setNewBotTransport(event.target.value as BotDefinition["transport"])} value={newBotTransport}>
                  <option value="ssh">SSH</option>
                  <option value="gcp-iap">Google Cloud IAP</option>
                  <option value="railway">Railway</option>
                </select>
              </label>
              <button className="fleet-register__submit" type="submit">Registrar y agregar</button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
