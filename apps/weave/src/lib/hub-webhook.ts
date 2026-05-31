// ─── Outbound webhook: Weave → Hub on run completion ─────────────────────────
//
// When the Hub integration is enabled (Settings), Weave fires a POST to
// Hub's ingest endpoint after a run is saved. The payload is a RunResult v2
// envelope so Hub can consume it using the same contract as Eyes/Net/Runner.
// Fire-and-forget with a short timeout — never blocks the ingest response.

import { logger } from "@/lib/logger";
import type { TestRun } from "@/lib/types";

export interface HubWebhookPayload {
  schema_version: 2;
  run_id: string;
  product: "weave";
  source: string;
  collection_name?: string;
  environment?: string;
  branch?: string;
  started_at: string;
  finished_at?: string;
  total: number;
  passed: number;
  failed: number;
  requests: Array<{
    name: string;
    status: "pass" | "fail" | "skip" | "blocked";
    duration_ms: number;
    evidence?: string;
    error?: string;
    issue_url?: string;
  }>;
  meta: {
    weave_run_url: string;
    triggered_by: string;
  };
}

/**
 * Build a Hub-compatible webhook payload from a persisted TestRun.
 * This is a RunResult v2-like envelope — Hub can consume it as-is.
 */
export function buildHubPayload(run: TestRun, weaveBaseUrl: string): HubWebhookPayload {
  const passed = run.results.filter((r) => r.status === "pass").length;
  const failed = run.results.filter((r) => r.status === "fail").length;
  return {
    schema_version: 2,
    run_id: run.id,
    product: "weave",
    source: run.source,
    collection_name: run.suiteName,
    branch: run.label,
    started_at: run.startedAt,
    finished_at: run.finishedAt ?? undefined,
    total: run.results.length,
    passed,
    failed,
    requests: run.results.map((r) => ({
      name: r.title,
      status: r.status,
      duration_ms: r.durationMs,
      evidence: r.evidence,
      error: r.notes,
      issue_url: r.issueUrl,
    })),
    meta: {
      weave_run_url: `${weaveBaseUrl}/runs/${run.id}`,
      triggered_by: run.triggeredBy,
    },
  };
}

/**
 * Fire the outbound webhook to Hub — fire-and-forget (never awaited by callers).
 * Retries once after 2 s on network error. Errors are logged, never rethrown.
 */
export async function fireHubWebhook(
  hubBaseUrl: string,
  token: string,
  payload: HubWebhookPayload,
): Promise<void> {
  const url = `${hubBaseUrl.replace(/\/$/, "")}/api/runs/ingest`;
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const attempt = async () => {
    const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Hub responded ${res.status}: ${text.slice(0, 200)}`);
    }
  };

  try {
    await attempt();
    logger.info(`Hub webhook delivered: run=${payload.run_id}`);
  } catch (e1) {
    logger.warn(`Hub webhook attempt 1 failed, retrying in 2s: ${e1 instanceof Error ? e1.message : String(e1)}`);
    await new Promise((r) => setTimeout(r, 2000));
    try {
      await attempt();
      logger.info(`Hub webhook delivered on retry: run=${payload.run_id}`);
    } catch (e2) {
      logger.error("Hub webhook failed after retry", e2);
    }
  }
}
