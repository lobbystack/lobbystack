import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, stat, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { auditSnapshot, writePrivateArtifact, type SnapshotManifest } from "./production-snapshot-audit.ts";

const roots: string[] = [];
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

async function fixture(files: Record<string, string>): Promise<{ root: string; archive: string; manifest: string; options: Omit<Parameters<typeof auditSnapshot>[0], "manifestPath" | "expectedManifestSha256"> }> {
  const root = await mkdtemp(join(tmpdir(), "production-preflight-"));
  roots.push(root);
  const exportRoot = join(root, "unpacked");
  for (const [path, value] of Object.entries(files)) { await mkdir(join(exportRoot, path, ".."), { recursive: true }); await writeFile(join(exportRoot, path), value); }
  const archive = join(root, "snapshot.tar.zst");
  await writeFile(archive, "archive-bytes");
  const inventory = await Promise.all(Object.entries(files).map(async ([path]) => { const bytes = await readFile(join(exportRoot, path)); return { path, size: bytes.length, sha256: hash(bytes) }; }));
  const manifestObject: SnapshotManifest = { version: 1, reviewed: { by: "release-engineer", at: "2026-09-12T00:00:00Z" }, runId: "production-run-20260912", source: { deployment: "prod:legacy" }, target: { environment: "production", identity: "postgres-production-a" }, tables: Object.keys(files).filter((path) => path.endsWith("/documents.jsonl")).map((path) => ({ name: path.split("/", 1)[0]!, disposition: "import" as const })), inventory };
  const manifest = join(root, "reviewed-manifest.json");
  await writeFile(manifest, JSON.stringify(manifestObject));
  return { root, archive, manifest, options: { exportRoot, archivePath: archive, expectedArchiveSha256: hash("archive-bytes"), runId: manifestObject.runId, sourceDeployment: manifestObject.source.deployment, targetEnvironment: manifestObject.target.environment, targetEnvironmentIdentity: manifestObject.target.identity } };
}

afterEach(async () => { await Promise.all(roots.splice(0).map(async (root) => { const { rm } = await import("node:fs/promises"); await rm(root, { recursive: true, force: true }); })); });

describe("production snapshot audit", () => {
  it("binds every unpacked file to the reviewed manifest without asserting archive provenance", async () => {
    const input = await fixture({ "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n', "businesses/documents.jsonl": '{"_id":"business-1"}\n' });
    const expectedManifestSha256 = hash(await readFile(input.manifest));
    const result = await auditSnapshot({ ...input.options, manifestPath: input.manifest, expectedManifestSha256 });
    expect(result.ready).toBe(true);
    expect(result.unpackedContentMatchesManifest).toBe(true);
    expect(result.archiveProvenance).toBe("not-established-by-hash");
    await writeFile(join(input.root, "unpacked/users/documents.jsonl"), '{"_id":"user-1","email":"changed@example.test"}\n');
    const changed = await auditSnapshot({ ...input.options, manifestPath: input.manifest, expectedManifestSha256 });
    expect(changed.issues.map((issue) => issue.code)).toContain("INVENTORY_DIGEST_MISMATCH");
  });

  it("blocks duplicate identities, unresolved source references, and mismatched storage metadata", async () => {
    const input = await fixture({
      "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n{"_id":"user-2","email":"OPERATOR@example.test"}\n{"_id":"user-1","email":"other@example.test"}\n',
      "businesses/documents.jsonl": '{"_id":"business-1"}\n',
      "authAccounts/documents.jsonl": '{"_id":"account-1","userId":"missing-user","provider":"password","providerAccountId":"account"}\n{"_id":"account-2","userId":"user-1","provider":"password","providerAccountId":"account"}\n',
      "calls/documents.jsonl": '{"_id":"call-1","businessId":"business-1","recordingStorageId":"storage-1"}\n',
      "_storage/documents.jsonl": '{"_id":"storage-1","size":99,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}\n',
      "_storage/storage-1.bin": "actual bytes",
    });
    const result = await auditSnapshot({ ...input.options, manifestPath: input.manifest, expectedManifestSha256: hash(await readFile(input.manifest)) });
    expect(result.ready).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["DUPLICATE_ID", "DUPLICATE_EMAIL", "DUPLICATE_ACCOUNT", "UNRESOLVED_REFERENCE", "STORAGE_SIZE_MISMATCH", "STORAGE_SHA256_MISMATCH"]));
  });

  it("requires an explicit reviewed exclusion for unknown source tables and creates private non-overwriting artifacts", async () => {
    const input = await fixture({ "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n', "businesses/documents.jsonl": '{"_id":"business-1"}\n', "unknown_table/documents.jsonl": '{"_id":"unknown-1"}\n' });
    const result = await auditSnapshot({ ...input.options, manifestPath: input.manifest, expectedManifestSha256: hash(await readFile(input.manifest)) });
    expect(result.issues.map((issue) => issue.code)).toContain("UNKNOWN_TABLE_NOT_REVIEWED_EXCLUDED");
    const manifest = JSON.parse(await readFile(input.manifest, "utf8")) as SnapshotManifest;
    manifest.tables = manifest.tables.map((table) => table.name === "unknown_table" ? { ...table, disposition: "exclude", reason: "Reviewed unsupported legacy component state" } : table);
    await writeFile(input.manifest, JSON.stringify(manifest));
    const reviewedExclusion = await auditSnapshot({ ...input.options, manifestPath: input.manifest, expectedManifestSha256: hash(await readFile(input.manifest)) });
    expect(reviewedExclusion.ready).toBe(true);
    const artifact = join(input.root, "audit.json");
    await writePrivateArtifact(artifact, reviewedExclusion);
    expect((await stat(artifact)).mode & 0o777).toBe(0o600);
    await expect(writePrivateArtifact(artifact, reviewedExclusion)).rejects.toMatchObject({ code: "EEXIST" });
    await chmod(artifact, 0o600);
  });

  it.each([
    ["null root", null, "INVALID_MANIFEST_ROOT"],
    ["primitive root", "not a manifest", "INVALID_MANIFEST_ROOT"],
    ["array root", [], "INVALID_MANIFEST_ROOT"],
    ["nonobject inventory entry", { inventory: [null, "wrong", []] }, "INVALID_MANIFEST_INVENTORY_ENTRY"],
    ["nonobject table entry", { tables: [null, "wrong", []] }, "INVALID_MANIFEST_TABLE"],
    ["invalid review date", { reviewed: { by: "release-engineer", at: "not-a-date" } }, "INVALID_MANIFEST_REVIEW_DATE"],
    ["invalid disposition", { tables: [{ name: "users", disposition: "apply" }] }, "INVALID_MANIFEST_TABLE_DISPOSITION"],
  ])("returns a structured failure for %s and permits a private artifact", async (_name, mutation, expectedIssue) => {
    const input = await fixture({ "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n', "businesses/documents.jsonl": '{"_id":"business-1"}\n' });
    const base = JSON.parse(await readFile(input.manifest, "utf8")) as Record<string, unknown>;
    const malformed = mutation === null || typeof mutation !== "object" || Array.isArray(mutation) ? mutation : { ...base, ...mutation };
    await writeFile(input.manifest, JSON.stringify(malformed));
    const result = await auditSnapshot({ ...input.options, manifestPath: input.manifest, expectedManifestSha256: hash(await readFile(input.manifest)) });
    expect(result.ready).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(expectedIssue);
    const artifact = join(input.root, `malformed-${expectedIssue}.json`);
    await writePrivateArtifact(artifact, result);
    expect((await stat(artifact)).mode & 0o777).toBe(0o600);
  });

  it("fails closed when required users or businesses tables are absent and when input files cannot be read", async () => {
    const missingTables = await fixture({ "_storage/documents.jsonl": "" });
    const absent = await auditSnapshot({ ...missingTables.options, manifestPath: missingTables.manifest, expectedManifestSha256: hash(await readFile(missingTables.manifest)) });
    expect(absent.issues.filter((issue) => issue.code === "REQUIRED_SOURCE_TABLE_MISSING").map((issue) => issue.table)).toEqual(["users", "businesses"]);
    const inaccessible = await fixture({ "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n', "businesses/documents.jsonl": '{"_id":"business-1"}\n' });
    const result = await auditSnapshot({ ...inaccessible.options, archivePath: join(inaccessible.root, "missing-archive"), manifestPath: join(inaccessible.root, "missing-manifest"), expectedManifestSha256: "a".repeat(64) });
    expect(result.ready).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["ARCHIVE_IO_ERROR", "MANIFEST_IO_ERROR", "INVALID_MANIFEST_ROOT"]));
    await writePrivateArtifact(join(inaccessible.root, "io-failure.json"), result);
  });

  it("recognizes Convex reserved metadata tables without treating metadata rows as customer documents", async () => {
    const input = await fixture({
      "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n',
      "businesses/documents.jsonl": '{"_id":"business-1"}\n',
      "_tables/documents.jsonl": '{"name":"users","isSystem":false}\n',
    });
    await mkdir(join(input.root, "unpacked/_components"));
    const manifest = JSON.parse(await readFile(input.manifest, "utf8")) as SnapshotManifest;
    manifest.tables = manifest.tables.map((table) => table.name === "_tables" ? { ...table, disposition: "exclude", reason: "Convex export metadata" } : table);
    manifest.tables.push({ name: "_components", disposition: "exclude", reason: "Convex component metadata" });
    await writeFile(input.manifest, JSON.stringify(manifest));
    const result = await auditSnapshot({ ...input.options, manifestPath: input.manifest, expectedManifestSha256: hash(await readFile(input.manifest)) });
    expect(result.ready).toBe(true);
    expect(result.tables.find((table) => table.name === "_tables")?.rows).toBe(1);
    expect(result.issues.map((issue) => issue.code)).not.toContain("MISSING_ID");
  });

  it("checks inbox relatedId only for voice messages", async () => {
    const nonVoice = await fixture({
      "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n',
      "businesses/documents.jsonl": '{"_id":"business-1"}\n',
      "inbox_items/documents.jsonl": '{"_id":"inbox-1","businessId":"business-1","kind":"appointment_reminder","relatedId":"not-a-call"}\n',
    });
    const unrelated = await auditSnapshot({ ...nonVoice.options, manifestPath: nonVoice.manifest, expectedManifestSha256: hash(await readFile(nonVoice.manifest)) });
    expect(unrelated.ready).toBe(true);
    const voice = await fixture({
      "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n',
      "businesses/documents.jsonl": '{"_id":"business-1"}\n',
      "inbox_items/documents.jsonl": '{"_id":"inbox-1","businessId":"business-1","kind":"voice_message","relatedId":"not-a-call"}\n',
    });
    const related = await auditSnapshot({ ...voice.options, manifestPath: voice.manifest, expectedManifestSha256: hash(await readFile(voice.manifest)) });
    expect(related.issues.map((issue) => issue.code)).toContain("REFERENCE_TARGET_NOT_IMPORT");
  });

  it("requires verifiable storage metadata and accepts Convex export base64 checksums", async () => {
    const bytes = "actual bytes";
    const base64Checksum = Buffer.from(hash(bytes), "hex").toString("base64");
    const verified = await fixture({
      "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n',
      "businesses/documents.jsonl": '{"_id":"business-1"}\n',
      "_storage/documents.jsonl": `{"_id":"storage-1","size":${Buffer.byteLength(bytes)},"sha256":"${base64Checksum}"}\n`,
      "_storage/storage-1.bin": bytes,
    });
    const verifiedResult = await auditSnapshot({ ...verified.options, manifestPath: verified.manifest, expectedManifestSha256: hash(await readFile(verified.manifest)) });
    expect(verifiedResult.ready).toBe(true);
    const missing = await fixture({
      "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n',
      "businesses/documents.jsonl": '{"_id":"business-1"}\n',
      "_storage/documents.jsonl": '{"_id":"storage-1"}\n',
      "_storage/storage-1.bin": bytes,
    });
    const missingResult = await auditSnapshot({ ...missing.options, manifestPath: missing.manifest, expectedManifestSha256: hash(await readFile(missing.manifest)) });
    expect(missingResult.issues.filter((issue) => issue.code === "STORAGE_METADATA_UNVERIFIABLE").map((issue) => issue.field)).toEqual(["size", "sha256"]);
  });

  it("audits password-account collisions and normalized auth identities without exposing values", async () => {
    const input = await fixture({
      "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n',
      "businesses/documents.jsonl": '{"_id":"business-1"}\n',
      "authAccounts/documents.jsonl": '{"_id":"account-1","userId":"user-1","provider":"Password","providerAccountId":"OPERATOR@example.test","secret":"hash-one"}\n{"_id":"account-2","userId":"user-1","provider":"password","providerAccountId":"other@example.test","secret":"hash-two"}\n',
    });
    const result = await auditSnapshot({ ...input.options, manifestPath: input.manifest, expectedManifestSha256: hash(await readFile(input.manifest)) });
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["AUTH_PROVIDER_NOT_NORMALIZED", "AUTH_PROVIDER_ACCOUNT_ID_NOT_NORMALIZED", "AUTH_ACCOUNT_EMAIL_MISMATCH", "MULTIPLE_PASSWORD_HASHES_FOR_USER"]));
    expect(JSON.stringify(result)).not.toContain("operator@example.test");
  });

  it("blocks imported source references whose target table is reviewed for exclusion", async () => {
    const input = await fixture({
      "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n',
      "businesses/documents.jsonl": '{"_id":"business-1"}\n',
      "contacts/documents.jsonl": '{"_id":"contact-1","businessId":"business-1"}\n',
      "calls/documents.jsonl": '{"_id":"call-1","businessId":"business-1","contactId":"contact-1"}\n',
    });
    const manifest = JSON.parse(await readFile(input.manifest, "utf8")) as SnapshotManifest;
    manifest.tables = manifest.tables.map((table) => table.name === "contacts" ? { ...table, disposition: "exclude", reason: "Reviewed exclusion" } : table);
    await writeFile(input.manifest, JSON.stringify(manifest));
    const result = await auditSnapshot({ ...input.options, manifestPath: input.manifest, expectedManifestSha256: hash(await readFile(input.manifest)) });
    expect(result.issues.map((issue) => issue.code)).toContain("REFERENCE_TARGET_NOT_IMPORT");
  });

  it("does not follow a symlinked documents file", async () => {
    const input = await fixture({
      "users/documents.jsonl": '{"_id":"user-1","email":"operator@example.test"}\n',
      "businesses/documents.jsonl": '{"_id":"business-1"}\n',
    });
    const documents = join(input.root, "unpacked/users/documents.jsonl");
    const target = join(input.root, "private-documents.jsonl");
    await writeFile(target, '{"_id":"private-user","email":"private@example.test"}\n');
    await rm(documents);
    await symlink(target, documents);
    const result = await auditSnapshot({ ...input.options, manifestPath: input.manifest, expectedManifestSha256: hash(await readFile(input.manifest)) });
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["SYMBOLIC_LINK_IN_SNAPSHOT", "SYMBOLIC_LINK_DOCUMENTS"]));
    expect(JSON.stringify(result)).not.toContain("private@example.test");
  });
});
