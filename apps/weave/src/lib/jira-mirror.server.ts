// ─── Jira Mirror — sync Weave entities to Jira issues ────────────────────────
// server-only. Idempotent: creates on first call, updates if jiraKey exists.

import { loadSettings } from "@/lib/integrations.server";
import { logger } from "@/lib/logger";
import { createIssue, triggerStatusTransition, type JiraIssueFields } from "@/lib/jira.server";
import {
  getTestCase,
  getTestScript,
  getTestRun,
  setTestCaseJiraKey,
  setScriptJiraKey,
  setRunJiraKey,
} from "@/data/store";

export type MirrorEntity = "test" | "script" | "run";

export interface MirrorResult {
  jiraKey: string;
  created: boolean;
}

/** Build Jira storage-format description from a plain string. */
function descriptionDoc(text: string): JiraIssueFields["description"] {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text: text || "(no description)" }] }],
  };
}

async function ensureJiraEnabled() {
  const s = await loadSettings();
  const cfg = s.jira;
  if (!cfg.enabled) throw new Error("Jira integration is disabled");
  if (!cfg.token || !cfg.email || !cfg.projectKey) {
    throw new Error("Jira integration is not fully configured (email/token/projectKey missing)");
  }
  return cfg;
}

/** Mirror a TestCase to Jira. */
async function mirrorTest(id: string): Promise<MirrorResult> {
  const cfg = await ensureJiraEnabled();
  const tc = await getTestCase(id);
  if (!tc) throw new Error(`TestCase ${id} not found`);

  if (tc.jiraKey) {
    logger.info(`[jira-mirror] test ${id} already synced as ${tc.jiraKey}`);
    return { jiraKey: tc.jiraKey, created: false };
  }

  const fields: JiraIssueFields = {
    summary: `[Test] ${tc.title}`,
    description: descriptionDoc(
      `Owner: ${tc.owner}\nPriority: ${tc.priority}\nStatus: ${tc.status}\n\n${tc.description}`,
    ),
    issuetype: { name: "Story" },
    project: { key: cfg.projectKey! },
    labels: ["weave-test", ...tc.tags.map((t) => `tag-${t}`)],
  };

  const issue = await createIssue(fields);
  await setTestCaseJiraKey(id, issue.key);
  logger.info(`[jira-mirror] created ${issue.key} for test ${id}`);
  return { jiraKey: issue.key, created: true };
}

/** Mirror a TestScript to Jira. */
async function mirrorScript(id: string): Promise<MirrorResult> {
  const cfg = await ensureJiraEnabled();
  const scr = await getTestScript(id);
  if (!scr) throw new Error(`TestScript ${id} not found`);

  if (scr.jiraKey) {
    logger.info(`[jira-mirror] script ${id} already synced as ${scr.jiraKey}`);
    return { jiraKey: scr.jiraKey, created: false };
  }

  const fields: JiraIssueFields = {
    summary: `[Script] ${scr.name}`,
    description: descriptionDoc(
      `Product: ${scr.product}\nFramework: ${scr.framework}\nOwner: ${scr.owner}\nStatus: ${scr.status}${scr.specPath ? `\nSpec: ${scr.specPath}` : ""}`,
    ),
    issuetype: { name: "Story" },
    project: { key: cfg.projectKey! },
    labels: ["weave-script", `product-${scr.product}`],
  };

  const issue = await createIssue(fields);
  await setScriptJiraKey(id, issue.key);
  logger.info(`[jira-mirror] created ${issue.key} for script ${id}`);
  return { jiraKey: issue.key, created: true };
}

/** Mirror a TestRun to Jira. */
async function mirrorRun(id: string): Promise<MirrorResult> {
  const cfg = await ensureJiraEnabled();
  const run = await getTestRun(id);
  if (!run) throw new Error(`TestRun ${id} not found`);

  if (run.jiraKey) {
    logger.info(`[jira-mirror] run ${id} already synced as ${run.jiraKey}`);
    return { jiraKey: run.jiraKey, created: false };
  }

  const passCount = run.results.filter((r) => r.status === "pass").length;
  const failCount = run.results.filter((r) => r.status === "fail").length;
  const total = run.results.length;

  const fields: JiraIssueFields = {
    summary: `[Run] ${run.label ?? run.suiteName ?? run.id}`,
    description: descriptionDoc(
      `Source: ${run.source}\nTriggered by: ${run.triggeredBy}\nStarted: ${run.startedAt}\nResults: ${passCount}/${total} pass, ${failCount} fail\nWorkflow: ${run.runStatus}`,
    ),
    issuetype: { name: "Task" },
    project: { key: cfg.projectKey! },
    labels: ["weave-run", `source-${run.source}`],
  };

  const issue = await createIssue(fields);
  await setRunJiraKey(id, issue.key);
  logger.info(`[jira-mirror] created ${issue.key} for run ${id}`);
  return { jiraKey: issue.key, created: true };
}

/** Sync any entity to Jira. Idempotent. */
export async function syncToJira(entity: MirrorEntity, id: string): Promise<MirrorResult> {
  switch (entity) {
    case "test":   return mirrorTest(id);
    case "script": return mirrorScript(id);
    case "run":    return mirrorRun(id);
  }
}

/**
 * After a status transition, if the entity has a jiraKey and jira is enabled,
 * trigger the matching Jira transition (best-effort, non-blocking).
 */
export async function afterStatusTransition(
  entity: MirrorEntity,
  id: string,
  newStatus: string,
): Promise<void> {
  try {
    const s = await loadSettings();
    if (!s.jira.enabled) return;

    let jiraKey: string | undefined;
    if (entity === "test") {
      const tc = await getTestCase(id);
      jiraKey = tc?.jiraKey;
    } else if (entity === "script") {
      const scr = await getTestScript(id);
      jiraKey = scr?.jiraKey;
    } else {
      const run = await getTestRun(id);
      jiraKey = run?.jiraKey;
    }

    if (!jiraKey) return;
    await triggerStatusTransition(jiraKey, newStatus);
  } catch (e) {
    logger.warn(`[jira-mirror] afterStatusTransition non-fatal for ${entity}:${id}`, e);
  }
}

/**
 * Create a Jira Bug linked to a failed run/test.
 * Returns the issue key and URL.
 */
export async function createBugForFailedRun(
  runId: string,
  testId: string,
): Promise<{ jiraKey: string; issueUrl: string }> {
  const cfg = await ensureJiraEnabled();
  const run = await getTestRun(runId);
  if (!run) throw new Error(`TestRun ${runId} not found`);

  const result = run.results.find((r) => r.testId === testId);
  if (!result) throw new Error(`Result for testId ${testId} not found in run ${runId}`);

  const fields: JiraIssueFields = {
    summary: `[Bug] ${result.title} failed in ${run.label ?? run.id}`,
    description: descriptionDoc(
      `Run: ${run.id}\nSource: ${run.source}\nTest: ${testId}\nNotes: ${result.notes ?? "—"}\nEvidence: ${result.evidence ?? "—"}`,
    ),
    issuetype: { name: "Bug" },
    project: { key: cfg.projectKey! },
    labels: ["weave-bug", `source-${run.source}`],
  };

  const issue = await createIssue(fields);
  const issueUrl = `${cfg.baseUrl.replace(/\/$/, "")}/browse/${issue.key}`;
  logger.info(`[jira-mirror] created Bug ${issue.key} for run ${runId} test ${testId}`);
  return { jiraKey: issue.key, issueUrl };
}
