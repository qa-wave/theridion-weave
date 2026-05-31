// Minimal structured logger. Never logs secrets/tokens — callers pass only
// safe context. Errors are stringified to avoid leaking object internals.

type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, err?: unknown) {
  const line: Record<string, unknown> = { t: new Date().toISOString(), level, msg };
  if (err !== undefined) line.err = err instanceof Error ? err.message : String(err);
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const logger = {
  info: (msg: string) => emit("info", msg),
  warn: (msg: string) => emit("warn", msg),
  error: (msg: string, err?: unknown) => emit("error", msg, err),
};
