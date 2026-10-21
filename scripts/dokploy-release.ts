// Releases one commit to a Dokploy environment, from this machine. It builds the
// migrator, worker and admin images for linux/amd64, streams them over SSH into
// the registry on the Dokploy host, then points each Dokploy application at the
// new tag. It runs the `migrate` schedule before it deploys the worker and then
// the admin, checks /api/health/ready, and stops at the first failure.
//
// Usage: pnpm release:dokploy [ref] [--env <name>] [--tag <tag>] [--allow-older]
//
//   ref            Commit to release. Defaults to the tip of GitLab main.
//   --env <name>   Dokploy environment: production (the default) or staging.
//   --tag <tag>    Image tag. Defaults to the first 8 characters of the commit.
//                  Pass a new one, such as 911ca1f9-r2, to rebuild a commit
//                  whose tag the registry already holds.
//   --allow-older  Release a commit on main that is no longer its tip.
//
// Needs DOKPLOY_API_KEY, Docker, zstd, and SSH access to the host. See
// docs/deployment/dokploy-release.md.
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
  ssh: "ubuntu@40.160.96.129",
  // The registry container on the host listens on localhost only.
  registry: "127.0.0.1:5000",
  gitRemote: "https://gitlab.com/lobbystack-group/lobbystack.git",
  branch: "main",
};

export type Target = {
  healthUrl: string;
  migrateScheduleId: string;
  applicationIds: Record<Service, string>;
  /** Ship only the tip of GitLab main. Staging takes any commit, so you can try a branch before you merge it. */
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

type RolloutRule = { requireHealthy: boolean; requireOldGone: boolean; timeoutMs: number };

const ROLLOUT: Record<Service, RolloutRule> = {
  // Dokploy runs the migrate schedule in the first running container it finds,
  // so wait until the old migrator has stopped.
  migrator: { requireHealthy: false, requireOldGone: true, timeoutMs: 3 * 60_000 },
  // The old worker keeps its calls for up to 31 minutes after it gets SIGTERM.
  worker: { requireHealthy: true, requireOldGone: false, timeoutMs: 6 * 60_000 },
  admin: { requireHealthy: true, requireOldGone: true, timeoutMs: 6 * 60_000 },
};

export type ReleaseOptions = {
  ref?: string | undefined;
  tag?: string | undefined;
  environment: string;
  allowOlder: boolean;
  help: boolean;
};

export function parseArgs(argv: string[]): ReleaseOptions {
  const options: ReleaseOptions = { environment: "production", allowOlder: false, help: false };
  const value = (index: number, name: string) => {
    const next = argv[index];
    if (next === undefined) throw new Error(`${name} needs a value.`);
    return next;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--allow-older") options.allowOlder = true;
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
  return `${registry}/lobbystack-${service}:${tag}${suffix}`;
}

/** Whether an image on the host belongs to an environment, judged by its name alone. */
export function belongsTo(image: string, environment: string): boolean {
  const match = /^(?:127\.0\.0\.1:5000\/)?lobbystack-(admin|worker|migrator):([\w][\w.-]*)$/.exec(image);
  if (!match) return false;
  if (match[1] !== "admin") return true;
  const owner = Object.keys(ENVIRONMENTS).find((name) => name !== "production" && match[2]!.endsWith(`-${name}`)) ?? "production";
  return owner === environment;
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

export type Deployment = {
  deploymentId: string;
  status: string;
  createdAt: string;
  logPath?: string | null;
  errorMessage?: string | null;
};

const FINISHED = new Set(["done", "error", "cancelled"]);

/** The newest deployment that didn't exist before the release asked for one. */
export function newDeployment(deployments: Deployment[], known: Set<string>): Deployment | undefined {
  return deployments
    .filter((deployment) => !known.has(deployment.deploymentId))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
}

export type Container = { id: string; image: string; status: string };

export function parseContainers(output: string): Container[] {
  return output
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [id = "", image = "", status = ""] = line.split("\t");
      return { id, image, status };
    });
}

/** Swarm can record the tag with a pinned digest after it. */
export function runsImage(container: Container, image: string): boolean {
  return container.image === image || container.image.startsWith(`${image}@`);
}

export type Rollout = { state: "done" } | { state: "waiting"; reason: string } | { state: "failed"; reason: string };

export function rolloutProgress(input: {
  containers: Container[];
  image: string;
  previousIds: Set<string>;
  updateState: string;
  previousUpdateState: string;
  rule: Pick<RolloutRule, "requireHealthy" | "requireOldGone">;
}): Rollout {
  const { containers, image, previousIds, updateState, previousUpdateState, rule } = input;
  if (updateState !== previousUpdateState && /^(rollback|paused)/.test(updateState)) {
    return { state: "failed", reason: `Swarm reports ${updateState.split(" ")[0]}` };
  }
  const fresh = containers.filter((container) => !previousIds.has(container.id) && runsImage(container, image));
  if (fresh.length === 0) return { state: "waiting", reason: "no new container yet" };
  if (rule.requireHealthy && !fresh.some((container) => container.status.includes("(healthy)"))) {
    return { state: "waiting", reason: `new container is ${fresh[0]!.status}` };
  }
  if (rule.requireOldGone && containers.some((container) => previousIds.has(container.id))) {
    return { state: "waiting", reason: "old container is still stopping" };
  }
  return { state: "done" };
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

function ssh(config: Config, command: string, options: Omit<RunOptions, "env"> = { capture: true }): Promise<string> {
  return run("ssh", ["-o", "BatchMode=yes", config.ssh, command], options);
}

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

async function waitForDeployment(list: () => Promise<Deployment[]>, known: Set<string>, timeoutMs: number, label: string): Promise<Deployment> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const deployment = newDeployment(await list(), known);
    if (deployment && FINISHED.has(deployment.status)) return deployment;
    await sleep(3_000);
  }
  throw new Error(`${label} didn't finish within ${Math.round(timeoutMs / 60_000)} minutes.`);
}

async function logTail(config: Config, path: string | null | undefined, lines = 40): Promise<string> {
  if (!path || /[^\w./:@-]/.test(path)) return "(no log)";
  return (await ssh(config, `sudo tail -n ${lines} '${path}'`).catch((error: Error) => `(couldn't read ${path}: ${error.message})`)).trimEnd();
}

// --- Release steps -----------------------------------------------------------------

/** Fetches GitLab main without touching any local branch and returns its tip. */
async function fetchTip(config: Config, root: string): Promise<string> {
  await run("git", ["-C", root, "fetch", "--quiet", "--no-tags", config.gitRemote, `refs/heads/${config.branch}`], { capture: true });
  return (await run("git", ["-C", root, "rev-parse", "FETCH_HEAD"], { capture: true })).trim();
}

/** Same rule as the old GitHub release job: ship the tip of main, nothing else. */
async function checkReleasable(config: Config, root: string, sha: string, allowOlder: boolean): Promise<void> {
  if (!config.requireMain) return;
  const tip = await fetchTip(config, root);
  if (sha === tip) return;
  const onMain = await run("git", ["-C", root, "merge-base", "--is-ancestor", sha, tip], { capture: true }).then(() => true, () => false);
  if (!onMain) throw new Error(`${sha.slice(0, 12)} isn't on GitLab ${config.branch}. Merge it first.`);
  if (!allowOlder) {
    throw new Error(`${config.branch} has moved on to ${tip.slice(0, 12)}. Release that instead, or pass --allow-older to ship ${sha.slice(0, 12)}.`);
  }
}

async function registryLacks(config: Config, images: Record<Service, string>): Promise<Service[]> {
  const accept = "application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json,application/vnd.docker.distribution.manifest.list.v2+json";
  const checks = SERVICES.map((service) => {
    const [repository, tag] = images[service].slice(config.registry.length + 1).split(":");
    return `curl -s -o /dev/null -w '%{http_code}\\n' -I -H '${accept}' http://${config.registry}/v2/${repository}/manifests/${tag}`;
  });
  const codes = (await ssh(config, checks.join("; "))).trim().split("\n");
  return SERVICES.filter((_, index) => codes[index] !== "200");
}

async function buildImages(root: string, sha: string, services: Service[], images: Record<Service, string>, adminArgs: Record<string, string>) {
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
    }
  } finally {
    await run("git", ["-C", root, "worktree", "remove", "--force", tree], { capture: true }).catch(() => undefined);
    await rm(work, { recursive: true, force: true });
  }
}

async function shipImages(config: Config, images: string[]) {
  step(`Streaming ${images.length} images to ${config.ssh}`);
  await run("bash", [
    "-o",
    "pipefail",
    "-c",
    `docker save --platform linux/amd64 ${images.join(" ")} | zstd -T0 -3 -q | ssh -o BatchMode=yes ${config.ssh} 'zstd -dcq | sudo docker load -q'`,
  ]);
  step(`Pushing to the registry on the host`);
  await ssh(config, `for image in ${images.join(" ")}; do sudo docker push -q "$image" || exit 1; done`, {});
  // The build cache keeps the layers, so a rebuild stays fast.
  await run("docker", ["image", "rm", ...images], { capture: true }).catch(() => undefined);
}

async function serviceState(config: Config, appName: string) {
  const output = await ssh(
    config,
    `sudo docker ps --filter label=com.docker.swarm.service.name=${appName} --format '{{.ID}}\t{{.Image}}\t{{.Status}}'; echo '--'; sudo docker service inspect ${appName} --format '{{if .UpdateStatus}}{{.UpdateStatus.State}} {{.UpdateStatus.StartedAt}}{{end}}'`,
  );
  const [containers = "", updateState = ""] = output.split("--\n");
  return { containers: parseContainers(containers), updateState: updateState.trim() };
}

async function deployService(config: Config, service: Service, app: Application, image: string, release: { tag: string; subject: string }) {
  step(`Deploying ${service}: ${image}`);
  const before = await serviceState(config, app.appName);
  await dokploy(config, "POST", "application.saveDockerProvider", {
    applicationId: app.applicationId,
    dockerImage: image,
    username: app.username,
    password: app.password,
    registryUrl: app.registryUrl,
  });
  const listDeployments = () => dokploy<Deployment[]>(config, "GET", "deployment.all", { applicationId: app.applicationId });
  const known = new Set((await listDeployments()).map((deployment) => deployment.deploymentId));
  await dokploy(config, "POST", "application.deploy", {
    applicationId: app.applicationId,
    title: `Release ${release.tag}`,
    description: release.subject.slice(0, 200),
  });
  const deployment = await waitForDeployment(listDeployments, known, 10 * 60_000, `The ${service} deployment`);
  if (deployment.status !== "done") {
    throw new Error(`Dokploy couldn't deploy ${service} (${deployment.status}${deployment.errorMessage ? `: ${deployment.errorMessage}` : ""}).\n${await logTail(config, deployment.logPath)}`);
  }

  const rule = ROLLOUT[service];
  const previousIds = new Set(before.containers.map((container) => container.id));
  const deadline = Date.now() + rule.timeoutMs;
  let reason = "";
  while (Date.now() < deadline) {
    const now = await serviceState(config, app.appName);
    const progress = rolloutProgress({ ...now, image, previousIds, previousUpdateState: before.updateState, rule });
    if (progress.state === "done") return;
    if (progress.state === "failed") throw new Error(`${service} didn't start: ${progress.reason}. Check its logs in Dokploy.`);
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
  const log = await logTail(config, deployment.logPath, deployment.status === "done" ? 5 : 40);
  if (deployment.status !== "done") throw new Error(`The migrate schedule failed, so the worker and admin weren't deployed.\n${log}`);
  console.log(log.replace(/^/gm, "    "));
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
 * Removes this environment's older images from the host's Docker. The
 * registry still holds them, and Docker refuses to remove an image in use.
 */
async function pruneHostImages(config: Config, keep: Set<string>) {
  const listed = (await ssh(config, "sudo docker images --format '{{.Repository}}:{{.Tag}}'")).split("\n");
  const stale = listed.filter((image) => belongsTo(image, config.environment) && !keep.has(image));
  if (stale.length === 0) return;
  step(`Removing ${stale.length} older images from the host`);
  await ssh(config, `sudo docker image rm ${stale.join(" ")} > /dev/null 2>&1 || true`);
}

/** Production and staging together don't fit in the host's 4 GB, so production releases wait for staging to stop. */
async function checkOtherEnvironmentsStopped(config: Config) {
  if (config.environment !== "production") return;
  const names = (await ssh(config, "sudo docker ps --format '{{.Names}}'")).split("\n");
  for (const environment of Object.keys(ENVIRONMENTS).filter((name) => name !== "production")) {
    if (names.some((name) => name.startsWith(`lobbystack-${environment}-`))) {
      throw new Error(`${environment} is running on the host. Stop it with scripts/${environment}-stop.sh before you release to production.`);
    }
  }
}

async function preflight(config: Config) {
  step("Checking Docker, zstd and SSH");
  await run("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true }).catch(() => {
    throw new Error("Docker isn't running. Start Docker Desktop.");
  });
  await run("zstd", ["--version"], { capture: true }).catch(() => {
    throw new Error("zstd is missing. Install it with `brew install zstd`.");
  });
  await ssh(config, "sudo -n docker info --format '{{.Swarm.LocalNodeState}}'").catch((error: Error) => {
    throw new Error(`Can't run Docker on ${config.ssh} over SSH: ${error.message}`);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: pnpm release:dokploy [ref] [--env <name>] [--tag <tag>] [--allow-older]\nSee docs/deployment/dokploy-release.md.");
    return;
  }
  const apiKey = process.env.DOKPLOY_API_KEY;
  if (!apiKey) throw new Error("Set DOKPLOY_API_KEY to a Dokploy API key. See docs/deployment/dokploy-release.md.");
  const config: Config = {
    ...HOST,
    ...ENVIRONMENTS[options.environment]!,
    environment: options.environment,
    dokployUrl: process.env.DOKPLOY_URL ?? HOST.dokployUrl,
    ssh: process.env.DOKPLOY_SSH ?? HOST.ssh,
    apiKey,
  };
  if (!/^[\w.@-]+$/.test(config.ssh)) throw new Error(`DOKPLOY_SSH must look like user@host, not ${config.ssh}.`);
  // Ctrl-C stops a running build or SSH command, and the release stops at the
  // next step, after cleaning up. A second Ctrl-C exits at once.
  process.on("SIGINT", () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.error("\nInterrupted. Stopping after cleanup; press Ctrl-C again to quit now.");
  });

  const root = (await run("git", ["rev-parse", "--show-toplevel"], { capture: true })).trim();
  await preflight(config);
  await checkOtherEnvironmentsStopped(config);
  step(config.requireMain ? `Checking the commit against GitLab ${config.branch}` : "Resolving the commit");
  const tip = await fetchTip(config, root);
  const sha = (await run("git", ["-C", root, "rev-parse", "--verify", `${options.ref ?? tip}^{commit}`], { capture: true })).trim();
  await checkReleasable(config, root, sha, options.allowOlder);
  const subject = (await run("git", ["-C", root, "log", "-1", "--format=%s", sha], { capture: true })).trim();
  const tag = options.tag ?? sha.slice(0, 8);
  console.log(`    ${sha.slice(0, 12)} ${subject}`);

  step(`Reading the ${config.environment} applications in Dokploy`);
  const apps = {} as Record<Service, Application>;
  for (const service of SERVICES) {
    apps[service] = await dokploy<Application>(config, "GET", "application.one", { applicationId: config.applicationIds[service] });
    // The name goes into shell commands on the host.
    if (!/^[\w.-]+$/.test(apps[service].appName)) throw new Error(`Unexpected Dokploy app name ${apps[service].appName}.`);
    console.log(`    ${service} runs ${apps[service].dockerImage}`);
  }
  const images = Object.fromEntries(SERVICES.map((service) => [service, imageName(config.registry, service, tag, config.environment)])) as Record<Service, string>;

  const toBuild = await registryLacks(config, images);
  if (toBuild.length < SERVICES.length) {
    const present = SERVICES.filter((service) => !toBuild.includes(service));
    console.log(`    The registry already holds ${present.map((service) => images[service]).join(", ")}, so those aren't rebuilt.`);
  }
  if (toBuild.length > 0) {
    let adminArgs: Record<string, string> = {};
    if (toBuild.includes("admin")) {
      const declared = declaredBuildArgs(await run("git", ["-C", root, "show", `${sha}:Dockerfile.admin`], { capture: true }));
      const { values, missing } = adminBuildArgs(declared, parseEnv(apps.admin.env ?? ""));
      if (missing.length > 0) throw new Error(`The ${config.environment} admin in Dokploy has no ${missing.join(", ")}, which the admin build needs.`);
      console.log(`    Admin build arguments from Dokploy: ${Object.keys(values).sort().join(", ")}`);
      adminArgs = values;
    }
    await buildImages(root, sha, toBuild, images, adminArgs);
    await shipImages(config, toBuild.map((service) => images[service]));
  }

  // A build takes long enough for someone to merge, or start staging, in the meantime.
  await checkReleasable(config, root, sha, options.allowOlder);
  await checkOtherEnvironmentsStopped(config);
  const release = { tag, subject };
  try {
    await deployService(config, "migrator", apps.migrator, images.migrator, release);
    await runMigrations(config);
    await deployService(config, "worker", apps.worker, images.worker, release);
    await deployService(config, "admin", apps.admin, images.admin, release);
    await checkHealth(config.healthUrl);
  } catch (error) {
    console.error("\nDokploy now points at:");
    for (const service of SERVICES) {
      const app = await dokploy<Application>(config, "GET", "application.one", { applicationId: config.applicationIds[service] }).catch(() => undefined);
      console.error(`    ${service}: ${app?.dockerImage ?? "unknown"}`);
    }
    throw error;
  }

  // Keep what the other environments run too, so a stopped staging starts without a pull.
  const elsewhere = await Promise.all(
    Object.entries(ENVIRONMENTS)
      .filter(([name]) => name !== config.environment)
      .flatMap(([, target]) => SERVICES.map((service) => target.applicationIds[service]))
      .map((applicationId) => dokploy<Application>(config, "GET", "application.one", { applicationId }).then((app) => app.dockerImage, () => null)),
  );
  const previous = SERVICES.map((service) => apps[service].dockerImage);
  const keep = [...SERVICES.map((service) => images[service]), ...previous, ...elsewhere].filter((image): image is string => Boolean(image));
  await pruneHostImages(config, new Set(keep));
  console.log(`\nReleased ${sha.slice(0, 12)} to ${config.environment} as ${tag}. The old worker exits once its last call ends.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(`\nRelease failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
