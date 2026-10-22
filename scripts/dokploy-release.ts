// Releases one commit to a Dokploy environment. It builds the migrator, worker
// and admin images for linux/amd64 that the registry doesn't hold yet, pushes
// them to ghcr.io, then points each Dokploy application at
// the new tag. It runs the `migrate` schedule before it deploys the worker and
// then the admin, checks /api/health/ready, and stops at the first failure.
// GitHub Actions runs it after every merge to main (.github/workflows/ci.yml
// and dokploy-release.yml); you can run it from your machine too.
//
// Usage: pnpm release:dokploy [ref] [--env <name>] [--tag <tag>] [--allow-older] [--build-only] [--skip-superseded]
//
//   ref                Commit to release. Defaults to the tip of GitHub main.
//   --env <name>       Dokploy environment: production (the default) or staging.
//   --tag <tag>        Image tag. Defaults to the first 8 characters of the commit.
//                      Pass a new one, such as 911ca1f9-r2, to rebuild a commit
//                      whose tag the registry already holds.
//   --allow-older      Release a commit on main that is no longer its tip.
//   --build-only       Build and push the images, then stop.
//   --skip-superseded  Exit successfully, without releasing, when main has
//                      moved past the commit. CI uses it.
//
// Needs DOKPLOY_API_KEY, Docker, and `docker login ghcr.io` when
// it has images to push. See docs/deployment/dokploy-release.md.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

export const SERVICES = ["migrator", "worker", "admin"] as const;
export type Service = (typeof SERVICES)[number];

export const HOST = {
  dokployUrl: "https://deploy.lobbystack.com",
  registry: "ghcr.io/lobbystack/lobbystack",
  gitRemote: "https://github.com/lobbystack/lobbystack.git",
  branch: "main",
};

/** The lobbystack.com zone, whose edge cache holds the marketing pages. */
export const CLOUDFLARE_ZONE_ID = "0ca4e71d1814f06e45487e766cba2bca";

export type Target = {
  healthUrl: string;
  migrateScheduleId: string;
  applicationIds: Record<Service, string>;
  /** Ship only the tip of GitHub main. Staging takes any commit, so you can try a branch before you merge it. */
  requireMain: boolean;
};

export const ENVIRONMENTS: Record<string, Target> = {
  production: {
    healthUrl: "https://app.lobbystack.com/api/health/ready",
    migrateScheduleId: "CGDsS2xNHhoslxaO4DbHs",
    applicationIds: {
      migrator: "KNsXmLEpJfdZEI9exooki",
      worker: "pXB3lJeaaOaSeS7ZeeUlA",
      admin: "2kPJAKf2HA6ZDqBxIYJ9U",
    },
    requireMain: true,
  },
  staging: {
    healthUrl: "https://staging.lobbystack.com/api/health/ready",
    migrateScheduleId: "-lvCeaCfj1-5BV1_gNHIP",
    applicationIds: {
      migrator: "JjpRnQG_KGgi1SpU0QhIT",
      worker: "8Amtebi-ZJN2aMf90od9f",
      admin: "UK9uxQ5uknxLLsSVc13AF",
    },
    requireMain: false,
  },
};

// Next.js writes these into the admin bundle at build time, and next.config
// bakes the storage origin into the Content Security Policy. A build without
// them serves a broken sign-in page or blocks uploads, so refuse to build.
export const REQUIRED_ADMIN_BUILD_ARGS = [
  "DEPLOYMENT_MODE",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "POSTHOG_SOURCEMAP_API_KEY",
  "S3_BUCKET",
  "S3_ENDPOINT",
  "S3_REGION",
  "STORAGE_PROVIDER",
];

type RolloutRule = { requireOldGone: boolean; timeoutMs: number };

const ROLLOUT: Record<Service, RolloutRule> = {
  // Dokploy runs the migrate schedule in the first running container it finds,
  // so wait until the old migrator has stopped.
  migrator: { requireOldGone: true, timeoutMs: 3 * 60_000 },
  // The old worker keeps its calls for up to 31 minutes after it gets SIGTERM.
  worker: { requireOldGone: false, timeoutMs: 6 * 60_000 },
  admin: { requireOldGone: true, timeoutMs: 6 * 60_000 },
};

export type ReleaseOptions = {
  ref?: string | undefined;
  tag?: string | undefined;
  environment: string;
  allowOlder: boolean;
  buildOnly: boolean;
  skipSuperseded: boolean;
  help: boolean;
};

export function parseArgs(argv: string[]): ReleaseOptions {
  const options: ReleaseOptions = { environment: "production", allowOlder: false, buildOnly: false, skipSuperseded: false, help: false };
  const value = (index: number, name: string) => {
    const next = argv[index];
    if (next === undefined) throw new Error(`${name} needs a value.`);
    return next;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--allow-older") options.allowOlder = true;
    else if (arg === "--build-only") options.buildOnly = true;
    else if (arg === "--skip-superseded") options.skipSuperseded = true;
    else if (arg === "--tag") options.tag = value(++index, "--tag");
    else if (arg.startsWith("--tag=")) options.tag = arg.slice("--tag=".length);
    else if (arg === "--env") options.environment = value(++index, "--env");
    else if (arg.startsWith("--env=")) options.environment = arg.slice("--env=".length);
    else if (arg.startsWith("-")) throw new Error(`Unknown option ${arg}.`);
    else if (options.ref) throw new Error(`Pass one commit, not ${options.ref} and ${arg}.`);
    else options.ref = arg;
  }
  if (options.tag !== undefined && !isImageTag(options.tag)) {
    throw new Error(`"${options.tag}" is not a valid image tag.`);
  }
  if (!Object.hasOwn(ENVIRONMENTS, options.environment)) {
    throw new Error(`Unknown environment ${options.environment}. Pick one of: ${Object.keys(ENVIRONMENTS).join(", ")}.`);
  }
  return options;
}

export function isImageTag(tag: string): boolean {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag);
}

/** Every environment builds its own admin, tagged `<tag>-<environment>` outside production. They share the worker and migrator. */
export function imageName(registry: string, service: Service, tag: string, environment: string): string {
  const suffix = service === "admin" && environment !== "production" ? `-${environment}` : "";
  return `${registry}/${service}:${tag}${suffix}`;
}

export function declaredBuildArgs(dockerfile: string): string[] {
  return [...new Set([...dockerfile.matchAll(/^ARG\s+([A-Za-z_][A-Za-z0-9_]*)/gm)].map((match) => match[1]!))];
}

/**
 * Picks the admin's build arguments from its Dokploy environment, the same way
 * Railway passed every service variable to the build.
 */
export function adminBuildArgs(declared: string[], env: Record<string, string | undefined>) {
  const values: Record<string, string> = {};
  for (const name of declared) {
    const value = env[name];
    if (name !== "SERVICE_VERSION" && value) values[name] = value;
  }
  const missing = REQUIRED_ADMIN_BUILD_ARGS.filter((name) => !values[name]);
  return { values, missing };
}

/** The marketing hosts the admin serves, whose cached pages a release replaces. */
export function marketingHosts(env: Record<string, string | undefined>): string[] {
  return (env.MARKETING_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
}

export type Deployment = {
  deploymentId: string;
  status: string;
  createdAt: string;
  errorMessage?: string | null;
};

const FINISHED = new Set(["done", "error", "cancelled"]);

/** The newest deployment that didn't exist before the release asked for one. */
export function newDeployment(deployments: Deployment[], known: Set<string>): Deployment | undefined {
  return deployments
    .filter((deployment) => !known.has(deployment.deploymentId))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
}

/** A Swarm task, as Dokploy's docker.getServiceContainersByAppName lists it. */
export type Task = { containerId: string; state: string; currentState: string; error: string };

// Swarm keeps a task with a health check in "Starting" until the check passes,
// so "Running" means healthy.
const isRunning = (task: Task) => task.currentState.startsWith("Running");
const hasFailed = (task: Task) => /^(Failed|Rejected)/.test(task.currentState);

export type Rollout = { state: "done" } | { state: "waiting"; reason: string } | { state: "failed"; reason: string };

export function rolloutProgress(tasks: Task[], previousIds: Set<string>, rule: Pick<RolloutRule, "requireOldGone">): Rollout {
  const fresh = tasks.filter((task) => !previousIds.has(task.containerId));
  // Swarm rolls the service back after any failure during the update.
  const failed = fresh.find(hasFailed);
  if (failed) return { state: "failed", reason: `the new container failed (${failed.currentState}${failed.error ? `: ${failed.error}` : ""})` };
  const running = fresh.find(isRunning);
  if (!running) return { state: "waiting", reason: fresh[0] ? `new container is ${fresh[0].currentState}` : "no new container yet" };
  if (rule.requireOldGone && tasks.some((task) => previousIds.has(task.containerId) && isRunning(task))) {
    return { state: "waiting", reason: "old container is still stopping" };
  }
  return { state: "done" };
}

/** Whether a release has moved on from the commit: ship it, skip it, or refuse. */
export function supersededAction(sha: string, tip: string, onMain: boolean, options: Pick<ReleaseOptions, "allowOlder" | "skipSuperseded">) {
  if (sha === tip) return "release" as const;
  if (!onMain) return "refuse" as const;
  if (options.allowOlder) return "release" as const;
  return options.skipSuperseded ? ("skip" as const) : ("refuse" as const);
}

// --- Process helpers ------------------------------------------------------------

type RunOptions = { cwd?: string; env?: NodeJS.ProcessEnv; capture?: boolean };

function run(command: string, args: string[], options: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk));
    child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} ${args[0] ?? ""} ${signal ? `stopped by ${signal}` : `exited with ${code}`}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

let interrupted = false;

function checkInterrupted() {
  if (interrupted) throw new Error("Interrupted.");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  checkInterrupted();
}

function step(message: string) {
  checkInterrupted();
  console.log(`\n==> ${message}`);
}

type Config = typeof HOST & Target & { environment: string; apiKey: string };

// --- Dokploy API ------------------------------------------------------------------

class DokployError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function dokploy<T>(config: Config, method: "GET" | "POST", path: string, params: Record<string, unknown>, timeoutMs = 60_000): Promise<T> {
  const url = new URL(`/api/${path}`, config.dokployUrl);
  const headers: Record<string, string> = { accept: "application/json", "x-api-key": config.apiKey };
  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(timeoutMs) };
  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  } else {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(params);
  }
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new DokployError(`Dokploy ${path} answered ${response.status}: ${text.slice(0, 300)}`, response.status);
  return (text ? JSON.parse(text) : undefined) as T;
}

type Application = {
  applicationId: string;
  appName: string;
  dockerImage: string | null;
  username: string | null;
  password: string | null;
  registryUrl: string | null;
  env: string | null;
};

const getApplication = (config: Config, applicationId: string) => dokploy<Application>(config, "GET", "application.one", { applicationId });

const getTasks = (config: Config, appName: string) => dokploy<Task[]>(config, "GET", "docker.getServiceContainersByAppName", { appName });

async function waitForDeployment(list: () => Promise<Deployment[]>, known: Set<string>, timeoutMs: number, label: string): Promise<Deployment> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const deployment = newDeployment(await list(), known);
    if (deployment && FINISHED.has(deployment.status)) return deployment;
    await sleep(3_000);
  }
  throw new Error(`${label} didn't finish within ${Math.round(timeoutMs / 60_000)} minutes.`);
}

async function deploymentLog(config: Config, deploymentId: string, tail: number): Promise<string> {
  const log = await dokploy<string>(config, "GET", "deployment.readLogs", { deploymentId, tail }).catch((error: Error) => `(couldn't read the log: ${error.message})`);
  return String(log).trimEnd().replace(/^/gm, "    ");
}

// --- Release steps -----------------------------------------------------------------

/** Fetches GitHub main without touching any local branch and returns its tip. */
async function fetchTip(config: Config, root: string): Promise<string> {
  await run("git", ["-C", root, "fetch", "--quiet", "--no-tags", config.gitRemote, `refs/heads/${config.branch}`], { capture: true });
  return (await run("git", ["-C", root, "rev-parse", "FETCH_HEAD"], { capture: true })).trim();
}

/** Same rule as the old GitHub release job: ship the tip of main, nothing else. */
async function checkReleasable(config: Config, root: string, sha: string, options: ReleaseOptions): Promise<"release" | "skip"> {
  if (!config.requireMain) return "release";
  const tip = await fetchTip(config, root);
  const onMain = sha === tip || (await run("git", ["-C", root, "merge-base", "--is-ancestor", sha, tip], { capture: true }).then(() => true, () => false));
  const action = supersededAction(sha, tip, onMain, options);
  if (action !== "refuse") return action;
  if (!onMain) throw new Error(`${sha.slice(0, 12)} isn't on GitHub ${config.branch}. Merge it first.`);
  throw new Error(`${config.branch} has moved on to ${tip.slice(0, 12)}. Release that instead, or pass --allow-older to ship ${sha.slice(0, 12)}.`);
}

/** Production and staging together don't fit in the host's 4 GB, so production releases wait for staging to stop. */
async function checkOtherEnvironmentsStopped(config: Config) {
  if (config.environment !== "production") return;
  for (const [name, target] of Object.entries(ENVIRONMENTS)) {
    if (name === "production") continue;
    for (const applicationId of Object.values(target.applicationIds)) {
      const app = await getApplication(config, applicationId);
      if ((await getTasks(config, app.appName)).some((task) => task.state === "running")) {
        throw new Error(`${name} is running on the host. Stop it with scripts/${name}-stop.sh, then release again.`);
      }
    }
  }
}

/** Only a "not found" answer counts as missing: rebuilding after a network error would overwrite a tag production may run. */
export function isMissingManifest(message: string): boolean {
  return /no such manifest|manifest unknown|name unknown|not found/i.test(message);
}

async function registryLacks(images: Record<Service, string>): Promise<Service[]> {
  const lacking: Service[] = [];
  for (const service of SERVICES) {
    const present = await run("docker", ["manifest", "inspect", images[service]], { capture: true }).then(
      () => true,
      (error: Error) => {
        if (isMissingManifest(error.message)) return false;
        throw new Error(`Couldn't check ${images[service]} in the registry: ${error.message}`);
      },
    );
    if (!present) lacking.push(service);
  }
  return lacking;
}

async function buildAndPush(root: string, sha: string, services: Service[], images: Record<Service, string>, adminArgs: Record<string, string>) {
  const work = await mkdtemp(join(tmpdir(), "lobbystack-release-"));
  const tree = join(work, "tree");
  await run("git", ["-C", root, "worktree", "add", "--detach", tree, sha], { capture: true });
  try {
    for (const service of services) {
      step(`Building ${images[service]}`);
      const args = ["build", "--platform", "linux/amd64", "--provenance=false", "-f", `Dockerfile.${service}`, "--build-arg", `SERVICE_VERSION=${sha}`, "-t", images[service]];
      // A bare --build-arg takes its value from the environment, which keeps the
      // values out of the process list.
      if (service === "admin") for (const name of Object.keys(adminArgs)) args.push("--build-arg", name);
      args.push(".");
      await run("docker", args, { cwd: tree, env: service === "admin" ? { ...process.env, ...adminArgs } : process.env });
      step(`Pushing ${images[service]}`);
      await run("docker", ["push", "--quiet", images[service]]).catch((error: Error) => {
        throw new Error(`${error.message}\nLog in with \`docker login ${images[service].split("/")[0]}\` and run the release again.`);
      });
    }
  } finally {
    await run("git", ["-C", root, "worktree", "remove", "--force", tree], { capture: true }).catch(() => undefined);
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * When CI_DEPLOY_USER and CI_DEPLOY_PASSWORD are set, Dokploy pulls with them,
 * which a private registry needs. Otherwise the application keeps whatever
 * credentials it has; the public ghcr.io images need none.
 */
function pullCredentials(app: Application, image: string) {
  const username = process.env.CI_DEPLOY_USER;
  const password = process.env.CI_DEPLOY_PASSWORD;
  if (username && password) return { username, password, registryUrl: image.split("/")[0]! };
  return { username: app.username, password: app.password, registryUrl: app.registryUrl };
}

async function deployService(config: Config, service: Service, app: Application, image: string, release: { tag: string; subject: string }) {
  step(`Deploying ${service}: ${image}`);
  const previousIds = new Set((await getTasks(config, app.appName)).map((task) => task.containerId));
  await dokploy(config, "POST", "application.saveDockerProvider", { applicationId: app.applicationId, dockerImage: image, ...pullCredentials(app, image) });
  const listDeployments = () => dokploy<Deployment[]>(config, "GET", "deployment.all", { applicationId: app.applicationId });
  const known = new Set((await listDeployments()).map((deployment) => deployment.deploymentId));
  await dokploy(config, "POST", "application.deploy", {
    applicationId: app.applicationId,
    title: `Release ${release.tag}`,
    description: release.subject.slice(0, 200),
  });
  const deployment = await waitForDeployment(listDeployments, known, 10 * 60_000, `The ${service} deployment`);
  if (deployment.status !== "done") {
    throw new Error(`Dokploy couldn't deploy ${service} (${deployment.status}${deployment.errorMessage ? `: ${deployment.errorMessage}` : ""}).\n${await deploymentLog(config, deployment.deploymentId, 40)}`);
  }

  const rule = ROLLOUT[service];
  const deadline = Date.now() + rule.timeoutMs;
  let reason = "";
  while (Date.now() < deadline) {
    const progress = rolloutProgress(await getTasks(config, app.appName), previousIds, rule);
    if (progress.state === "done") return;
    if (progress.state === "failed") throw new Error(`${service} didn't start: ${progress.reason}. Swarm rolls it back; check its logs in Dokploy.`);
    if (progress.reason !== reason) console.log(`    ${progress.reason}`);
    reason = progress.reason;
    await sleep(3_000);
  }
  throw new Error(`${service} didn't become ready within ${rule.timeoutMs / 60_000} minutes (${reason}). Check its logs in Dokploy.`);
}

async function runMigrations(config: Config) {
  step("Running the migrate schedule");
  const listRuns = () => dokploy<Deployment[]>(config, "GET", "deployment.allByType", { id: config.migrateScheduleId, type: "schedule" });
  const known = new Set((await listRuns()).map((deployment) => deployment.deploymentId));
  let result: Deployment | undefined;
  try {
    // Dokploy answers once the command ends. Cloudflare gives up after 100
    // seconds, so a long migration loses the answer but keeps running.
    result = await dokploy<Deployment>(config, "POST", "schedule.runManually", { scheduleId: config.migrateScheduleId }, 30 * 60_000);
  } catch (error) {
    if (error instanceof DokployError && error.status < 500) throw error;
    console.log(`    Lost Dokploy's answer (${error instanceof Error ? error.message : String(error)}); following the run instead.`);
  }
  const deployment = result && FINISHED.has(result.status) ? result : await waitForDeployment(listRuns, known, 30 * 60_000, "The migrate schedule");
  const log = await deploymentLog(config, deployment.deploymentId, deployment.status === "done" ? 5 : 40);
  if (deployment.status !== "done") throw new Error(`The migrate schedule failed, so the worker and admin weren't deployed.\n${log}`);
  console.log(log);
}

async function checkHealth(url: string) {
  step(`Checking ${url}`);
  const deadline = Date.now() + 2 * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { "cache-control": "no-cache" } });
      if (response.status === 200) return;
      last = `HTTP ${response.status} ${(await response.text()).slice(0, 200)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(5_000);
  }
  throw new Error(`${url} didn't answer 200 within 2 minutes (last: ${last}).`);
}

/**
 * Cloudflare keeps marketing pages at its edge, and their scripts change names
 * with each build, so drop the old pages once the new admin serves. A failed
 * purge only leaves old pages for a few minutes, so it warns instead of failing
 * a release that already shipped.
 */
async function purgeMarketingCache(hosts: string[]) {
  if (hosts.length === 0) return;
  step(`Purging Cloudflare's cache for ${hosts.join(", ")}`);
  const token = process.env.CLOUDFLARE_CACHE_PURGE_TOKEN;
  if (!token) {
    console.warn("    Skipped: set CLOUDFLARE_CACHE_PURGE_TOKEN. Cloudflare serves the old pages for about five minutes.");
    return;
  }
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ hosts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) console.warn(`    Cloudflare refused the purge: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  } catch (error) {
    console.warn(`    Couldn't reach Cloudflare: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: pnpm release:dokploy [ref] [--env <name>] [--tag <tag>] [--allow-older] [--build-only] [--skip-superseded]\nSee docs/deployment/dokploy-release.md.");
    return;
  }
  const apiKey = process.env.DOKPLOY_API_KEY;
  if (!apiKey) throw new Error("Set DOKPLOY_API_KEY to a Dokploy API key. See docs/deployment/dokploy-release.md.");
  const config: Config = {
    ...HOST,
    ...ENVIRONMENTS[options.environment]!,
    environment: options.environment,
    dokployUrl: process.env.DOKPLOY_URL ?? HOST.dokployUrl,
    registry: process.env.RELEASE_REGISTRY ?? HOST.registry,
    apiKey,
  };
  // Ctrl-C stops a running build, and the release stops at the next step,
  // after cleaning up. A second Ctrl-C exits at once.
  process.on("SIGINT", () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.error("\nInterrupted. Stopping after cleanup; press Ctrl-C again to quit now.");
  });

  const root = (await run("git", ["rev-parse", "--show-toplevel"], { capture: true })).trim();
  if (!options.buildOnly) await checkOtherEnvironmentsStopped(config);
  step(config.requireMain ? `Checking the commit against GitHub ${config.branch}` : "Resolving the commit");
  const sha = (await run("git", ["-C", root, "rev-parse", "--verify", `${options.ref ?? (await fetchTip(config, root))}^{commit}`], { capture: true })).trim();
  if ((await checkReleasable(config, root, sha, options)) === "skip") {
    console.log(`    Skipping ${sha.slice(0, 12)}: ${config.branch} has moved on, and its own pipeline releases it.`);
    return;
  }
  const subject = (await run("git", ["-C", root, "log", "-1", "--format=%s", sha], { capture: true })).trim();
  const tag = options.tag ?? sha.slice(0, 8);
  console.log(`    ${sha.slice(0, 12)} ${subject}`);

  step(`Reading the ${config.environment} applications in Dokploy`);
  const apps = {} as Record<Service, Application>;
  for (const service of SERVICES) {
    apps[service] = await getApplication(config, config.applicationIds[service]);
    console.log(`    ${service} runs ${apps[service].dockerImage}`);
  }
  const images = Object.fromEntries(SERVICES.map((service) => [service, imageName(config.registry, service, tag, config.environment)])) as Record<Service, string>;

  const toBuild = await registryLacks(images);
  const present = SERVICES.filter((service) => !toBuild.includes(service));
  if (present.length > 0) console.log(`    The registry already holds ${present.map((service) => images[service]).join(", ")}.`);
  if (toBuild.length > 0) {
    let adminArgs: Record<string, string> = {};
    if (toBuild.includes("admin")) {
      const declared = declaredBuildArgs(await run("git", ["-C", root, "show", `${sha}:Dockerfile.admin`], { capture: true }));
      const { values, missing } = adminBuildArgs(declared, parseEnv(apps.admin.env ?? ""));
      if (missing.length > 0) throw new Error(`The ${config.environment} admin in Dokploy has no ${missing.join(", ")}, which the admin build needs.`);
      console.log(`    Admin build arguments from Dokploy: ${Object.keys(values).sort().join(", ")}`);
      adminArgs = values;
    }
    await buildAndPush(root, sha, toBuild, images, adminArgs);
  }
  if (options.buildOnly) {
    console.log(`\nPushed the images for ${sha.slice(0, 12)}.`);
    return;
  }

  // A build takes long enough for someone to merge, or start staging, in the meantime.
  if ((await checkReleasable(config, root, sha, options)) === "skip") {
    console.log(`    Skipping ${sha.slice(0, 12)}: ${config.branch} moved on during the build, and its own pipeline releases it.`);
    return;
  }
  await checkOtherEnvironmentsStopped(config);
  const release = { tag, subject };
  try {
    await deployService(config, "migrator", apps.migrator, images.migrator, release);
    await runMigrations(config);
    await deployService(config, "worker", apps.worker, images.worker, release);
    await deployService(config, "admin", apps.admin, images.admin, release);
    await checkHealth(config.healthUrl);
    await purgeMarketingCache(marketingHosts(parseEnv(apps.admin.env ?? "")));
  } catch (error) {
    console.error("\nDokploy now points at:");
    for (const service of SERVICES) {
      const app = await getApplication(config, config.applicationIds[service]).catch(() => undefined);
      console.error(`    ${service}: ${app?.dockerImage ?? "unknown"}`);
    }
    throw error;
  }
  console.log(`\nReleased ${sha.slice(0, 12)} to ${config.environment} as ${tag}. The old worker exits once its last call ends.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(`\nRelease failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
