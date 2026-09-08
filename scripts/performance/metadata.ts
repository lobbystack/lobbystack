import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

export async function benchmarkMetadata(environment: "local" | "staging") {
  const digest = createHash("sha256");
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean).sort();
  for (const file of files) {
    digest.update(file).update("\0");
    try { digest.update(await readFile(file)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; digest.update("[deleted]"); }
    digest.update("\0");
  }
  return {
    schemaVersion: 1, createdAt: new Date().toISOString(), environment,
    node: process.version,
    packageManager: JSON.parse(await readFile("package.json", "utf8")).packageManager as string,
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceSha256: digest.digest("hex"),
    lockfileSha256: createHash("sha256").update(await readFile("pnpm-lock.yaml")).digest("hex"),
    // Set to the actual deployment ID for remote runs; a local commit is not a deployed release.
    deploymentId: process.env.PERFORMANCE_DEPLOYMENT_ID ?? null,
  };
}
