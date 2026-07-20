export type BotStatus = "online" | "degraded" | "offline";
export type LogLevel = "info" | "warning" | "error";
export type Capability = "status" | "logs" | "sql" | "triggers";

export interface BotMetric {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "good" | "warning";
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
}

export interface TriggerDefinition {
  id: string;
  name: string;
  phrase: string;
  response: string;
  enabled: boolean;
  hits: number;
  lastHit: string;
}

export interface BotDefinition {
  id: string;
  name: string;
  initials: string;
  description: string;
  status: BotStatus;
  statusLabel: string;
  provider: string;
  transport: "gcp-iap" | "ssh" | "railway";
  environment: string;
  host: string;
  version: string;
  commit: string;
  updatedAt: string;
  capabilities: Capability[];
  metrics: BotMetric[];
  logs: LogEntry[];
  triggers: TriggerDefinition[];
  queryRows: Record<string, string | number>[];
}
