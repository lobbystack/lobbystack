import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import { writePrivateJson } from "./private-artifact";

it("writes owner-only, non-overwritable JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "private-artifact-test-"));
  const file = join(directory, "nested", "evidence.json");
  try {
    await writePrivateJson(file, { status: "passed" });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readFile(file, "utf8")).toBe('{\n  "status": "passed"\n}\n');
    await expect(writePrivateJson(file, { status: "failed" })).rejects.toMatchObject({ code: "EEXIST" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
