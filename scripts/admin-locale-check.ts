import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const locales = ["fr", "es", "sr"];
const root = resolve(process.cwd(), "apps/admin/public/locales");
const namespaces = readdirSync(resolve(root, "en")).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -".json".length));

// Plural keys compare by base key, since each language has its own plural categories.
const pluralSuffix = /_(zero|one|two|few|many|other)$/;

function leafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix.replace(pluralSuffix, "")] : [];
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

function load(locale: string, namespace: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, locale, `${namespace}.json`), "utf8")) as Record<string, unknown>;
}

const missing: string[] = [];
for (const namespace of namespaces) {
  const en = new Set(leafKeys(load("en", namespace)));
  for (const locale of locales) {
    const translated = new Set(leafKeys(load(locale, namespace)));
    for (const key of en) if (!translated.has(key)) missing.push(`${locale}/${namespace}.${key}`);
    for (const key of translated) if (!en.has(key)) missing.push(`en/${namespace}.${key} (extra in ${locale})`);
  }
}

if (missing.length) {
  console.error(`Locale parity failed:\n${missing.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Locale parity passed: ${namespaces.length} namespaces have matching keys in English, ${locales.join(", ")}.`);
}
