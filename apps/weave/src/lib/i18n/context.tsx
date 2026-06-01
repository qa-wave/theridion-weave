"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale, Messages } from "./types";
import { makeT } from "./index";

interface I18nContextValue {
  locale: Locale;
  t: ReturnType<typeof makeT>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}

export function I18nProvider({ locale, messages, children }: I18nProviderProps) {
  const t = makeT(messages);
  return (
    <I18nContext.Provider value={{ locale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Convenience hook — returns just t(). */
export function useT(): ReturnType<typeof makeT> {
  return useI18n().t;
}
