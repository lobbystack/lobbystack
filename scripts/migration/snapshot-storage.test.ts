import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fileDigest, inspectStorage, transferLocalObjects, verifyLocalObjects } from "./snapshot-storage.ts";

it("verifies bytes, supports identical retries, and refuses changed targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "migration-storage-test-"));
  try {
    await mkdir(join(root, "source", "_storage"), { recursive: true });
    await mkdir(join(root, "target"));
    await writeFile(join(root, "source", "_storage", "file1.txt"), "hello");
    const sha256 = await fileDigest(join(root, "source", "_storage", "file1.txt"));
    const files = await inspectStorage(join(root, "source"), [{ _id: "file1", _creationTime: 0, size: 5, sha256 }]);
    const objects = files.map((file) => ({ ...file, key: "tenant/knowledge/file1", contentType: "text/plain" }));
    await transferLocalObjects(join(root, "source"), join(root, "target"), objects);
    await verifyLocalObjects(join(root, "target"), objects);
    await transferLocalObjects(join(root, "source"), join(root, "target"), objects);
    expect(await readFile(join(root, "target", objects[0]!.key), "utf8")).toBe("hello");
    await writeFile(join(root, "target", objects[0]!.key), "other");
    await expect(transferLocalObjects(join(root, "source"), join(root, "target"), objects)).rejects.toThrow("TARGET_OBJECT_INTEGRITY_MISMATCH");
    await expect(verifyLocalObjects(join(root, "target"), objects)).rejects.toThrow("TARGET_OBJECT_INTEGRITY_MISMATCH");
    await expect(transferLocalObjects(join(root, "source"), join(root, "target"), [{ ...objects[0]!, key: "../escape" }])).rejects.toThrow("UNSAFE_OBJECT_PATH");
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("rejects symlinks and unaccounted storage files", async () => {
  const root = await mkdtemp(join(tmpdir(), "migration-storage-test-"));
  try {
    await mkdir(join(root, "_storage"));
    await writeFile(join(root, "external"), "private");
    await symlink(join(root, "external"), join(root, "_storage", "file1.txt"));
    await expect(inspectStorage(root, [{ _id: "file1", _creationTime: 0, size: 7, sha256: "0".repeat(64) }])).rejects.toThrow("UNSAFE_STORAGE_FILE");
    await expect(inspectStorage(root, [])).rejects.toThrow("UNACCOUNTED_STORAGE_FILE");
  } finally { await rm(root, { recursive: true, force: true }); }
});
