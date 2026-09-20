import { readFile } from "node:fs/promises";
import path from "node:path";

const locales = ["en", "fr"] as const;
const publicRoutes = [
  "accept-invite",
  "claim-demo",
  "confirm-email-change",
  "demo",
  "forgot-password",
  "login",
  "reset-password",
  "signup",
] as const;

const manifestPath = path.resolve(process.cwd(), "apps/admin/.next/prerender-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
  routes?: Record<string, { compute?: string }>;
};

const missing = locales.flatMap((locale) => publicRoutes
  .map((route) => `/${locale}/${route}`)
  .filter((route) => manifest.routes?.[route]?.compute !== "static"));

if (missing.length > 0) {
  throw new Error(`Admin public routes must be prerendered:\n${missing.map((route) => `- ${route}`).join("\n")}`);
}

console.log(`[prerender] Verified ${locales.length * publicRoutes.length} localized public routes.`);
