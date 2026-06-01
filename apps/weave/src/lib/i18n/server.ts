// ─── Server-side i18n helpers (RSC only — uses next/headers) ─────────────────

import { cookies } from "next/headers";
import type { Locale } from "./types";
import { LOCALE_COOKIE, DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./types";
import { getDictionary, makeT } from "./index";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const raw = jar.get(LOCALE_COOKIE)?.value;
  if (raw && (SUPPORTED_LOCALES as string[]).includes(raw)) return raw as Locale;
  return DEFAULT_LOCALE;
}

export async function getServerT() {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  return makeT(dict);
}
