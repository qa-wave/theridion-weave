import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RunSummary, TestRun } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: Date | string, now: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (diffSec < 45) return "teď";
  if (diffMin < 45) return `před ${diffMin} min`;
  if (diffHour < 24) return `před ${diffHour} h`;
  if (diffDay === 1) return "včera";
  if (diffDay < 7) return `před ${diffDay} dny`;
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec ? `${min} min ${remSec} s` : `${min} min`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin ? `${hr} h ${remMin} min` : `${hr} h`;
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals).replace(".", ",")} %`;
}

/** Derive a RunSummary from a full TestRun */
export function summariseRun(run: TestRun): RunSummary {
  const pass = run.results.filter((r) => r.status === "pass").length;
  const fail = run.results.filter((r) => r.status === "fail").length;
  const skip = run.results.filter((r) => r.status === "skip").length;
  const blocked = run.results.filter((r) => r.status === "blocked").length;
  const total = run.results.length;
  const passRate = total === 0 ? 100 : (pass / total) * 100;
  const durationMs = run.results.reduce((a, r) => a + r.durationMs, 0);
  const start = new Date(run.startedAt);
  const end = run.finishedAt ? new Date(run.finishedAt) : new Date();
  const wallMs = end.getTime() - start.getTime();

  return {
    id: run.id,
    source: run.source,
    label: run.label ?? run.suiteName ?? run.id,
    startedAt: run.startedAt,
    pass,
    fail,
    skip,
    blocked,
    total,
    passRate,
    durationMs: Math.max(durationMs, wallMs),
  };
}
