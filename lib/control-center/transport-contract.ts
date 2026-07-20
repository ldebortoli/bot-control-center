import type { BotDefinition, Capability } from "./types";

/**
 * Contrato que implementará cada transporte real. El dashboard no conoce claves,
 * rutas de bases ni comandos del bot: recibe respuestas normalizadas de botctl.
 */
export interface BotTransport {
  connect(bot: BotDefinition): Promise<void>;
  health(bot: BotDefinition): Promise<unknown>;
  logs(bot: BotDefinition, limit: number): Promise<unknown>;
  query(bot: BotDefinition, sql: string): Promise<unknown>;
  capabilities(bot: BotDefinition): Promise<Capability[]>;
}

export const transportPlan = {
  "gcp-iap": "gcloud compute ssh --tunnel-through-iap … botctl <comando>",
  ssh: "ssh <alias> botctl <comando>",
  railway: "Railway API/CLI → botctl <comando>",
} as const;
