import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { isDurable } from "@/data/store";
import { isAuthConfigured } from "@/lib/auth";
import { loadSettings } from "@/lib/integrations.server";
import { maskSettings, installedModules } from "@/lib/integrations";
import type { IntegrationKey } from "@/lib/integrations";
import { INTEGRATION_META } from "@/lib/integrations";
import { I18nProvider } from "@/lib/i18n/context";
import { getLocale, getServerT } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Theridion Weave",
  description: "Test management for manual tests and automated runs from Theridion Eyes and Net.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const t = await getServerT();

  const demoReasons: string[] = [];
  if (!isDurable()) demoReasons.push(t("demo.noDb"));
  if (!isAuthConfigured()) demoReasons.push(t("demo.noAuth"));

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
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale} messages={dict}>
          <div className="flex min-h-screen">
            <Nav installedModules={installedModuleItems} />
            <main className="flex-1 overflow-x-hidden">
              {demoReasons.length > 0 && (
                <div className="border-b border-amber-500/30 bg-amber-500/10 px-8 py-2 text-center text-xs text-amber-300">
                  {t("demo.prefix")} — {demoReasons.join(" · ")}
                </div>
              )}
              <div className="px-8 py-8">
                <div className="mx-auto max-w-5xl">{children}</div>
              </div>
            </main>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
