import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const admin = resolve(root, "apps/admin");
for (const name of ["PARITY_REFERENCE_BASE_URL", "PARITY_PORT_BASE_URL"]) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const artifactRoot = resolve(process.env.PARITY_ARTIFACT_DIR ?? resolve(root, ".tmp/admin-ui-parity", runId));
const snapshotDir = resolve(artifactRoot, "reference");
await mkdir(snapshotDir, { recursive: true });
const protocolHash = createHash("sha256")
  .update(await readFile(resolve(admin, "e2e/visual-parity.e2e.ts")))
  .update(await readFile(resolve(root, "docs/validation/admin-ui-parity.json")))
  .digest("hex");
const referenceRecordPath = resolve(artifactRoot, "reference-record.json");
const manifest = JSON.parse(await readFile(resolve(root, "docs/validation/admin-ui-parity.json"), "utf8"));
if (manifest.visualMatrix.colorThreshold !== 0 || manifest.visualMatrix.maxDiffPixelRatio > 0.001) throw new Error("Visual certification requires zero color tolerance and a pixel difference ratio at most 0.001.");
const dynamicVariables = { callId: "CALL_ID", contactId: "CONTACT_ID", demoToken: "DEMO_TOKEN", resetToken: "RESET_TOKEN" };
const missingFixtures = manifest.visualRoutes
  .filter((route) => route.comparison === "frozen-main" && route.dynamicKey)
  .flatMap((route) => ["REFERENCE", "PORT"]
    .filter((side) => !process.env[`PARITY_${side}_${dynamicVariables[route.dynamicKey]}`])
    .map((side) => ({ side: side.toLowerCase(), path: route.path, variable: `PARITY_${side}_${dynamicVariables[route.dynamicKey]}` })));
for (const route of manifest.visualRoutes) {
  if (route.requiredFixture && process.env[route.requiredFixture] !== "1") missingFixtures.push({ side: "both", path: route.snapshotId ?? route.path, variable: route.requiredFixture });
}
await writeFile(resolve(artifactRoot, "scope.json"), JSON.stringify({
  referenceCommit: manifest.referenceCommit ?? null,
  protocolHash,
  grep: process.env.PARITY_GREP ?? null,
  missingFixtures,
  separateStateSuites: [...new Set(manifest.visualRoutes.map(route => route.harness).filter(Boolean))],
  releaseCertified: false,
  limitation: "This harness captures listed route states. Dialog, validation, mutation and live-provider certification require separate evidence.",
}, null, 2));
if (process.env.PARITY_REQUIRE_FULL === "1" && (process.env.PARITY_GREP || missingFixtures.length || manifest.visualRoutes.some(route => route.harness))) {
  throw new Error("Full release coverage requires paired fixtures and verified evidence from every separately declared state suite. See scope.json.");
}

function sideEnvironment(side) {
  const prefix = side === "reference" ? "PARITY_REFERENCE" : "PARITY_PORT";
  const environment = {
    ...process.env,
    PARITY_SIDE: side,
    PARITY_BASE_URL: process.env[`${prefix}_BASE_URL`],
    PARITY_SNAPSHOT_DIR: snapshotDir,
    PARITY_OUTPUT_DIR: resolve(artifactRoot, side),
  };
  const fixtureSuffixes = ["ONBOARDING_STORAGE_STATE", "ONBOARDING_LOGIN_EMAIL", "ONBOARDING_LOGIN_PASSWORD", "OPERATOR_STORAGE_STATE", "OPERATOR_LOGIN_EMAIL", "OPERATOR_LOGIN_PASSWORD", "CALL_ID", "CONTACT_ID", "DEMO_TOKEN", "RESET_TOKEN"];
  for (const suffix of [...fixtureSuffixes, ...fixtureSuffixes.filter((suffix) => /^(ONBOARDING|OPERATOR)_/.test(suffix)).flatMap((suffix) => [`${suffix}_EN`, `${suffix}_FR`])]) {
    const value = process.env[`${prefix}_${suffix}`];
    if (value) environment[`PARITY_${suffix}`] = value;
    else delete environment[`PARITY_${suffix}`];
  }
  return environment;
}

function run(side, update) {
  return new Promise((resolveRun, reject) => {
    const executable = resolve(admin, "node_modules/.bin/playwright");
    const args = ["test", "--config", "playwright.parity.config.ts"];
    if (process.env.PARITY_GREP) args.push("--grep", process.env.PARITY_GREP);
    if (update) args.push("--update-snapshots");
    const child = spawn(executable, args, { cwd: admin, env: sideEnvironment(side), stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${side} visual run failed with exit code ${code}.`)));
  });
}

if (process.env.PARITY_SKIP_REFERENCE === "1") {
  const record = JSON.parse(await readFile(referenceRecordPath, "utf8"));
  if (record.protocolHash !== protocolHash || record.grep !== (process.env.PARITY_GREP ?? null)) {
    throw new Error("Reference screenshots use a different protocol or route selection. Capture a fresh reference set.");
  }
} else {
  await run("reference", true);
  await writeFile(referenceRecordPath, JSON.stringify({ protocolHash, grep: process.env.PARITY_GREP ?? null, capturedAt: new Date().toISOString() }, null, 2));
}
await run("port", false);
console.log(`Selected visual cases passed. This does not certify unrepresented routes or interaction states. Artifacts: ${artifactRoot}`);
