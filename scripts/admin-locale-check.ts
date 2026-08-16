import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const namespaces = ["common", "auth", "nav", "dashboard", "onboarding", "settings", "knowledge", "inbox", "calls", "messages", "contacts", "agent", "affiliate", "demos", "admin"];
const root = resolve(process.cwd(), "apps/web/public/locales");

function leafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

function load(locale: string, namespace: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, locale, `${namespace}.json`), "utf8")) as Record<string, unknown>;
}

const missing: string[] = [];
for (const namespace of namespaces) {
  const en = new Set(leafKeys(load("en", namespace)));
  const fr = new Set(leafKeys(load("fr", namespace)));
  for (const key of en) if (!fr.has(key)) missing.push(`fr/${namespace}.${key}`);
  for (const key of fr) if (!en.has(key)) missing.push(`en/${namespace}.${key}`);
}

if (missing.length) {
  console.error(`Locale parity failed:\n${missing.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Locale parity passed: ${namespaces.length} namespaces have matching English and French keys.`);
}
