// ─── i18n core (server + shared) ─────────────────────────────────────────────

export type { Locale, Messages } from "./types";
export { LOCALE_COOKIE, DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./types";
export { cs } from "./messages.cs";
export { en } from "./messages.en";

import type { Locale, Messages } from "./types";
import { cs } from "./messages.cs";
import { en } from "./messages.en";
import { DEFAULT_LOCALE } from "./types";

const dictionaries: Record<Locale, Messages> = { cs, en };

export function getDictionary(locale: Locale): Messages {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

/** Interpolate {key} placeholders: t("foo.bar", { n: 5 }) */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

/** Build a typed t() function from a dictionary. */
export function makeT(dict: Messages) {
  return function t(key: keyof Messages, params?: Record<string, string | number>): string {
    const template = dict[key] ?? key;
    return interpolate(template, params);
  };
}
