import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { uploadCreateRequestSchema } from "@lobbystack/contracts";
import { assertPublicHttpUrl } from "@lobbystack/providers";
import { redactTelemetryProperties } from "@lobbystack/telemetry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if ([".next", "dist", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name)) files.push(path);
  }
  return files;
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const adminFiles = await sourceFiles(join(root, "apps/admin"));
  const browserFiles: string[] = [];
  for (const path of adminFiles) {
    const source = await readFile(path, "utf8");
    assert(!source.includes("@lobbystack/worker") && !source.includes("apps/worker/src"), `Admin imports worker implementation: ${relative(root, path)}`);
    if (source.includes('"use client"')) browserFiles.push(path);
  }
  for (const path of browserFiles) {
    const source = await readFile(path, "utf8");
    assert(!source.includes("@opentelemetry/sdk-node") && !source.includes("@lobbystack/telemetry/node"), `Browser source imports Node telemetry: ${relative(root, path)}`);
  }

  const middleware = await readFile(join(root, "apps/admin/middleware.ts"), "utf8");
  for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "form-action 'self'"]) assert(middleware.includes(directive), `Admin CSP is missing ${directive}.`);
  assert(!middleware.includes("'unsafe-eval'"), "Admin CSP permits unsafe eval.");

  for (const scriptName of ["replacement-backup.sh", "replacement-restore.sh", "replacement-restore-drill.sh"]) {
    const script = await readFile(join(root, "scripts", scriptName), "utf8");
    assert(script.includes("REPLACEMENT_COMPOSE_PROJECT") && script.includes("--project-name"), `${scriptName} can target an ambient Compose project.`);
  }

  for (const unsafeUrl of ["http://127.0.0.1", "http://10.0.0.1", "http://169.254.169.254/latest", "http://[::1]", "ftp://example.com"]) {
    let rejected = false;
    try { await assertPublicHttpUrl(unsafeUrl); } catch { rejected = true; }
    assert(rejected, `SSRF protection accepted ${unsafeUrl}.`);
  }
  let privateResolutionRejected = false;
  try { await assertPublicHttpUrl("https://public.example", async () => [{ address: "192.168.1.10" }]); } catch { privateResolutionRejected = true; }
  assert(privateResolutionRejected, "SSRF protection accepted a hostname resolving to a private address.");

  assert(!uploadCreateRequestSchema.safeParse({ businessId: "not-a-uuid", purpose: "knowledge", fileName: "x.pdf", contentType: "application/pdf", length: 10, checksum: "hash" }).success, "Upload validation accepted an invalid business id.");
  assert(!uploadCreateRequestSchema.safeParse({ businessId: "00000000-0000-0000-0000-000000000000", purpose: "knowledge", fileName: "x.exe", contentType: "application/x-msdownload", length: 10, checksum: "hash" }).success, "Upload validation accepted a disallowed content type.");
  assert(!uploadCreateRequestSchema.safeParse({ businessId: "00000000-0000-0000-0000-000000000000", purpose: "knowledge", fileName: "x.pdf", contentType: "application/pdf", length: 10 }).success, "Upload validation accepted a knowledge upload without a checksum.");

  const marker = "security-private-file.pdf";
  const redacted = redactTelemetryProperties({ fileName: marker, objectKey: marker, signedUrl: `https://storage.example/${marker}?X-Amz-Signature=secret-marker` });
  assert(!JSON.stringify(redacted).includes(marker) && !JSON.stringify(redacted).includes("secret-marker"), "Telemetry redaction leaked storage credentials or filenames.");

  console.log(JSON.stringify({ importBoundaries: true, csp: true, ssrf: true, uploadValidation: true, telemetryRedaction: true }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
