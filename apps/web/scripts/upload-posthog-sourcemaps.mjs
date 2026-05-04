import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const assetsDir = path.join(packageRoot, "dist", "assets");
const requiredEnvVars = ["POSTHOG_CLI_API_KEY", "POSTHOG_CLI_PROJECT_ID"];

function readOptionalEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function resolveReleaseVersion() {
  const explicitVersion = readOptionalEnv("POSTHOG_RELEASE_VERSION");
  if (explicitVersion) {
    return explicitVersion;
  }

  for (const name of ["CF_PAGES_COMMIT_SHA", "GITHUB_SHA", "VERCEL_GIT_COMMIT_SHA"]) {
    const value = readOptionalEnv(name);
    if (value) {
      return value;
    }
  }

  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: packageRoot,
    encoding: "utf8",
  }).trim();
}

function runPostHogCli(args) {
  execFileSync("pnpm", ["exec", "posthog-cli", ...args], {
    cwd: packageRoot,
    stdio: "inherit",
    env: process.env,
  });
}

function isProductionDeploy() {
  return (
    process.env.DEPLOYMENT_MODE === "cloud" ||
    process.env.NODE_ENV === "production" ||
    process.env.CF_PAGES === "1"
  );
}

const missingEnvVars = requiredEnvVars.filter((name) => !readOptionalEnv(name));
if (missingEnvVars.length > 0) {
  const message = `[posthog] sourcemap upload missing ${missingEnvVars.join(", ")}.`;
  if (isProductionDeploy()) {
    console.error(`${message} Production deploys must upload PostHog sourcemaps.`);
    process.exit(1);
  }
  console.log(`${message} Skipping outside production deploy mode.`);
  process.exit(0);
}

if (!fs.existsSync(assetsDir)) {
  console.error(
    `[posthog] sourcemap upload expected built assets at ${assetsDir}, but none were found.`,
  );
  process.exit(1);
}

process.env.POSTHOG_CLI_HOST ||= readOptionalEnv("VITE_POSTHOG_UI_HOST") ?? "https://us.posthog.com";

const releaseName = readOptionalEnv("POSTHOG_RELEASE_NAME") ?? "@lobbystack/web";
const releaseVersion = resolveReleaseVersion();

runPostHogCli(["sourcemap", "inject", "--directory", assetsDir]);
runPostHogCli([
  "sourcemap",
  "upload",
  "--directory",
  assetsDir,
  "--release-name",
  releaseName,
  "--release-version",
  releaseVersion,
  "--delete-after",
]);

console.log(`[posthog] uploaded browser sourcemaps for ${releaseName}@${releaseVersion}.`);
