import { PageHeader } from "@/components/ui";
import { maskSettings } from "@/lib/integrations";
import { loadSettings } from "@/lib/integrations.server";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = maskSettings(await loadSettings());
  return (
    <>
      <PageHeader
        title="Nastavení · Integrace"
        description="Zapni napojení na ostatní Theridion nástroje. Po zapnutí Weave přijímá/páruje jejich výsledky."
      />
      <SettingsForm initial={settings} />
    </>
  );
}
