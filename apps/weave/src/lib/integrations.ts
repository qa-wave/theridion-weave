// ─── Weave ↔ ecosystem integrations (client-safe types + metadata) ────────────
//
// No server imports here so this can be used from client components. Server-only
// persistence lives in integrations.server.ts.

export type IntegrationKey = "eyes" | "net" | "runner" | "hub" | "jira" | "confluence";

/** Keys that represent locally-installed desktop modules (as opposed to cloud services). */
export const LOCAL_MODULE_KEYS: ReadonlyArray<IntegrationKey> = ["eyes", "net", "runner"] as const;

export function isLocalModule(key: IntegrationKey): boolean {
  return (LOCAL_MODULE_KEYS as ReadonlyArray<string>).includes(key);
}

/**
 * How Weave communicates with a local module:
 * - 'app'     — desktop app; no HTTP. App pushes results to Weave /api/runs/ingest.
 * - 'service' — self-hosted HTTP service; Weave pulls via baseUrl.
 * - 'source'  — source-code checkout on this machine; Weave scans installPath for specs.
 */
export type ConnectionType = "app" | "service" | "source";

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
  /** Whether the local module is installed on this machine (local modules only). */
  installed?: boolean;
  /**
   * For 'source' type: filesystem path to the source-code checkout.
   * For 'app' type: not used (push-based; no local path needed).
   */
  installPath?: string;
  /** How this integration connects to Weave (local modules only). */
  connectionType?: ConnectionType;
  /**
   * For 'app' type only (optional): path to the app's data directory for
   * offline spec scanning. If omitted the app is treated as push-only.
   */
  dataDir?: string;
}

export type WeaveSettings = Record<IntegrationKey, IntegrationConfig>;

export interface IntegrationMeta {
  label: string;
  hint: string;
  defaultUrl: string;
  /** True for Eyes/Net/Runner — desktop modules that run on the user's machine. */
  localModule: boolean;
  /** GitHub releases URL for the module download (local modules only). */
  downloadUrl?: string;
  /** Short installation hint shown in the download panel (local modules only). */
  installHint?: string;
  /**
   * Suggested connection type shown first in the wizard for this module.
   * eyes/net default to 'app' (desktop app, push-based).
   * runner defaults to 'source' (CI publisher, source checkout).
   */
  defaultConnectionType?: ConnectionType;
}

export const INTEGRATION_META: Record<IntegrationKey, IntegrationMeta> = {
  eyes: {
    label: "Theridion Eyes",
    hint: "Frontend/visual automatizované běhy — Weave přijímá výsledky a páruje je s test cases.",
    defaultUrl: "https://theridion-eyes.qawave.ai",
    localModule: true,
    downloadUrl: "https://github.com/qa-wave/theridion-eyes/releases",
    installHint: "Stáhni a rozbal archiv, spusť installer.",
    defaultConnectionType: "app",
  },
  net: {
    label: "Theridion Net",
    hint: "API / load / security běhy — Weave přijímá výsledky z Net.",
    defaultUrl: "https://theridion-net.qawave.ai",
    localModule: true,
    downloadUrl: "https://github.com/qa-wave/theridion-net/releases",
    installHint: "Stáhni a rozbal archiv, spusť installer.",
    defaultConnectionType: "app",
  },
  runner: {
    label: "Theridion Runner",
    hint: "CI publisher — Runner posílá výsledky na /api/runs/ingest. Token = WEAVE_INGEST_TOKEN.",
    defaultUrl: "https://theridion-runner.qawave.ai",
    localModule: true,
    downloadUrl: "https://github.com/qa-wave/theridion-runner/releases",
    installHint: "pip install theridion-runner  (vyžaduje Python 3.10+). Poté zadej cestu ke složce repa.",
    defaultConnectionType: "source",
  },
  hub: {
    label: "Theridion Hub",
    hint: "SDLC QA přehled — Weave posílá webhook po dokončení běhu (outbound). Token = WEAVE_HUB_TOKEN.",
    defaultUrl: "https://theridion-hub.qawave.ai",
    localModule: false,
  },
  jira: {
    label: "Jira",
    hint: "Atlassian Jira — mirror test cases, scripts and runs as Jira issues, trigger transitions on status change.",
    defaultUrl: "https://tomasmertin.atlassian.net",
    localModule: false,
  },
  confluence: {
    label: "Confluence",
    hint: "Atlassian Confluence — publish test plans and run reports to Confluence pages.",
    defaultUrl: "https://tomasmertin.atlassian.net/wiki",
    localModule: false,
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
  /** Whether the local module is marked installed (local modules only). */
  installed?: boolean;
  /** Filesystem path of the source-code checkout ('source' type only). */
  installPath?: string;
  /** How this integration connects to Weave ('app' | 'service' | 'source'). */
  connectionType?: ConnectionType;
  /** Optional data-directory path for 'app' type offline spec scanning. */
  dataDir?: string;
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
      installed: s[k].installed,
      installPath: s[k].installPath,
      connectionType: s[k].connectionType,
      dataDir: s[k].dataDir,
    };
  }
  return out;
}

/**
 * Return the list of local-module keys that are currently "connected" to Weave.
 * Connected semantics differ by connection type:
 *   - 'app'     — installed=true AND lastSeen is available (first push received).
 *                 But we count it as connected (nav tab visible) when installed=true
 *                 regardless of lastSeen — the page itself shows "Waiting for first push".
 *   - 'service' — enabled=true AND baseUrl is set.
 *   - 'source'  — installed=true AND installPath is set (verified source checkout).
 */
export function installedModules(s: WeaveSettingsView): IntegrationKey[] {
  return (LOCAL_MODULE_KEYS as ReadonlyArray<IntegrationKey>).filter((k) => {
    const v = s[k];
    const ct = v.connectionType;
    if (ct === "app") {
      return v.installed === true;
    }
    if (ct === "service") {
      return v.enabled === true && !!v.baseUrl;
    }
    if (ct === "source") {
      return v.installed === true && !!v.installPath;
    }
    // Legacy fallback (no connectionType set yet): treat installed=true as connected.
    return v.installed === true;
  });
}
