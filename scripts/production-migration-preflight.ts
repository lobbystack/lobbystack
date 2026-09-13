import { auditSnapshot, writePrivateArtifact, type AuditResult } from "./migration/production-snapshot-audit.ts";

const args = new Map(process.argv.slice(2).filter((value) => value.startsWith("--")).map((value) => {
  const index = value.indexOf("=");
  return [value.slice(2, index === -1 ? undefined : index), index === -1 ? "" : value.slice(index + 1)];
}));

function required(name: string): string {
  const value = args.get(name);
  if (!value) throw new Error(`Missing --${name}=...`);
  return value;
}

async function main(): Promise<void> {
  if (args.has("apply")) throw new Error("Apply is unsupported. This command is an audit only and is not production certified.");
  const artifact = args.get("detailed-artifact");
  let result: AuditResult;
  try {
    result = await auditSnapshot({
      exportRoot: required("export"),
      archivePath: required("archive"),
      expectedArchiveSha256: required("expected-archive-sha256"),
      manifestPath: required("manifest"),
      expectedManifestSha256: required("expected-manifest-sha256"),
      runId: required("run-id"),
      sourceDeployment: required("source-deployment"),
      targetEnvironment: required("target-environment"),
      targetEnvironmentIdentity: required("target-environment-identity"),
    });
  } catch {
    result = { ready: false, archiveSha256MatchesExpected: false, manifestSha256MatchesExpected: false, unpackedContentMatchesManifest: false, archiveProvenance: "not-established-by-hash", issues: [{ code: "UNEXPECTED_PREFLIGHT_ERROR" }], tables: [] };
  }
  if (artifact) await writePrivateArtifact(artifact, result);
  const codes = result.issues.reduce<Record<string, number>>((counts, issue) => ({ ...counts, [issue.code]: (counts[issue.code] ?? 0) + 1 }), {});
  console.log(JSON.stringify({
    status: result.ready ? "blocked_pending_human_production_certification" : "blocked",
    apply: "unsupported",
    productionCertified: false,
    archiveSha256MatchesExpected: result.archiveSha256MatchesExpected,
    unpackedContentMatchesReviewedManifest: result.unpackedContentMatchesManifest,
    archiveProvenance: "Archive SHA-256 verifies only the supplied archive bytes; it does not prove this unpacked export came from that archive.",
    tables: result.tables.map(({ name, disposition, rows, known }) => ({ name, disposition, rows, known })),
    issueCounts: codes,
    detailedArtifactWritten: Boolean(artifact),
  }, null, 2));
  if (!result.ready) process.exitCode = 1;
}

void main().catch(() => { console.error("Preflight failed; no detailed artifact was written."); process.exitCode = 1; });
