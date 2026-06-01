import { describe, expect, it } from "@jest/globals";
import { cs } from "@/lib/i18n/messages.cs";
import { en } from "@/lib/i18n/messages.en";
import { getDictionary, makeT, interpolate } from "@/lib/i18n";

// ── Key-set parity ────────────────────────────────────────────────────────────

describe("i18n — dictionary key parity", () => {
  it("cs and en have identical key sets", () => {
    const csKeys = Object.keys(cs).sort();
    const enKeys = Object.keys(en).sort();
    expect(csKeys).toEqual(enKeys);
  });

  it("cs has no empty values", () => {
    const empty = Object.entries(cs).filter(([, v]) => !v).map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it("en has no empty values", () => {
    const empty = Object.entries(en).filter(([, v]) => !v).map(([k]) => k);
    expect(empty).toEqual([]);
  });
});

// ── getDictionary ─────────────────────────────────────────────────────────────

describe("getDictionary", () => {
  it("returns cs dictionary for 'cs' locale", () => {
    const dict = getDictionary("cs");
    expect(dict["nav.overview"]).toBe("Přehled");
  });

  it("returns en dictionary for 'en' locale", () => {
    const dict = getDictionary("en");
    expect(dict["nav.overview"]).toBe("Overview");
  });
});

// ── makeT ─────────────────────────────────────────────────────────────────────

describe("makeT", () => {
  it("translates a key in Czech", () => {
    const t = makeT(cs);
    expect(t("nav.overview")).toBe("Přehled");
  });

  it("translates a key in English", () => {
    const t = makeT(en);
    expect(t("nav.overview")).toBe("Overview");
  });

  it("interpolates {n} placeholder", () => {
    const t = makeT(cs);
    const result = t("settings.lastSeen.minutesAgo", { n: 5 });
    expect(result).toBe("před 5 min");
  });

  it("interpolates {n} placeholder in English", () => {
    const t = makeT(en);
    const result = t("settings.lastSeen.minutesAgo", { n: 3 });
    expect(result).toBe("3 min ago");
  });

  it("interpolates {label} in wizard description", () => {
    const t = makeT(en);
    const result = t("wizard.enterApp.description", { label: "Eyes" });
    expect(result).toContain("Eyes");
  });

  it("falls back to key for unknown key", () => {
    const t = makeT(cs);
    // @ts-expect-error testing fallback for unknown key
    expect(t("unknown.key.xyz")).toBe("unknown.key.xyz");
  });
});

// ── interpolate ───────────────────────────────────────────────────────────────

describe("interpolate", () => {
  it("replaces single placeholder", () => {
    expect(interpolate("Hello {name}!", { name: "World" })).toBe("Hello World!");
  });

  it("replaces multiple placeholders", () => {
    expect(interpolate("{a} and {b}", { a: "foo", b: "bar" })).toBe("foo and bar");
  });

  it("returns original string if no params", () => {
    expect(interpolate("no placeholders")).toBe("no placeholders");
  });

  it("leaves unmatched placeholders as-is", () => {
    expect(interpolate("{missing}", {})).toBe("{missing}");
  });
});

// ── All message keys are valid keyof Messages ─────────────────────────────────

describe("i18n — type safety", () => {
  it("all cs values are strings", () => {
    const nonStrings = Object.entries(cs).filter(([, v]) => typeof v !== "string").map(([k]) => k);
    expect(nonStrings).toEqual([]);
  });

  it("all en values are strings", () => {
    const nonStrings = Object.entries(en).filter(([, v]) => typeof v !== "string").map(([k]) => k);
    expect(nonStrings).toEqual([]);
  });
});
