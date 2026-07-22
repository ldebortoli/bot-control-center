"use client";

import { useEffect, useMemo, useState } from "react";
import type { BotDefinition } from "@/lib/control-center/types";
import { CredentialsPanel } from "./credentials-panel";
import { DeployPanel } from "./deploy-panel";
import { RemoteTriggersPanel } from "./remote-triggers-panel";
import { RuntimeStatusPanel } from "./runtime-status-panel";

type View = "overview" | "logs" | "triggers" | "sql" | "credentials" | "deploy";
type FleetSnapshot = { activeIds: string[]; customBots: BotDefinition[] };

const fleetStorageKey = "bot-control-center.fleet.v1";
const initiallyInactiveBotIds = new Set(["reshare"]);

const views: { id: View; label: string; glyph: string }[] = [
  { id: "overview", label: "Resumen", glyph: "⌁" },
  { id: "logs", label: "Logs", glyph: "≡" },
  { id: "triggers", label: "Triggers", glyph: "↯" },
  { id: "sql", label: "SQL", glyph: "⌘" },
  { id: "credentials", label: "Credenciales", glyph: "⚿" },
  { id: "deploy", label: "Deploy", glyph: "↑" },
];

const statusCopy = {
  online: "En línea",
  degraded: "Ver estado",
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
  const transport = bot.transport;
  return Boolean(
    bot.id &&
    bot.name &&
    bot.initials &&
    (transport === "gcp-iap" || transport === "ssh" || transport === "railway"),
  );
}

function withoutInventedData(bot: BotDefinition): BotDefinition {
  return {
    id: bot.id,
    name: bot.name,
    initials: bot.initials,
    description: "Bot registrado localmente; pendiente de configurar su adaptador remoto.",
    status: "offline",
    statusLabel: "Sin conexión",
    provider: providerByTransport[bot.transport],
    transport: bot.transport,
    environment: "sin conexión real",
    host: "sin configurar",
    version: "—",
    commit: "—",
    updatedAt: "sin conexión",
    capabilities: [],
  };
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
    description: "Bot registrado localmente; pendiente de configurar su adaptador remoto.",
    status: "offline",
    statusLabel: "Sin conexión",
    provider: providerByTransport[transport],
    transport,
    environment: "sin conexión real",
    host: "sin configurar",
    version: "—",
    commit: "—",
    updatedAt: "sin conexión",
    capabilities: [],
  };
}

function StatusDot({ status }: { status: BotDefinition["status"] }) {
  return <span className={`status-dot status-dot--${status}`} aria-hidden="true" />;
}

function EmptyCapability({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state" role="status">
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
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshLabel, setRefreshLabel] = useState("al abrir la vista");
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

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(fleetStorageKey);
        if (!raw) return;
        const stored = JSON.parse(raw) as Partial<FleetSnapshot>;
        const storedCustomBots = Array.isArray(stored.customBots)
          ? stored.customBots.filter(isStoredBot).map(withoutInventedData)
          : [];
        const knownIds = new Set([...bots, ...storedCustomBots].map((item) => item.id));
        const storedActiveIds = Array.isArray(stored.activeIds)
          ? stored.activeIds.filter((id): id is string => typeof id === "string" && knownIds.has(id))
          : [];

        setCustomBots(storedCustomBots);
        if (storedActiveIds.length > 0) setActiveIds(storedActiveIds);
        window.localStorage.setItem(
          fleetStorageKey,
          JSON.stringify({ activeIds: storedActiveIds.length ? storedActiveIds : defaultActiveIds, customBots: storedCustomBots }),
        );
      } catch {
        window.localStorage.removeItem(fleetStorageKey);
      }
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, [bots, defaultActiveIds]);

  function selectBot(id: string) {
    setSelectedId(id);
    setView("overview");
    setRefreshToken((current) => current + 1);
    setRefreshLabel("ahora");
  }

  function refreshCurrentView() {
    setRefreshToken((current) => current + 1);
    setRefreshLabel("ahora");
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
    setFleetMessage(`${newBot.name} fue registrado y agregado a la flota sin datos inventados.`);
    selectBot(newBot.id);
    setFleetOpen(false);
  }

  if (!bot) return <main className="fatal-state">No hay bots registrados.</main>;

  const remotePanelKey = `${bot.id}-${refreshToken}`;

  return (
    <div className="control-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__signal" aria-hidden="true"><i /><i /><i /></span>
          <div><strong>Bot Control</strong><span>Centro de operaciones</span></div>
        </div>

        <div className="local-mode">
          <span>●</span>
          <div><strong>Modo local</strong><small>Agente en localhost</small></div>
        </div>

        <div className="sidebar__heading"><span>FLOTA</span><span>{activeBots.length} bots</span></div>
        <button className="fleet-manage-button" onClick={() => { setFleetMessage(""); setFleetOpen(true); }} type="button">
          <span aria-hidden="true">＋</span> Administrar flota
        </button>

        <nav className="bot-list" aria-label="Bots registrados">
          {activeBots.map((item) => (
            <button className={`bot-item ${item.id === bot.id ? "bot-item--active" : ""}`} key={item.id} onClick={() => selectBot(item.id)} type="button">
              <span className="bot-avatar">{item.initials}</span>
              <span className="bot-item__copy"><strong>{item.name}</strong><small><StatusDot status={item.status} />{statusCopy[item.status]}</small></span>
              <span className="bot-item__chevron">›</span>
            </button>
          ))}
        </nav>

        <div className="sidebar__footer">
          <span className="sidebar__footer-icon">⌁</span>
          <div><strong>Datos reales</strong><small>Sin fixtures operativos</small></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs"><span>Flota</span><b>/</b><strong>{bot.name}</strong></div>
          <div className="topbar__actions">
            <span className="last-update">Actualizado {refreshLabel}</span>
            <button className="refresh-button" type="button" onClick={refreshCurrentView}><span aria-hidden="true">↻</span> Actualizar</button>
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
              <div className="identity-row"><span>{bot.provider}</span><i>•</i><span>{transportCopy[bot.transport]}</span><i>•</i><span>{bot.environment}</span></div>
            </div>
            <div className="version-card"><small>VERSIÓN ACTIVA</small><strong>{bot.version}</strong><span>commit {bot.commit}</span></div>
          </section>

          <nav className="view-tabs" aria-label="Vistas del bot">
            {views.map((item) => (
              <button key={item.id} type="button" className={view === item.id ? "view-tab view-tab--active" : "view-tab"} onClick={() => setView(item.id)}>
                <span aria-hidden="true">{item.glyph}</span>{item.label}
              </button>
            ))}
          </nav>

          {view === "overview" || view === "logs" ? <RuntimeStatusPanel bot={bot} key={remotePanelKey} /> : null}

          {view === "triggers" ? (
            bot.capabilities.includes("triggers")
              ? <RemoteTriggersPanel bot={bot} key={remotePanelKey} />
              : <EmptyCapability title="No hay triggers disponibles" detail="Este bot no tiene un adaptador real de triggers configurado. No se muestran datos de ejemplo." />
          ) : null}

          {view === "sql" ? (
            <EmptyCapability title="SQL real no está disponible" detail="No hay un contrato remoto de consultas configurado para este bot. No se muestran resultados de ejemplo." />
          ) : null}

          {view === "credentials" ? (
            bot.capabilities.includes("credentials")
              ? <CredentialsPanel bot={bot} key={bot.id} />
              : <EmptyCapability title="Credenciales no disponibles" detail="Este bot no tiene administración remota de credenciales configurada." />
          ) : null}

          {view === "deploy" ? (
            bot.capabilities.includes("deploy")
              ? <DeployPanel bot={bot} key={bot.id} />
              : <EmptyCapability title="Deploy no disponible" detail="Este bot no tiene un flujo de despliegue remoto configurado." />
          ) : null}
        </div>
      </main>

      {fleetOpen ? (
        <div className="fleet-overlay" role="presentation">
          <section aria-labelledby="fleet-manager-title" aria-modal="true" className="fleet-manager" role="dialog">
            <header className="fleet-manager__header">
              <div><span className="eyebrow">REGISTRO LOCAL</span><h2 id="fleet-manager-title">Administrar flota</h2><p>Elegí qué bots aparecen en el panel. No se guardan credenciales ni datos operativos inventados.</p></div>
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
              <div><span className="eyebrow">NUEVO REGISTRO</span><h3>Agregar otro bot</h3><p>Se crea desconectado y sin datos hasta configurar un adaptador remoto real.</p></div>
              <label><span>Nombre</span><input onChange={(event) => setNewBotName(event.target.value)} placeholder="Ej. Bot de reportes" value={newBotName} /></label>
              <label>
                <span>Transporte previsto</span>
                <select onChange={(event) => setNewBotTransport(event.target.value as BotDefinition["transport"])} value={newBotTransport}>
                  <option value="ssh">SSH</option><option value="gcp-iap">Google Cloud IAP</option><option value="railway">Railway</option>
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
