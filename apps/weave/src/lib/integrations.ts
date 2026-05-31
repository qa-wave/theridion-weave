// ─── Weave ↔ ecosystem integrations (client-safe types + metadata) ────────────
//
// No server imports here so this can be used from client components. Server-only
// persistence lives in integrations.server.ts.

export type IntegrationKey = "eyes" | "net" | "runner" | "hub" | "jira" | "confluence";

export interface IntegrationConfig {
  enabled: boolean;
  baseUrl: string;
  /** Stored server-side; never returned to the client in full. */
  token: string;
  /** User e-mail used for Basic auth (jira/confluence) */
  email?: string;
  /** Jira project key (e.g. "CEPS") */
  projectKey?: string;
  /** Confluence space key (e.g. "CEPS") */
  spaceKey?: string;
  /** JSON map of Weave status → Jira transition name, e.g. {"active":"Start Progress"} */
  statusTransitionMap?: string;
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
  jira: {
    label: "Jira",
    hint: "Atlassian Jira — mirror test cases, scripts and runs as Jira issues, trigger transitions on status change.",
    defaultUrl: "https://tomasmertin.atlassian.net",
  },
  confluence: {
    label: "Confluence",
    hint: "Atlassian Confluence — publish test plans and run reports to Confluence pages.",
    defaultUrl: "https://tomasmertin.atlassian.net/wiki",
  },
};

export function defaultSettings(): WeaveSettings {
  return {
    eyes: { enabled: false, baseUrl: INTEGRATION_META.eyes.defaultUrl, token: "" },
    net: { enabled: false, baseUrl: INTEGRATION_META.net.defaultUrl, token: "" },
    runner: { enabled: false, baseUrl: INTEGRATION_META.runner.defaultUrl, token: "" },
    hub: { enabled: false, baseUrl: INTEGRATION_META.hub.defaultUrl, token: "" },
    jira: {
      enabled: false,
      baseUrl: INTEGRATION_META.jira.defaultUrl,
      token: "",
      email: "",
      projectKey: "CEPS",
      statusTransitionMap: "{}",
    },
    confluence: {
      enabled: false,
      baseUrl: INTEGRATION_META.confluence.defaultUrl,
      token: "",
      email: "",
      spaceKey: "CEPS",
    },
  };
}

/** Client-safe view: never expose tokens, only whether one is set. */
export interface IntegrationView {
  enabled: boolean;
  baseUrl: string;
  tokenSet: boolean;
  email?: string;
  projectKey?: string;
  spaceKey?: string;
  statusTransitionMap?: string;
}
export type WeaveSettingsView = Record<IntegrationKey, IntegrationView>;

export function maskSettings(s: WeaveSettings): WeaveSettingsView {
  const out = {} as WeaveSettingsView;
  for (const k of Object.keys(s) as IntegrationKey[]) {
    out[k] = {
      enabled: s[k].enabled,
      baseUrl: s[k].baseUrl,
      tokenSet: s[k].token.length > 0,
      email: s[k].email,
      projectKey: s[k].projectKey,
      spaceKey: s[k].spaceKey,
      statusTransitionMap: s[k].statusTransitionMap,
    };
  }
  return out;
}
