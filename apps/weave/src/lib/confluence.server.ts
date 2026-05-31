// ─── Confluence REST API client (server-only) ─────────────────────────────────
// Uses Basic auth: base64(email:apiToken). Config from loadSettings().
// NEVER import this from "use client" files.

import { loadSettings } from "@/lib/integrations.server";

class ConfluenceConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ConfluenceConfigError";
  }
}

async function getConfig() {
  const s = await loadSettings();
  const cfg = s.confluence;
  if (!cfg.enabled) throw new ConfluenceConfigError("Confluence integration is disabled");
  if (!cfg.token) throw new ConfluenceConfigError("Confluence API token is not configured");
  if (!cfg.email) throw new ConfluenceConfigError("Confluence email is not configured");
  if (!cfg.spaceKey) throw new ConfluenceConfigError("Confluence spaceKey is not configured");
  return cfg;
}

function makeAuth(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

async function confluenceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = await getConfig();
  const base = cfg.baseUrl.replace(/\/$/, "");
  const url = `${base}/rest/api${path}`;
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
    throw new Error(`Confluence API ${res.status} at ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface ConfluencePage {
  id: string;
  title: string;
  _links: { webui: string };
  version: { number: number };
}

interface SearchResult {
  results: ConfluencePage[];
  size: number;
}

/** Find an existing page in the space by title. Returns null if not found. */
export async function findPageByTitle(title: string): Promise<ConfluencePage | null> {
  const cfg = await getConfig();
  const data = await confluenceFetch<SearchResult>(
    `/content?type=page&spaceKey=${encodeURIComponent(cfg.spaceKey!)}&title=${encodeURIComponent(title)}&expand=version`,
  );
  return data.results[0] ?? null;
}

/**
 * Create a new page in the configured space.
 * storageBody: Confluence storage format HTML.
 */
export async function createPage(title: string, storageBody: string): Promise<ConfluencePage> {
  const cfg = await getConfig();
  return confluenceFetch<ConfluencePage>("/content", {
    method: "POST",
    body: JSON.stringify({
      type: "page",
      title,
      space: { key: cfg.spaceKey },
      body: {
        storage: {
          value: storageBody,
          representation: "storage",
        },
      },
    }),
  });
}

/**
 * Update an existing page. Bumps the version by 1.
 */
export async function updatePage(pageId: string, title: string, storageBody: string, currentVersion: number): Promise<ConfluencePage> {
  return confluenceFetch<ConfluencePage>(`/content/${pageId}`, {
    method: "PUT",
    body: JSON.stringify({
      type: "page",
      title,
      version: { number: currentVersion + 1 },
      body: {
        storage: {
          value: storageBody,
          representation: "storage",
        },
      },
    }),
  });
}

/**
 * Upsert a page — create if new, update if title already exists in space.
 * Returns the page id and its web URL.
 */
export async function upsertPage(title: string, storageBody: string): Promise<{ pageId: string; pageUrl: string }> {
  const cfg = await getConfig();
  const existing = await findPageByTitle(title);
  let page: ConfluencePage;
  if (existing) {
    page = await updatePage(existing.id, title, storageBody, existing.version.number);
  } else {
    page = await createPage(title, storageBody);
  }
  const base = cfg.baseUrl.replace(/\/$/, "");
  const pageUrl = `${base}${page._links.webui}`;
  return { pageId: page.id, pageUrl };
}
