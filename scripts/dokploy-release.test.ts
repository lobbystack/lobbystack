import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  REQUIRED_ADMIN_BUILD_ARGS,
  adminBuildArgs,
  belongsTo,
  declaredBuildArgs,
  imageName,
  newDeployment,
  parseArgs,
  parseContainers,
  rolloutProgress,
} from "./dokploy-release";

const image = "127.0.0.1:5000/lobbystack-worker:abcdef12";

describe("dokploy release", () => {
  it("parses the commit, tag and flags", () => {
    expect(parseArgs([])).toEqual({ environment: "production", allowOlder: false, help: false });
    expect(parseArgs(["--env=staging"]).environment).toBe("staging");
    expect(parseArgs(["911ca1f9", "--tag", "911ca1f9-r2", "--allow-older", "--env", "production"])).toEqual({
      ref: "911ca1f9",
      tag: "911ca1f9-r2",
      environment: "production",
      allowOlder: true,
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

  it("names images in the host registry, with an admin per environment", () => {
    expect(imageName("127.0.0.1:5000", "admin", "911ca1f9", "production")).toBe("127.0.0.1:5000/lobbystack-admin:911ca1f9");
    expect(imageName("127.0.0.1:5000", "admin", "911ca1f9", "staging")).toBe("127.0.0.1:5000/lobbystack-admin:911ca1f9-staging");
    expect(imageName("127.0.0.1:5000", "worker", "911ca1f9", "staging")).toBe("127.0.0.1:5000/lobbystack-worker:911ca1f9");
  });

  it("prunes only the images an environment could own", () => {
    expect(belongsTo("127.0.0.1:5000/lobbystack-admin:911ca1f9-r2", "production")).toBe(true);
    expect(belongsTo("lobbystack-admin:911ca1f9", "production")).toBe(true);
    expect(belongsTo("127.0.0.1:5000/lobbystack-admin:f537edf6-staging", "production")).toBe(false);
    expect(belongsTo("127.0.0.1:5000/lobbystack-admin:f537edf6-staging", "staging")).toBe(true);
    expect(belongsTo("127.0.0.1:5000/lobbystack-admin:911ca1f9-r2", "staging")).toBe(false);
    // The worker and migrator images are shared; Docker keeps any a container still uses.
    expect(belongsTo("127.0.0.1:5000/lobbystack-worker:f537edf6", "production")).toBe(true);
    expect(belongsTo("127.0.0.1:5000/lobbystack-worker:f537edf6", "staging")).toBe(true);
    expect(belongsTo("pgvector/pgvector:pg16", "production")).toBe(false);
    expect(belongsTo("lobbystack/admin:release-check", "production")).toBe(false);
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

  it("parses docker ps output", () => {
    expect(parseContainers(`abc\t${image}\tUp 2 minutes (healthy)\n\n`)).toEqual([{ id: "abc", image, status: "Up 2 minutes (healthy)" }]);
  });

  describe("rollout", () => {
    const old = { id: "old", image: "127.0.0.1:5000/lobbystack-worker:55379a5f", status: "Up 9 minutes (healthy)" };
    const base = { image, previousIds: new Set(["old"]), updateState: "", previousUpdateState: "" };
    const worker = { requireHealthy: true, requireOldGone: false };
    const migrator = { requireHealthy: false, requireOldGone: true };

    it("waits for a healthy new container", () => {
      expect(rolloutProgress({ ...base, containers: [old], rule: worker }).state).toBe("waiting");
      const starting = { id: "new", image, status: "Up 5 seconds (health: starting)" };
      expect(rolloutProgress({ ...base, containers: [old, starting], rule: worker })).toEqual({
        state: "waiting",
        reason: "new container is Up 5 seconds (health: starting)",
      });
      const healthy = { ...starting, status: "Up 1 minute (healthy)" };
      expect(rolloutProgress({ ...base, containers: [old, healthy], rule: worker }).state).toBe("done");
    });

    it("accepts an image Swarm pinned to a digest", () => {
      const pinned = { id: "new", image: `${image}@sha256:1234`, status: "Up 1 minute (healthy)" };
      expect(rolloutProgress({ ...base, containers: [pinned], rule: worker }).state).toBe("done");
    });

    it("waits for the old migrator to stop", () => {
      const fresh = { id: "new", image, status: "Up 3 seconds" };
      expect(rolloutProgress({ ...base, containers: [fresh, old], rule: migrator }).state).toBe("waiting");
      expect(rolloutProgress({ ...base, containers: [fresh], rule: migrator }).state).toBe("done");
    });

    it("ignores a container that already ran the tag before the deploy", () => {
      const same = { id: "old", image, status: "Up 9 minutes (healthy)" };
      expect(rolloutProgress({ ...base, containers: [same], rule: worker }).state).toBe("waiting");
    });

    it("fails when Swarm rolls this update back", () => {
      const rolledBack = { ...base, containers: [old], updateState: "rollback_completed 2026-10-21 04:10:00" };
      expect(rolloutProgress({ ...rolledBack, rule: worker })).toEqual({ state: "failed", reason: "Swarm reports rollback_completed" });
      // An earlier release's rollback is no reason to fail this one.
      expect(rolloutProgress({ ...rolledBack, previousUpdateState: rolledBack.updateState, rule: worker }).state).toBe("waiting");
    });
  });
});
