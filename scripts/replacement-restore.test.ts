import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const script = resolve(import.meta.dirname, "replacement-restore.sh");

// Stub docker: admin and worker are running, the target uses local storage,
// and the storage copy (the only `run` with a volume) fails when asked to.
const dockerStub = `#!/usr/bin/env bash
echo "$*" >> "$DOCKER_LOG"
case "$*" in
  *" ps --services"*) printf 'admin\\nworker\\n' ;;
  *" run "*"-v "*) [ "\${FAIL_STORAGE:-}" = 1 ] && exit 1 ;;
  *" run "*) printf local ;;
  *" exec "*) cat >/dev/null ;;
esac
exit 0
`;

async function restore(failStorage: boolean) {
  const root = await mkdtemp(join(tmpdir(), "replacement-restore-"));
  try {
    const bin = join(root, "bin");
    const backup = join(root, "backup");
    await mkdir(bin);
    await mkdir(join(backup, "storage"), { recursive: true });
    await writeFile(join(bin, "docker"), dockerStub);
    await chmod(join(bin, "docker"), 0o755);
    await writeFile(join(backup, "postgres.dump"), "dump");
    await writeFile(join(backup, "manifest.txt"), "storage_provider=local\n");
    await writeFile(join(backup, "storage.sha256"), "");
    await writeFile(join(backup, "SHA256SUMS"), `${createHash("sha256").update("dump").digest("hex")}  postgres.dump\n`);
    await writeFile(join(root, "env"), "");
    const result = spawnSync("bash", [script, backup], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        DOCKER_LOG: join(root, "docker.log"),
        FAIL_STORAGE: failStorage ? "1" : "",
        CONFIRM_REPLACEMENT_RESTORE: "1",
        REPLACEMENT_COMPOSE_PROJECT: "restore_test",
        REPLACEMENT_ENV_FILE: join(root, "env"),
      },
    });
    const starts = (await readFile(join(root, "docker.log"), "utf8")).split("\n").filter((line) => line.endsWith(" start admin worker"));
    return { status: result.status, stderr: result.stderr, starts: starts.length };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

it("keeps admin and worker stopped when the restore fails after dropping the database", async () => {
  const result = await restore(true);
  expect(result.status).not.toBe(0);
  expect(result.starts).toBe(0);
  expect(result.stderr).toContain("admin and worker stay stopped");
});

it("restarts admin and worker once after a successful restore", async () => {
  const result = await restore(false);
  expect(result.status).toBe(0);
  expect(result.starts).toBe(1);
});
