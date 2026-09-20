import { execFileSync } from "node:child_process";
import { referenceUiRoutes } from "./admin-ui-reference-routes";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { relative, resolve, sep } from "node:path";
import { routeShape, withoutLocaleSegment } from "./admin-ui-parity-routes";

type Entry = { id: string; status: "required" | "replaced" | "excluded"; routes?: string[]; implementation?: string[]; acceptanceTests?: string[] };
type VisualRoute = {
  path: string;
  harness?: string;
  fixtureState: "public" | "onboarding" | "operator";
  state: string;
  comparison: "frozen-main" | "port-baseline" | "excluded";
  referencePath?: string;
  snapshotId?: string;
  dynamicKey?: "callId" | "contactId" | "demoToken" | "resetToken";
  reason?: string;
};

export async function currentPageRoutes(root: string): Promise<string[]> {
  const appRoot = resolve(root, "apps/admin/app");
  const files = await readdir(appRoot, { recursive: true });
  return files
    .filter((file) => file.endsWith(`${sep}page.tsx`) || file === "page.tsx")
    .map((file) => relative(appRoot, resolve(appRoot, file)).split(sep))
    .map((parts) => parts.slice(0, -1).filter((part) => !/^\(.+\)$/.test(part)))
    .map((parts) => parts.length === 0 ? "/" : `/${parts.join("/")}`)
    .sort();
}

export async function validateAdminUiParity(root = process.cwd()) {
  const manifest = JSON.parse(await readFile(resolve(root, "docs/validation/admin-ui-parity.json"), "utf8")) as { referenceCommit: string; visualHarness: string; visualCertifier: string; visualMatrix: { locales: string[]; themes: string[]; viewports: string[]; maxDiffPixelRatio: number; colorThreshold: number }; visualExemptions: string[]; localizedPortRoutes: string[]; visualRoutes: VisualRoute[]; capabilities: Entry[] };
  const errors: string[] = [];
  if (manifest.referenceCommit !== "98df89901f1dca22b8c96ccf9509a8cd549f2eb9") errors.push("Visual parity reference commit changed unexpectedly.");
  const exactMembers = (actual: string[], expected: string[]) => actual.length === expected.length && expected.every(value => actual.includes(value));
  if (!exactMembers(manifest.visualMatrix.locales, ["en", "fr"]) || !exactMembers(manifest.visualMatrix.themes, ["light", "dark"]) || !exactMembers(manifest.visualMatrix.viewports, ["1440x1000", "390x844"]) || !Number.isFinite(manifest.visualMatrix.maxDiffPixelRatio) || manifest.visualMatrix.maxDiffPixelRatio < 0 || manifest.visualMatrix.maxDiffPixelRatio > 0.001 || manifest.visualMatrix.colorThreshold !== 0) errors.push("Visual parity matrix is incomplete or too permissive.");
  if (!exactMembers(manifest.visualExemptions, ["/messages", "/settings/widget", "/embed/[key]", "/settings/plan/ai-sms-compliance"])) errors.push("Visual parity exemptions do not match the approved scope.");
  try { await readFile(resolve(root, manifest.visualHarness), "utf8"); } catch { errors.push(`Missing visual parity harness ${manifest.visualHarness}`); }
  try { await readFile(resolve(root, manifest.visualCertifier), "utf8"); } catch { errors.push(`Missing visual parity certifier ${manifest.visualCertifier}`); }

  const routeKeys = new Set<string>();
  for (const route of manifest.visualRoutes ?? []) {
    const key = `${route.path}\0${route.state}`;
    if (!route.path.startsWith("/")) errors.push(`Visual route must start with /: ${route.path}`);
    if (!route.state.trim()) errors.push(`Visual route is missing a rendered state: ${route.path}`);
    if (routeKeys.has(key)) errors.push(`Duplicate visual route state: ${route.path} (${route.state})`);
    routeKeys.add(key);
    if (route.harness) { try { await readFile(resolve(root, route.harness), "utf8"); } catch { errors.push(`Missing state harness ${route.harness}`); } }
    if (route.comparison === "excluded" && !manifest.visualExemptions.includes(route.path)) errors.push(`Unapproved visual exclusion: ${route.path}`);
    if (route.comparison === "excluded" && !route.reason) errors.push(`Excluded visual route is missing a reason: ${route.path}`);
  }
  if (!manifest.visualRoutes?.some((route) => route.comparison === "frozen-main")) errors.push("No frozen-main visual routes are declared.");
  if (!manifest.visualRoutes?.some((route) => route.comparison === "port-baseline")) errors.push("No port-owned visual baselines are declared.");
  const manifestShapes = new Set(manifest.visualRoutes.map((route) => routeShape(route.path)));
  const localizedPortShapes = new Set(manifest.localizedPortRoutes.map((route) => routeShape(route)));
  for (const localizedRoute of manifest.localizedPortRoutes) {
    if (!localizedRoute.startsWith("/[locale]/")) errors.push(`Localized port route must start with /[locale]/: ${localizedRoute}`);
    if (!manifestShapes.has(routeShape(withoutLocaleSegment(localizedRoute)))) errors.push(`Localized port route is missing from the route-and-state manifest: ${localizedRoute}`);
  }
  const frozenSource = execFileSync("git", ["show", `${manifest.referenceCommit}:apps/web/src/App.tsx`], { cwd: root, encoding: "utf8" });
  const frozenRoutes = referenceUiRoutes(frozenSource);
  const referenceShapes = new Set(manifest.visualRoutes.map(route => routeShape(route.referencePath ?? route.path)));
  for (const referenceRoute of frozenRoutes) {
    if (!referenceShapes.has(routeShape(referenceRoute))) errors.push(`Frozen main route is missing from the route-and-state manifest: ${referenceRoute}`);
  }
  const pageRoutes = await currentPageRoutes(root);
  const currentLocalizedRoutes = pageRoutes.filter((route) => route.startsWith("/[locale]/"));
  if (!exactMembers(manifest.localizedPortRoutes, currentLocalizedRoutes)) errors.push("Localized port route inventory does not match the App Router pages.");
  for (const pageRoute of pageRoutes) {
    if (!manifestShapes.has(routeShape(pageRoute)) && !localizedPortShapes.has(routeShape(pageRoute))) errors.push(`Current page route is missing from the route-and-state manifest: ${pageRoute}`);
  }
  for (const exemptRoute of manifest.visualExemptions) {
    const entry = manifest.visualRoutes.find((route) => routeShape(route.path) === routeShape(exemptRoute));
    if (!entry || entry.comparison !== "excluded") errors.push(`Visual exemption is not declared as an excluded route: ${exemptRoute}`);
  }

  for (const capability of manifest.capabilities) {
    if (capability.status === "excluded") continue;
    for (const relativePath of [...(capability.implementation ?? []), ...(capability.acceptanceTests ?? [])]) {
      try {
        await readFile(resolve(root, relativePath), "utf8");
      } catch {
        errors.push(`${capability.id}: missing evidence file ${relativePath}`);
      }
    }
    if (capability.status !== "required") continue;
    for (const route of capability.routes ?? []) {
      if (!manifestShapes.has(routeShape(route))) errors.push(`${capability.id}: route is missing from the route-and-state manifest: ${route}`);
    }
    const sources = await Promise.all((capability.implementation ?? []).map(async (relativePath) => await readFile(resolve(root, relativePath), "utf8")));
    const onlyStaticSurfaces = sources.length > 0 && sources.every((source) => source.includes("PageSurface") && !/(fetch\(|useQuery\(|useMutation\(|redirect\(|export async function (GET|POST|PATCH|PUT|DELETE)|get[A-Z]|create[A-Z]|update[A-Z]|delete[A-Z])/.test(source));
    if (onlyStaticSurfaces) errors.push(`${capability.id}: required capability is represented only by a static PageSurface.`);
  }

  if (errors.length) throw new Error(errors.join("\n"));
  return { frozenRoutes: frozenRoutes.length, states: manifest.visualRoutes.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateAdminUiParity().then(result => console.log(`Admin UI parity manifest passed: ${result.frozenRoutes} frozen routes and ${result.states} declared states. Rendered parity requires screenshot certification.`)).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
