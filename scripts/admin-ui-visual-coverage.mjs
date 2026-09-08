import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestBytes = await readFile(resolve(root, "docs/validation/admin-ui-parity.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const inventory = JSON.parse(await readFile(resolve(root, process.argv[2] ?? "docs/validation/parity-visual-evidence.json"), "utf8"));
const requireAdmin = createRequire(resolve(root, "apps/admin/package.json"));
const requirePlaywright = createRequire(requireAdmin.resolve("playwright/package.json"));
const corePackage = requirePlaywright.resolve("playwright-core/package.json");
const { getComparator } = requireAdmin(resolve(dirname(corePackage), "lib/server/utils/comparators.js"));
const compare = getComparator("image/png");

function specs(suites) {
  return suites.flatMap(suite => [...(suite.specs ?? []), ...specs(suite.suites ?? [])]);
}
function passed(result) {
  if (result.errors?.length || result.stats?.unexpected || result.stats?.flaky) throw new Error("Cohort contains failures or flaky cases.");
  return new Set(specs(result.suites ?? []).filter(spec => spec.tests?.length && spec.tests.every(test => test.status === "expected" && test.expectedStatus === "passed" && test.results?.at(-1)?.status === "passed")).map(spec => spec.title));
}
function caseNames(route, locale, theme, viewport) {
  if (route.harness?.endsWith("loading-parity.e2e.ts")) {
    const name = `${route.path === "/" ? "home" : route.path.slice(1).replaceAll("/", "-")}-loading-${locale}-${theme}-${viewport}`;
    return { title: `${route.path} loading ${locale} ${theme} ${viewport}`, name };
  }
  if (route.harness?.endsWith("invitation-parity.e2e.ts")) return { title: `invitation ${route.state} ${locale} ${theme} ${viewport}`, name: `invitation-${route.state}-${locale}-${theme}-${viewport}` };
  if (route.harness?.endsWith("new-operator-visual.e2e.ts")) return { title: `${route.path.slice(1)} ${route.state} ${locale} ${theme} ${viewport}`, name: `${route.path.slice(1)}-${route.state}-${locale}-${theme}-${viewport}` };
  const snapshotId = route.snapshotId ?? route.path;
  const slug = snapshotId === "/" ? "home" : snapshotId.replace(/^\//, "").replace(/[/?=&\[\]]+/g, "-");
  return { title: `${route.fixtureState} ${snapshotId} ${viewport} ${locale} ${theme}`, name: `${slug}-${viewport}-${locale}-${theme}` };
}
const evidence = [], rejectedCohorts = [];
for (const entry of inventory.cohorts) {
  try {
    const report = JSON.parse(await readFile(resolve(root, entry.results), "utf8"));
    const titles = passed(report);
    if (entry.comparison === "frozen-main") {
      const scope = JSON.parse(await readFile(resolve(root, entry.scope), "utf8"));
      if (scope.referenceCommit !== manifest.referenceCommit) throw new Error("Reference commit does not match frozen main.");
      const referenceTitles = passed(JSON.parse(await readFile(resolve(root, entry.referenceResults), "utf8")));
      for (const title of titles) if (!referenceTitles.has(title)) throw new Error(`Missing paired reference test: ${title}`);
    }
    const renderedRoot = resolve(root, entry.rendered);
    const files = await readdir(renderedRoot, { recursive: true });
    const images = new Map();
    for (const file of files.filter(file => file.endsWith("-rendered.png"))) {
      const name = basename(file);
      if (images.has(name)) throw new Error(`Ambiguous rendered image: ${name}`);
      images.set(name, resolve(renderedRoot, file));
    }
    evidence.push({ ...entry, titles, images });
  } catch (error) { rejectedCohorts.push({ id: entry.id, reason: error.message }); }
}
const covered = [], missing = [];
for (const route of manifest.visualRoutes.filter(route => route.comparison !== "excluded")) {
  for (const locale of manifest.visualMatrix.locales) for (const theme of manifest.visualMatrix.themes) for (const viewport of route.viewports ?? ["desktop", "mobile"]) {
    const { title, name } = caseNames(route, locale, theme, viewport);
    const failures = []; let match;
    for (const entry of evidence.filter(entry => entry.comparison === route.comparison && entry.titles.has(title))) {
      try {
        const actualPath = entry.images.get(`${name}-rendered.png`);
        if (!actualPath) throw new Error("Missing saved rendered screenshot.");
        const expectedPath = resolve(root, entry.snapshots, `${name}.png`);
        const [actual, expected] = await Promise.all([readFile(actualPath), readFile(expectedPath)]);
        const difference = compare(actual, expected, { threshold: 0, maxDiffPixelRatio: 0.001 });
        if (difference) throw new Error(difference.errorMessage);
        // The passing Playwright case also asserts the visible accessibility tree.
        await readFile(resolve(root, entry.snapshots, `${name}-aria.yml`));
        match = { cohort: entry.id, expected: expectedPath, actual: actualPath, expectedSha256: sha256(expected), actualSha256: sha256(actual) }; break;
      } catch (error) { failures.push({ cohort: entry.id, reason: error.message }); }
    }
    const item = { path: route.path, state: route.state, locale, theme, viewport, title };
    if (match) covered.push({ ...item, ...match }); else missing.push({ ...item, failures });
  }
}
const output = resolve(root, inventory.output ?? ".tmp/admin-ui-parity/visual-coverage.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), manifestSha256: sha256(manifestBytes), referenceCommit: manifest.referenceCommit, comparatorVersion: JSON.parse(await readFile(corePackage, "utf8")).version, pixelComparison: { threshold: 0, maxDiffPixelRatio: 0.001 }, coveredCases: covered.length, requiredCases: covered.length + missing.length, missing, rejectedCohorts, covered, visualGatePassed: missing.length === 0 && rejectedCohorts.length === 0, releaseCertified: false, limitation: "Rendered route/state coverage does not replace functional, database or isolated live-provider certification." }, null, 2));
console.log(`Visual coverage: ${covered.length}/${covered.length + missing.length} required route/state variants. ${rejectedCohorts.length} rejected cohorts. Report: ${output}`);
if (missing.length || rejectedCohorts.length) process.exitCode = 1;
