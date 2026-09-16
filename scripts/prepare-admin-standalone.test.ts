import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { prepareAdminStandalone } from "./prepare-admin-standalone.ts";

it("merges assets into pre-existing standalone directories without nesting", async () => {
  const root = await mkdtemp(join(tmpdir(), "standalone-assets-"));
  try {
    await mkdir(join(root, "public/locales/fr"), { recursive: true });
    await mkdir(join(root, ".next/static"), { recursive: true });
    await mkdir(join(root, ".next/standalone/apps/admin/public/embed"), { recursive: true });
    await writeFile(join(root, "public/locales/fr/common.json"), '{"fixture":true}');
    await writeFile(join(root, ".next/static/chunk.js"), "fixture");
    await prepareAdminStandalone(root);
    await prepareAdminStandalone(root);
    expect(await readFile(join(root, ".next/standalone/apps/admin/public/locales/fr/common.json"), "utf8")).toBe('{"fixture":true}');
    expect(await readFile(join(root, ".next/standalone/apps/admin/.next/static/chunk.js"), "utf8")).toBe("fixture");
  } finally { await rm(root, { recursive: true, force: true }); }
});
