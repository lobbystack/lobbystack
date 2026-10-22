import { readFile } from "node:fs/promises";
import path from "node:path";

const locales = ["en", "fr", "es", "sr"] as const;
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
// The marketing site renders its 404 catch-all and IndexNow key file per request.
const marketingDynamicRoutes = new Set(["/site/[locale]/[...missing]", "/site/[locale]/indexnow-key.txt"]);

const nextDir = path.resolve(process.cwd(), "apps/admin/.next");
const manifest = JSON.parse(await readFile(path.join(nextDir, "prerender-manifest.json"), "utf8")) as {
  routes?: Record<string, { compute?: string; srcRoute?: string | null }>;
};
const appRoutes = Object.values(
  JSON.parse(await readFile(path.join(nextDir, "app-path-routes-manifest.json"), "utf8")) as Record<string, string>,
);

const missing = locales.flatMap((locale) => publicRoutes
  .map((route) => `/${locale}/${route}`)
  .filter((route) => manifest.routes?.[route]?.compute !== "static"));

if (missing.length > 0) {
  throw new Error(`Admin public routes must be prerendered:\n${missing.map((route) => `- ${route}`).join("\n")}`);
}

// Every marketing route must come out of the build as static files, in each
// locale it serves, so a page that starts reading request data fails here.
const prerenderedMarketing = Object.entries(manifest.routes ?? {})
  .filter(([route, entry]) => route.startsWith("/site/") && entry.compute === "static");
const prerenderedSources = new Set(prerenderedMarketing.map(([route, entry]) => entry.srcRoute ?? route));
const dynamicMarketing = appRoutes
  .filter((route) => route === "/site" || route.startsWith("/site/"))
  .filter((route) => !marketingDynamicRoutes.has(route) && !prerenderedSources.has(route));
// A build with MARKETING_SITE=false leaves the marketing site out entirely.
const marketingBuilt = process.env.MARKETING_SITE !== "false";
const missingHomes = marketingBuilt
  ? locales.map((locale) => `/site/${locale}`).filter((route) => manifest.routes?.[route]?.compute !== "static")
  : [];

if (!marketingBuilt && prerenderedMarketing.length > 0) {
  throw new Error(`MARKETING_SITE=false, yet the build prerendered ${prerenderedMarketing.length} marketing pages.`);
}
if (marketingBuilt && (dynamicMarketing.length > 0 || missingHomes.length > 0)) {
  throw new Error(`Marketing routes must be prerendered:\n${[...dynamicMarketing, ...missingHomes].map((route) => `- ${route}`).join("\n")}`);
}

console.log(`[prerender] Verified ${locales.length * publicRoutes.length} localized public routes and ${prerenderedMarketing.length} marketing pages.`);
