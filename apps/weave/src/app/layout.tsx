import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { isDurable } from "@/data/store";
import { isAuthConfigured } from "@/lib/auth";
import { loadSettings } from "@/lib/integrations.server";
import { maskSettings, installedModules } from "@/lib/integrations";
import type { IntegrationKey } from "@/lib/integrations";
import { INTEGRATION_META } from "@/lib/integrations";

export const metadata: Metadata = {
  title: "Theridion Weave",
  description: "Test management nad manuálními testy a automatizovanými běhy z Theridion Eyes a Net.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const demoReasons: string[] = [];
  if (!isDurable()) demoReasons.push("bez perzistence (nastav DATABASE_URL)");
  if (!isAuthConfigured()) demoReasons.push("bez auth (nastav WEAVE_ACCESS_PASSWORD + SESSION_SECRET)");

  // Compute installed local modules for dynamic nav tabs.
  let installedModuleItems: Array<{ key: IntegrationKey; label: string }> = [];
  try {
    const settings = await loadSettings();
    const view = maskSettings(settings);
    installedModuleItems = installedModules(view).map((k) => ({
      key: k,
      label: INTEGRATION_META[k].label,
    }));
  } catch {
    // Non-fatal: nav falls back to static items.
  }

  return (
    <html lang="cs">
      <body>
        <div className="flex min-h-screen">
          <Nav installedModules={installedModuleItems} />
          <main className="flex-1 overflow-x-hidden">
            {demoReasons.length > 0 && (
              <div className="border-b border-amber-500/30 bg-amber-500/10 px-8 py-2 text-center text-xs text-amber-300">
                Demo mode — {demoReasons.join(" · ")}
              </div>
            )}
            <div className="px-8 py-8">
              <div className="mx-auto max-w-5xl">{children}</div>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
