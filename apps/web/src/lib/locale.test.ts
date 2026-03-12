import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  getWeekdayLabels,
  normalizeLocale,
  readStoredLocale,
  resolveAuthenticatedLocale,
  resolveLocale,
  resolveStartupLocale,
  writeStoredLocale,
} from "@/lib/locale";

type LocalStorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function createLocalStorageMock(): LocalStorageMock {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("locale helpers", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes locale candidates to supported locales", () => {
    expect(normalizeLocale("fr-CA")).toBe("fr");
    expect(normalizeLocale("EN_us")).toBe("en");
    expect(normalizeLocale("es")).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();
  });

  it("falls back to English when no supported locale is available", () => {
    expect(resolveLocale(undefined, null, "es-MX")).toBe(DEFAULT_LOCALE);
  });

  it("prefers stored locale over browser locale on startup", () => {
    expect(
      resolveStartupLocale({
        storedLocale: "fr",
        browserLocale: "en-US",
      }),
    ).toBe("fr");
  });

  it("prefers authenticated locale over stored and browser locales", () => {
    expect(
      resolveAuthenticatedLocale({
        preferredLocale: "fr",
        storedLocale: "en",
        browserLocale: "en-US",
      }),
    ).toBe("fr");
  });

  it("reads and writes stored locale through localStorage", () => {
    const localStorage = createLocalStorageMock();
    vi.stubGlobal("window", { localStorage });

    expect(readStoredLocale()).toBeNull();

    writeStoredLocale("fr");

    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("fr");
    expect(readStoredLocale()).toBe("fr");
  });

  it("ignores unsupported locale values from localStorage", () => {
    const localStorage = createLocalStorageMock();
    localStorage.setItem(LOCALE_STORAGE_KEY, "es");
    vi.stubGlobal("window", { localStorage });

    expect(readStoredLocale()).toBeNull();
  });

  it("returns localized weekday labels", () => {
    expect(getWeekdayLabels("en")[0]).toMatch(/Sunday/i);
    expect(getWeekdayLabels("fr")[0]?.toLowerCase()).toContain("dim");
  });
});
