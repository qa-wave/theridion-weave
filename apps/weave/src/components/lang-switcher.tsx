"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { LOCALE_COOKIE } from "@/lib/i18n/types";
import type { Locale } from "@/lib/i18n/types";

export function LangSwitcher() {
  const router = useRouter();
  const { locale, t } = useI18n();

  function switchTo(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
    router.refresh();
  }

  return (
    <div
      className="flex items-center gap-0.5 text-xs text-[var(--muted)]"
      aria-label={t("nav.langSwitcher.aria")}
      role="group"
    >
      <button
        type="button"
        onClick={() => switchTo("cs")}
        className={locale === "cs" ? "font-semibold text-[var(--foreground)]" : "hover:text-[var(--foreground)]"}
        aria-pressed={locale === "cs"}
        aria-label="Česky"
      >
        CS
      </button>
      <span className="select-none px-0.5">|</span>
      <button
        type="button"
        onClick={() => switchTo("en")}
        className={locale === "en" ? "font-semibold text-[var(--foreground)]" : "hover:text-[var(--foreground)]"}
        aria-pressed={locale === "en"}
        aria-label="English"
      >
        EN
      </button>
    </div>
  );
}
