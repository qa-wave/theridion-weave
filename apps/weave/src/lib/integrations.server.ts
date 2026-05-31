// ─── Weave integrations — server-only persistence ────────────────────────────
// (Imports @/data/store → must only be imported from server components / route
// handlers, never from a "use client" module.)

import { kvGet, kvSet } from "@/data/store";
import {
  defaultSettings,
  type IntegrationConfig,
  type IntegrationKey,
  type WeaveSettings,
} from "@/lib/integrations";

const KEY = "integrations";

export async function loadSettings(): Promise<WeaveSettings> {
  const stored = await kvGet<Partial<WeaveSettings>>(KEY);
  const base = defaultSettings();
  if (!stored) return base;
  for (const k of Object.keys(base) as IntegrationKey[]) {
    base[k] = { ...base[k], ...(stored[k] ?? {}) };
  }
  return base;
}

export async function saveSettings(
  patch: Partial<Record<IntegrationKey, Partial<IntegrationConfig>>>,
): Promise<WeaveSettings> {
  const current = await loadSettings();
  for (const k of Object.keys(patch) as IntegrationKey[]) {
    const p = patch[k];
    if (!p) continue;
    // empty/omitted token means "keep existing" — don't overwrite with blank
    const token = p.token === undefined || p.token === "" ? current[k].token : p.token;
    current[k] = {
      enabled: p.enabled ?? current[k].enabled,
      baseUrl: p.baseUrl ?? current[k].baseUrl,
      token,
      email: p.email ?? current[k].email,
      projectKey: p.projectKey ?? current[k].projectKey,
      spaceKey: p.spaceKey ?? current[k].spaceKey,
      statusTransitionMap: p.statusTransitionMap ?? current[k].statusTransitionMap,
    };
  }
  await kvSet(KEY, current);
  return current;
}

/** Returns enabled integrations with their config — for server-side use (e.g. pulling runs). */
export async function enabledIntegrations(): Promise<Array<{ key: IntegrationKey } & IntegrationConfig>> {
  const s = await loadSettings();
  return (Object.keys(s) as IntegrationKey[])
    .filter((k) => s[k].enabled)
    .map((k) => ({ key: k, ...s[k] }));
}
