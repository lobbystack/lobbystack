import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  REQUIRED_ADMIN_BUILD_ARGS,
  adminBuildArgs,
  declaredBuildArgs,
  imageName,
  isMissingManifest,
  marketingHosts,
  newDeployment,
  parseArgs,
  rolloutProgress,
  supersededAction,
} from "./dokploy-release";

describe("dokploy release", () => {
  it("parses the commit, tag and flags", () => {
    expect(parseArgs([])).toEqual({ environment: "production", allowOlder: false, buildOnly: false, skipSuperseded: false, help: false });
    expect(parseArgs(["abc", "--build-only", "--skip-superseded"])).toMatchObject({ ref: "abc", buildOnly: true, skipSuperseded: true });
    expect(parseArgs(["--env=staging"]).environment).toBe("staging");
    expect(parseArgs(["911ca1f9", "--tag", "911ca1f9-r2", "--allow-older", "--env", "production"])).toEqual({
      ref: "911ca1f9",
      tag: "911ca1f9-r2",
      environment: "production",
      allowOlder: true,
      buildOnly: false,
      skipSuperseded: false,
      help: false,
    });
    expect(parseArgs(["--tag=v2"]).tag).toBe("v2");
    expect(() => parseArgs(["--tag", "bad tag"])).toThrow("not a valid image tag");
    expect(() => parseArgs(["--tag"])).toThrow("--tag needs a value");
    expect(() => parseArgs(["--tag="])).toThrow("not a valid image tag");
    expect(() => parseArgs(["a", "b"])).toThrow("Pass one commit");
    expect(() => parseArgs(["--force"])).toThrow("Unknown option");
    expect(() => parseArgs(["--env=nowhere"])).toThrow("Unknown environment nowhere");
    expect(() => parseArgs(["--env"])).toThrow("--env needs a value");
  });

  it("purges the marketing hosts the admin serves", () => {
    expect(marketingHosts({ MARKETING_HOSTS: " lobbystack.com, WWW.lobbystack.com ," })).toEqual(["lobbystack.com", "www.lobbystack.com"]);
    expect(marketingHosts({})).toEqual([]);
  });

  it("names images in the registry, with an admin per environment", () => {
    const registry = "ghcr.io/lobbystack/lobbystack";
    expect(imageName(registry, "admin", "911ca1f9", "production")).toBe(`${registry}/admin:911ca1f9`);
    expect(imageName(registry, "admin", "911ca1f9", "staging")).toBe(`${registry}/admin:911ca1f9-staging`);
    expect(imageName(registry, "worker", "911ca1f9", "staging")).toBe(`${registry}/worker:911ca1f9`);
  });

  it("treats only a not-found answer from the registry as a missing image", () => {
    expect(isMissingManifest("docker manifest exited with 1: no such manifest: ghcr.io/x/admin:abc")).toBe(true);
    expect(isMissingManifest("manifest unknown: manifest unknown")).toBe(true);
    expect(isMissingManifest("unauthorized: authentication required")).toBe(false);
    expect(isMissingManifest("Get \"https://ghcr.io/v2/\": net/http: TLS handshake timeout")).toBe(false);
  });

  it("releases the tip of main and skips or refuses anything older", () => {
    const strict = { allowOlder: false, skipSuperseded: false };
    expect(supersededAction("a", "a", true, strict)).toBe("release");
    expect(supersededAction("a", "b", true, strict)).toBe("refuse");
    expect(supersededAction("a", "b", true, { ...strict, skipSuperseded: true })).toBe("skip");
    expect(supersededAction("a", "b", true, { ...strict, allowOlder: true })).toBe("release");
    // A commit that never reached main is refused whatever the flags say.
    expect(supersededAction("a", "b", false, { allowOlder: true, skipSuperseded: true })).toBe("refuse");
  });

  it("takes the admin build arguments the Dockerfile declares from the Dokploy environment", () => {
    const declared = declaredBuildArgs(readFileSync(new URL("../Dockerfile.admin", import.meta.url), "utf8"));
    for (const name of REQUIRED_ADMIN_BUILD_ARGS) expect(declared).toContain(name);

    const env = Object.fromEntries(REQUIRED_ADMIN_BUILD_ARGS.map((name) => [name, `${name}-value`]));
    const { values, missing } = adminBuildArgs(declared, { ...env, SERVICE_VERSION: "runtime", DATABASE_URL: "postgres://secret", BRAND_APP_NAME: "" });
    expect(missing).toEqual([]);
    expect(values.S3_ENDPOINT).toBe("S3_ENDPOINT-value");
    // SERVICE_VERSION comes from the commit, and runtime-only or empty values stay out of the build.
    expect(values).not.toHaveProperty("SERVICE_VERSION");
    expect(values).not.toHaveProperty("DATABASE_URL");
    expect(values).not.toHaveProperty("BRAND_APP_NAME");

    expect(adminBuildArgs(declared, { ...env, S3_BUCKET: "" }).missing).toEqual(["S3_BUCKET"]);
  });

  it("finds the deployment the release started", () => {
    const deployments = [
      { deploymentId: "old", status: "done", createdAt: "2026-10-21T03:00:00.000Z" },
      { deploymentId: "new", status: "running", createdAt: "2026-10-21T04:00:00.000Z" },
      { deploymentId: "newer", status: "done", createdAt: "2026-10-21T04:01:00.000Z" },
    ];
    expect(newDeployment(deployments, new Set(["old"]))?.deploymentId).toBe("newer");
    expect(newDeployment(deployments, new Set(["old", "new", "newer"]))).toBeUndefined();
  });

  describe("rollout", () => {
    const old = { containerId: "old", state: "running", currentState: "Running 9 minutes ago", error: "" };
    const previousIds = new Set(["old"]);
    const worker = { requireOldGone: false };
    const migrator = { requireOldGone: true };

    it("waits until Swarm reports the new task running, which means healthy", () => {
      expect(rolloutProgress([old], previousIds, worker)).toEqual({ state: "waiting", reason: "no new container yet" });
      const starting = { containerId: "new", state: "running", currentState: "Starting 5 seconds ago", error: "" };
      expect(rolloutProgress([starting, old], previousIds, worker)).toEqual({ state: "waiting", reason: "new container is Starting 5 seconds ago" });
      const running = { ...starting, currentState: "Running 2 seconds ago" };
      expect(rolloutProgress([running, old], previousIds, worker).state).toBe("done");
    });

    it("waits for the old migrator to stop", () => {
      const fresh = { containerId: "new", state: "running", currentState: "Running 3 seconds ago", error: "" };
      expect(rolloutProgress([fresh, { ...old, state: "shutdown" }], previousIds, migrator).state).toBe("waiting");
      const stopped = { ...old, state: "shutdown", currentState: "Shutdown 1 second ago" };
      expect(rolloutProgress([fresh, stopped], previousIds, migrator).state).toBe("done");
    });

    it("fails when a new task fails, even after Swarm starts the old image again", () => {
      const failed = { containerId: "new", state: "shutdown", currentState: "Failed 20 seconds ago", error: "task: non-zero exit (1)" };
      const rolledBack = { containerId: "again", state: "running", currentState: "Running 5 seconds ago", error: "" };
      expect(rolloutProgress([rolledBack, failed, old], previousIds, worker)).toEqual({
        state: "failed",
        reason: "the new container failed (Failed 20 seconds ago: task: non-zero exit (1))",
      });
    });
  });
});
