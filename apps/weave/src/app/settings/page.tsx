import { PageHeader } from "@/components/ui";
import { maskSettings } from "@/lib/integrations";
import type { IntegrationKey } from "@/lib/integrations";
import { loadSettings } from "@/lib/integrations.server";
import { getLastSeen } from "@/data/store";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, eyesLastSeen, netLastSeen, runnerLastSeen] = await Promise.all([
    loadSettings(),
    getLastSeen("eyes"),
    getLastSeen("net"),
    getLastSeen("runner"),
  ]);
  const lastSeen: Record<IntegrationKey, string | null> = {
    eyes: eyesLastSeen,
    net: netLastSeen,
    runner: runnerLastSeen,
    hub: null,
    jira: null,
    confluence: null,
  };
  return (
    <>
      <PageHeader
        title="Nastavení · Integrace"
        description="Zapni napojení na ostatní Theridion nástroje. Po zapnutí Weave přijímá/páruje jejich výsledky."
      />
      <SettingsForm initial={maskSettings(settings)} lastSeen={lastSeen} />
    </>
  );
}
