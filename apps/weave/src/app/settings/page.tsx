import { headers } from "next/headers";
import { PageHeader } from "@/components/ui";
import { maskSettings } from "@/lib/integrations";
import type { IntegrationKey } from "@/lib/integrations";
import { loadSettings } from "@/lib/integrations.server";
import { getLastSeen } from "@/data/store";
import { SettingsForm } from "./settings-form";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const t = await getServerT();
  const [settings, eyesLastSeen, netLastSeen, runnerLastSeen, hdrs] = await Promise.all([
    loadSettings(),
    getLastSeen("eyes"),
    getLastSeen("net"),
    getLastSeen("runner"),
    headers(),
  ]);
  const lastSeen: Record<IntegrationKey, string | null> = {
    eyes: eyesLastSeen,
    net: netLastSeen,
    runner: runnerLastSeen,
    hub: null,
    jira: null,
    confluence: null,
  };

  // Derive origin for the ingest endpoint hint shown in the 'app' wizard step.
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  return (
    <>
      <PageHeader
        title={t("settings.title")}
        description={t("settings.description")}
      />
      <SettingsForm initial={maskSettings(settings)} lastSeen={lastSeen} origin={origin} />
    </>
  );
}
