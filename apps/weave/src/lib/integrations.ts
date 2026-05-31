// ─── Weave ↔ ecosystem integrations (client-safe types + metadata) ────────────
//
// No server imports here so this can be used from client components. Server-only
// persistence lives in integrations.server.ts.

export type IntegrationKey = "eyes" | "net" | "runner" | "hub";

export interface IntegrationConfig {
  enabled: boolean;
  baseUrl: string;
  /** Stored server-side; never returned to the client in full. */
  token: string;
}

export type WeaveSettings = Record<IntegrationKey, IntegrationConfig>;

export const INTEGRATION_META: Record<IntegrationKey, { label: string; hint: string; defaultUrl: string }> = {
  eyes: {
    label: "Theridion Eyes",
    hint: "Frontend/visual automatizované běhy — Weave přijímá výsledky a páruje je s test cases.",
    defaultUrl: "https://theridion-eyes.qawave.ai",
  },
  net: {
    label: "Theridion Net",
    hint: "API / load / security běhy — Weave přijímá výsledky z Net.",
    defaultUrl: "https://theridion-net.qawave.ai",
  },
  runner: {
    label: "Theridion Runner",
    hint: "CI publisher — Runner posílá výsledky na /api/runs/ingest. Token = WEAVE_INGEST_TOKEN.",
    defaultUrl: "https://theridion-runner.qawave.ai",
  },
  hub: {
    label: "Theridion Hub",
    hint: "SDLC QA přehled — Weave posílá webhook po dokončení běhu (outbound). Token = WEAVE_HUB_TOKEN.",
    defaultUrl: "https://theridion-hub.qawave.ai",
  },
};

export function defaultSettings(): WeaveSettings {
  return {
    eyes: { enabled: false, baseUrl: INTEGRATION_META.eyes.defaultUrl, token: "" },
    net: { enabled: false, baseUrl: INTEGRATION_META.net.defaultUrl, token: "" },
    runner: { enabled: false, baseUrl: INTEGRATION_META.runner.defaultUrl, token: "" },
    hub: { enabled: false, baseUrl: INTEGRATION_META.hub.defaultUrl, token: "" },
  };
}

/** Client-safe view: never expose tokens, only whether one is set. */
export interface IntegrationView {
  enabled: boolean;
  baseUrl: string;
  tokenSet: boolean;
}
export type WeaveSettingsView = Record<IntegrationKey, IntegrationView>;

export function maskSettings(s: WeaveSettings): WeaveSettingsView {
  const out = {} as WeaveSettingsView;
  for (const k of Object.keys(s) as IntegrationKey[]) {
    out[k] = { enabled: s[k].enabled, baseUrl: s[k].baseUrl, tokenSet: s[k].token.length > 0 };
  }
  return out;
}
