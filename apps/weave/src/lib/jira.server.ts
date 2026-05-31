// ─── Jira REST API client (server-only) ───────────────────────────────────────
// Uses Basic auth: base64(email:apiToken). Config from loadSettings().
// NEVER import this from "use client" files.

import { loadSettings } from "@/lib/integrations.server";
import { logger } from "@/lib/logger";

export interface JiraIssueFields {
  summary: string;
  description?: {
    type: "doc";
    version: 1;
    content: Array<{
      type: "paragraph";
      content: Array<{ type: "text"; text: string }>;
    }>;
  };
  issuetype: { name: string };
  project: { key: string };
  labels?: string[];
  priority?: { name: string };
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: { summary: string; status: { name: string } };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

class JiraConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "JiraConfigError";
  }
}

async function getConfig() {
  const s = await loadSettings();
  const cfg = s.jira;
  if (!cfg.enabled) throw new JiraConfigError("Jira integration is disabled");
  if (!cfg.token) throw new JiraConfigError("Jira API token is not configured");
  if (!cfg.email) throw new JiraConfigError("Jira email is not configured");
  if (!cfg.projectKey) throw new JiraConfigError("Jira projectKey is not configured");
  return cfg;
}

function makeAuth(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

async function jiraFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = await getConfig();
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/rest/api/3${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: makeAuth(cfg.email!, cfg.token),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Jira API ${res.status} at ${path}: ${text}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

/** Create a Jira issue. Returns the created issue key + id. */
export async function createIssue(fields: JiraIssueFields): Promise<{ id: string; key: string; self: string }> {
  return jiraFetch<{ id: string; key: string; self: string }>("/issue", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
}

/** Get all transitions for an issue. */
export async function getTransitions(issueKey: string): Promise<JiraTransition[]> {
  const data = await jiraFetch<{ transitions: JiraTransition[] }>(`/issue/${issueKey}/transitions`);
  return data.transitions;
}

/** Transition an issue to the given transition ID. */
export async function transitionIssue(issueKey: string, transitionId: string): Promise<void> {
  await jiraFetch<void>(`/issue/${issueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: transitionId } }),
  });
}

/** Find a transition ID by name (case-insensitive). */
export async function findTransitionId(issueKey: string, transitionName: string): Promise<string | undefined> {
  const transitions = await getTransitions(issueKey);
  const t = transitions.find((tr) => tr.name.toLowerCase() === transitionName.toLowerCase());
  return t?.id;
}

/** Transition by name, best-effort (logs errors, does not throw). */
export async function transitionIssueByName(issueKey: string, transitionName: string): Promise<void> {
  try {
    const id = await findTransitionId(issueKey, transitionName);
    if (!id) {
      logger.warn(`[jira] transition "${transitionName}" not found on ${issueKey}`);
      return;
    }
    await transitionIssue(issueKey, id);
  } catch (e) {
    logger.warn(`[jira] transitionIssueByName failed for ${issueKey} → ${transitionName}`, e);
  }
}

/** Create a link between two issues. */
export async function createIssueLink(
  linkType: string,
  inwardKey: string,
  outwardKey: string,
): Promise<void> {
  await jiraFetch<void>("/issueLink", {
    method: "POST",
    body: JSON.stringify({
      type: { name: linkType },
      inwardIssue: { key: inwardKey },
      outwardIssue: { key: outwardKey },
    }),
  });
}

/** Add a comment to an issue. */
export async function addComment(issueKey: string, text: string): Promise<void> {
  await jiraFetch<void>(`/issue/${issueKey}/comment`, {
    method: "POST",
    body: JSON.stringify({
      body: {
        type: "doc",
        version: 1,
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
    }),
  });
}

/** Parse the status→transition map from settings (JSON string). */
export async function getStatusTransitionMap(): Promise<Record<string, string>> {
  const cfg = await getConfig();
  try {
    return JSON.parse(cfg.statusTransitionMap ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** Best-effort: if jira enabled and entity has jiraKey, trigger the mapped transition. */
export async function triggerStatusTransition(jiraKey: string, weaveStatus: string): Promise<void> {
  try {
    const map = await getStatusTransitionMap();
    const transitionName = map[weaveStatus];
    if (!transitionName) return;
    await transitionIssueByName(jiraKey, transitionName);
    logger.info(`[jira] triggered transition "${transitionName}" on ${jiraKey} (weave status: ${weaveStatus})`);
  } catch (e) {
    logger.warn(`[jira] triggerStatusTransition failed for ${jiraKey} (${weaveStatus})`, e);
  }
}
