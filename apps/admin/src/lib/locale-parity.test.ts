import { describe, expect, it } from "vitest";

import { createI18nInstance } from "@/i18n";
import { localeResources } from "./i18n-resources";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, formatDateTime, formatRelativeTime, getWeekdayLabels, localeTag } from "./locale";

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const CYRILLIC = /[Ѐ-ӿ]/;

function leafEntries(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [[prefix, String(value)]];
  return Object.entries(value).flatMap(([key, child]) => leafEntries(child, prefix ? `${prefix}.${key}` : key));
}

/** Plural keys collapse to their base key so each language can use its own categories. */
function baseKey(key: string): string {
  return key.replace(PLURAL_SUFFIX, "");
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*[^}]+?\s*\}\}|<\/?\d+\/?>|<\/?[a-z][a-z0-9]*\/?>/gi)].map((match) => match[0]).sort();
}

const english = localeResources[DEFAULT_LOCALE];

describe.each(SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE))("%s dashboard translations", (locale) => {
  it.each(Object.keys(english))("has every English key in the %s namespace", (namespace) => {
    const translated = localeResources[locale][namespace];
    expect(translated, `${locale}/${namespace}.json`).toBeDefined();
    const expected = new Set(leafEntries(english[namespace]).map(([key]) => baseKey(key)));
    const actual = new Set(leafEntries(translated).map(([key]) => baseKey(key)));
    expect([...expected].filter((key) => !actual.has(key)), "missing keys").toEqual([]);
    expect([...actual].filter((key) => !expected.has(key)), "extra keys").toEqual([]);
  });

  it.each(Object.keys(english))("keeps placeholders and tags in the %s namespace", (namespace) => {
    const translated = new Map(leafEntries(localeResources[locale][namespace]));
    for (const [key, value] of leafEntries(english[namespace])) {
      const target = translated.get(key) ?? translated.get(`${baseKey(key)}_other`);
      expect(target, `${locale}/${namespace}:${key}`).toBeDefined();
      expect(placeholders(target ?? ""), `${locale}/${namespace}:${key}`).toEqual(placeholders(value));
    }
  });

  it("writes a form for every plural category the language uses", () => {
    const categories = new Intl.PluralRules(localeTag(locale)).resolvedOptions().pluralCategories;
    for (const [namespace, bundle] of Object.entries(localeResources[locale])) {
      const keys = new Set(leafEntries(bundle).map(([key]) => key));
      const pluralBases = new Set([...keys].filter((key) => PLURAL_SUFFIX.test(key)).map(baseKey));
      for (const base of pluralBases) {
        for (const category of categories) {
          expect(keys.has(`${base}_${category}`), `${locale}/${namespace}:${base}_${category}`).toBe(true);
        }
      }
    }
  });
});

describe("Serbian", () => {
  it("is written in Latin script only", () => {
    for (const [namespace, bundle] of Object.entries(localeResources.sr)) {
      for (const [key, value] of leafEntries(bundle)) {
        expect(value, `sr/${namespace}:${key}`).not.toMatch(CYRILLIC);
      }
    }
  });

  it("formats dates, weekdays and relative times in Latin script", () => {
    const sample = Date.UTC(2026, 8, 30, 14, 5);
    const date = formatDateTime(sample, "sr", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }, "24h");
    expect(date).toContain("septembar");
    expect(date).not.toMatch(CYRILLIC);
    expect(getWeekdayLabels("sr")).toContain("sreda");
    expect(formatRelativeTime(sample - 2 * 24 * 60 * 60 * 1000, "sr", sample)).toBe("pre 2 dana");
    expect(localeTag("sr")).toBe("sr-Latn");
  });
});

describe("i18next plural resolution", () => {
  it("picks the Spanish one, many and other forms", () => {
    const i18n = createI18nInstance({ locale: "es", resources: { demos: localeResources.es.demos! } });
    expect(i18n.t("demos:operator.count", { count: 1 })).toBe("1 demo");
    expect(i18n.t("demos:operator.count", { count: 3 })).toBe("3 demos");
    expect(i18n.t("demos:operator.count", { count: 1_000_000 })).toBe("1000000 demos");
  });

  it("picks the Serbian one, few and other forms", () => {
    const i18n = createI18nInstance({ locale: "sr", resources: { common: localeResources.sr.common! } });
    const one = i18n.t("common:websiteImport.doneHint", { count: 1 });
    const few = i18n.t("common:websiteImport.doneHint", { count: 3 });
    const other = i18n.t("common:websiteImport.doneHint", { count: 5 });
    const resources = localeResources.sr.common as { websiteImport: Record<string, string> };
    expect(one).toBe(resources.websiteImport.doneHint_one!.replace("{{count}}", "1"));
    expect(few).toBe(resources.websiteImport.doneHint_few!.replace("{{count}}", "3"));
    expect(other).toBe(resources.websiteImport.doneHint_other!.replace("{{count}}", "5"));
    expect(i18n.t("common:websiteImport.doneHint", { count: 21 })).toBe(resources.websiteImport.doneHint_one!.replace("{{count}}", "21"));
  });
});
