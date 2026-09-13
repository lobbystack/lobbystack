import { createHash } from "node:crypto";
import { createReadStream, type Dirent } from "node:fs";
import { chmod, lstat, open, readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

export type ManifestDisposition = "import" | "exclude";

export interface SnapshotManifest {
  version: 1;
  reviewed: { by: string; at: string };
  runId: string;
  source: { deployment: string };
  target: { environment: string; identity: string };
  tables: Array<{ name: string; disposition: ManifestDisposition; reason?: string }>;
  inventory: Array<{ path: string; size: number; sha256: string }>;
}

export interface AuditOptions {
  exportRoot: string;
  archivePath: string;
  expectedArchiveSha256: string;
  manifestPath: string;
  expectedManifestSha256: string;
  runId: string;
  sourceDeployment: string;
  targetEnvironment: string;
  targetEnvironmentIdentity: string;
}

export interface AuditIssue {
  code: string;
  table?: string;
  line?: number;
  field?: string;
  detail?: string;
}

export interface TableReport {
  name: string;
  disposition: ManifestDisposition;
  rows: number;
  known: boolean;
}

export interface AuditResult {
  ready: boolean;
  archiveSha256MatchesExpected: boolean;
  manifestSha256MatchesExpected: boolean;
  unpackedContentMatchesManifest: boolean;
  archiveProvenance: "not-established-by-hash";
  issues: AuditIssue[];
  tables: TableReport[];
}

type Row = Record<string, unknown>;
type Reference = { field: string; table: string; required?: boolean };
type ValidatedManifest = {
  runId?: string | undefined;
  sourceDeployment?: string | undefined;
  targetEnvironment?: string | undefined;
  targetIdentity?: string | undefined;
  tables: Array<{ name: string; disposition: ManifestDisposition; reason?: string }>;
  inventory: Array<{ path: string; size: number; sha256: string }>;
  inventoryValid: boolean;
};

// These are the source fields read by the development-only importer. The audit
// intentionally checks them before any future production apply path is considered.
const REFERENCES: Record<string, Reference[]> = {
  users: [{ field: "activeBusinessId", table: "businesses" }],
  authAccounts: [{ field: "userId", table: "users", required: true }],
  business_memberships: [{ field: "businessId", table: "businesses", required: true }, { field: "userId", table: "users", required: true }],
  staff: [{ field: "businessId", table: "businesses", required: true }],
  services: [{ field: "businessId", table: "businesses", required: true }],
  staff_service_assignments: [{ field: "businessId", table: "businesses", required: true }, { field: "staffId", table: "staff", required: true }, { field: "serviceId", table: "services", required: true }],
  business_hours: [{ field: "businessId", table: "businesses", required: true }],
  phone_numbers: [{ field: "businessId", table: "businesses", required: true }],
  receptionist_profiles: [{ field: "businessId", table: "businesses", required: true }],
  contacts: [{ field: "businessId", table: "businesses", required: true }],
  conversations: [{ field: "businessId", table: "businesses", required: true }, { field: "contactId", table: "contacts" }],
  conversation_sessions: [{ field: "businessId", table: "businesses", required: true }, { field: "conversationId", table: "conversations", required: true }, { field: "callId", table: "calls" }],
  messages: [{ field: "businessId", table: "businesses", required: true }, { field: "conversationId", table: "conversations", required: true }, { field: "conversationSessionId", table: "conversation_sessions" }],
  calls: [{ field: "businessId", table: "businesses", required: true }, { field: "conversationId", table: "conversations" }, { field: "contactId", table: "contacts" }, { field: "recordingStorageId", table: "_storage" }, { field: "prospectDemoId", table: "prospect_demos" }],
  inbox_items: [{ field: "businessId", table: "businesses", required: true }],
  transcripts: [{ field: "businessId", table: "businesses", required: true }, { field: "callId", table: "calls", required: true }],
  appointments: [{ field: "businessId", table: "businesses", required: true }, { field: "contactId", table: "contacts", required: true }, { field: "staffId", table: "staff", required: true }, { field: "serviceId", table: "services", required: true }],
  knowledge_documents: [{ field: "businessId", table: "businesses", required: true }, { field: "storageId", table: "_storage" }, { field: "extractedTextStorageId", table: "_storage" }],
  knowledge_snippets: [{ field: "businessId", table: "businesses", required: true }],
  agent_rules: [{ field: "businessId", table: "businesses", required: true }],
  website_ingestion_jobs: [{ field: "businessId", table: "businesses", required: true }, { field: "rootDocumentId", table: "knowledge_documents" }],
  business_context_snapshots: [{ field: "businessId", table: "businesses", required: true }],
  notifications: [{ field: "businessId", table: "businesses", required: true }],
  operator_notification_preferences: [{ field: "businessId", table: "businesses", required: true }, { field: "userId", table: "users", required: true }],
  operator_notification_deliveries: [{ field: "businessId", table: "businesses", required: true }, { field: "userId", table: "users", required: true }],
  billing_accounts: [{ field: "businessId", table: "businesses", required: true }],
  billing_transactions: [{ field: "businessId", table: "businesses", required: true }],
  billing_usage_events: [{ field: "businessId", table: "businesses", required: true }],
  billing_usage_months: [{ field: "businessId", table: "businesses", required: true }],
  unit_economics_events: [{ field: "businessId", table: "businesses", required: true }, { field: "callId", table: "calls" }, { field: "conversationId", table: "conversations" }],
  unit_economics_rollups: [{ field: "businessId", table: "businesses", required: true }],
  business_invitations: [{ field: "businessId", table: "businesses", required: true }, { field: "invitedByUserId", table: "users", required: true }, { field: "acceptedByUserId", table: "users" }],
  prospect_demos: [{ field: "businessId", table: "businesses", required: true }, { field: "operatorUserId", table: "users", required: true }, { field: "websiteIngestionJobId", table: "website_ingestion_jobs" }, { field: "claimedByUserId", table: "users" }],
  onboarding_phone_verifications: [{ field: "businessId", table: "businesses", required: true }, { field: "userId", table: "users", required: true }],
  onboarding_number_claim_events: [{ field: "businessId", table: "businesses", required: true }, { field: "userId", table: "users", required: true }, { field: "phoneNumberId", table: "phone_numbers" }, { field: "replacingPhoneNumberId", table: "phone_numbers" }],
  sms_consent_events: [{ field: "businessId", table: "businesses", required: true }, { field: "contactId", table: "contacts" }],
  feedback_submissions: [{ field: "userId", table: "users", required: true }, { field: "businessId", table: "businesses" }],
  audit_logs: [{ field: "businessId", table: "businesses", required: true }, { field: "actorUserId", table: "users" }],
  appointment_change_verifications: [{ field: "businessId", table: "businesses", required: true }, { field: "appointmentId", table: "appointments", required: true }, { field: "contactId", table: "contacts", required: true }],
  closures: [{ field: "businessId", table: "businesses", required: true }],
  calendar_connections: [{ field: "businessId", table: "businesses", required: true }, { field: "ownerUserId", table: "users", required: true }, { field: "staffId", table: "staff" }],
  calendar_busy_blocks: [{ field: "businessId", table: "businesses", required: true }, { field: "connectionId", table: "calendar_connections", required: true }, { field: "staffId", table: "staff" }],
};

const RESERVED_SNAPSHOT_TABLES = new Set(["_tables", "_components"]);
const KNOWN_TABLES = new Set([...Object.keys(REFERENCES), "businesses", "authSessions", "telemetry_outbox", "_storage", ...RESERVED_SNAPSHOT_TABLES]);

function validSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function storageChecksum(value: unknown): string | undefined {
  if (validSha256(value)) return value.toLowerCase();
  if (typeof value !== "string" || !/^[A-Za-z0-9+/_-]{43}=?$/.test(value)) return undefined;
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(44, "=");
  const decoded = Buffer.from(normalized, "base64");
  return decoded.length === 32 ? decoded.toString("hex") : undefined;
}

function normalizedEmail(value: unknown): string | undefined {
  const candidate = text(value);
  return candidate && /^[^\s@]+@[^\s@]+$/.test(candidate) ? candidate.toLowerCase() : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function validDate(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function inventory(root: string, issues: AuditIssue[]): Promise<Array<{ path: string; size: number; sha256: string }>> {
  const files: Array<{ path: string; size: number; sha256: string }> = [];
  async function visit(directory: string): Promise<void> {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true, encoding: "utf8" }); } catch { add(issues, { code: "SNAPSHOT_DIRECTORY_IO_ERROR" }); return; }
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const relativePath = relative(root, absolute).split(sep).join("/");
      let entryStat;
      try { entryStat = await lstat(absolute); } catch { add(issues, { code: "SNAPSHOT_FILE_IO_ERROR", detail: relativePath }); continue; }
      if (entryStat.isSymbolicLink()) { add(issues, { code: "SYMBOLIC_LINK_IN_SNAPSHOT", detail: relativePath }); continue; }
      if (entryStat.isDirectory()) await visit(absolute);
      else if (entryStat.isFile()) {
        try { files.push({ path: relativePath, size: entryStat.size, sha256: await hashFile(absolute) }); } catch { add(issues, { code: "SNAPSHOT_FILE_IO_ERROR", detail: relativePath }); }
      } else add(issues, { code: "NON_REGULAR_FILE_IN_SNAPSHOT", detail: relativePath });
    }
  }
  await visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function add(issues: AuditIssue[], issue: AuditIssue): void {
  issues.push(issue);
}

function validateManifest(value: unknown, issues: AuditIssue[]): ValidatedManifest {
  const manifest: ValidatedManifest = { tables: [], inventory: [], inventoryValid: true };
  const root = record(value);
  if (!root) { add(issues, { code: "INVALID_MANIFEST_ROOT" }); return { ...manifest, inventoryValid: false }; }
  if (root.version !== 1) add(issues, { code: "INVALID_MANIFEST_VERSION" });
  const reviewed = record(root.reviewed);
  if (!reviewed || !text(reviewed.by)) add(issues, { code: "INVALID_MANIFEST_REVIEWER" });
  if (!reviewed || !validDate(reviewed.at)) add(issues, { code: "INVALID_MANIFEST_REVIEW_DATE" });
  manifest.runId = text(root.runId);
  if (!manifest.runId) add(issues, { code: "INVALID_MANIFEST_RUN_ID" });
  const source = record(root.source);
  manifest.sourceDeployment = source && text(source.deployment);
  if (!manifest.sourceDeployment) add(issues, { code: "INVALID_MANIFEST_SOURCE" });
  const target = record(root.target);
  manifest.targetEnvironment = target && text(target.environment);
  manifest.targetIdentity = target && text(target.identity);
  if (!manifest.targetEnvironment || !manifest.targetIdentity) add(issues, { code: "INVALID_MANIFEST_TARGET" });
  if (!Array.isArray(root.tables)) add(issues, { code: "INVALID_MANIFEST_TABLES" });
  else for (const candidate of root.tables) {
    const table = record(candidate);
    const name = table && text(table.name);
    if (!table || !name || name.includes("/") || name === "." || name === "..") { add(issues, { code: "INVALID_MANIFEST_TABLE" }); continue; }
    if (table.disposition !== "import" && table.disposition !== "exclude") { add(issues, { code: "INVALID_MANIFEST_TABLE_DISPOSITION", table: name }); continue; }
    const reason = text(table.reason);
    if (table.disposition === "exclude" && !reason) { add(issues, { code: "INVALID_MANIFEST_TABLE_EXCLUSION", table: name }); continue; }
    manifest.tables.push({ name, disposition: table.disposition, ...(reason ? { reason } : {}) });
  }
  if (!Array.isArray(root.inventory)) { add(issues, { code: "INVALID_MANIFEST_INVENTORY" }); manifest.inventoryValid = false; }
  else for (const candidate of root.inventory) {
    const file = record(candidate);
    const path = file && text(file.path);
    const size = file?.size;
    if (!file || !path || path.startsWith("/") || path.split("/").includes("..") || !Number.isSafeInteger(size) || typeof size !== "number" || size < 0 || !validSha256(file.sha256)) {
      add(issues, { code: "INVALID_MANIFEST_INVENTORY_ENTRY" }); manifest.inventoryValid = false; continue;
    }
    manifest.inventory.push({ path, size, sha256: file.sha256.toLowerCase() });
  }
  return manifest;
}

function readRows(content: string, table: string, issues: AuditIssue[]): Array<{ row: Row; line: number }> {
  const rows: Array<{ row: Row; line: number }> = [];
  for (const [index, line] of content.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) add(issues, { code: "INVALID_ROW", table, line: index + 1 });
      else rows.push({ row: parsed as Row, line: index + 1 });
    } catch {
      add(issues, { code: "INVALID_JSONL", table, line: index + 1 });
    }
  }
  return rows;
}

export async function auditSnapshot(options: AuditOptions): Promise<AuditResult> {
  const issues: AuditIssue[] = [];
  let archiveSha256MatchesExpected = false;
  let manifestSha256MatchesExpected = false;
  let unpackedContentMatchesManifest = false;
  const manifest: ValidatedManifest = { tables: [], inventory: [], inventoryValid: false };
  let tableReports: TableReport[] = [];
  try {
    if (!validSha256(options.expectedArchiveSha256)) add(issues, { code: "INVALID_EXPECTED_ARCHIVE_SHA256" });
    else {
      try { archiveSha256MatchesExpected = await hashFile(options.archivePath) === options.expectedArchiveSha256.toLowerCase(); } catch { add(issues, { code: "ARCHIVE_IO_ERROR" }); }
      if (!archiveSha256MatchesExpected) add(issues, { code: "ARCHIVE_SHA256_MISMATCH" });
    }
    let manifestBytes: Buffer | undefined;
    if (!validSha256(options.expectedManifestSha256)) add(issues, { code: "INVALID_EXPECTED_MANIFEST_SHA256" });
    else {
      try { manifestSha256MatchesExpected = await hashFile(options.manifestPath) === options.expectedManifestSha256.toLowerCase(); } catch { add(issues, { code: "MANIFEST_IO_ERROR" }); }
      if (!manifestSha256MatchesExpected) add(issues, { code: "MANIFEST_SHA256_MISMATCH" });
    }
    try {
      const manifestStat = await stat(options.manifestPath);
      if (!manifestStat.isFile()) add(issues, { code: "MANIFEST_NOT_REGULAR_FILE" });
      else if (manifestStat.size > 16 * 1024 * 1024) add(issues, { code: "MANIFEST_TOO_LARGE" });
      else manifestBytes = await readFile(options.manifestPath);
    } catch { add(issues, { code: "MANIFEST_IO_ERROR" }); }
    let parsed: unknown;
    if (manifestBytes) {
      try { parsed = JSON.parse(manifestBytes.toString("utf8")); } catch { add(issues, { code: "INVALID_MANIFEST_JSON" }); }
    }
    const validated = validateManifest(parsed, issues);
    Object.assign(manifest, validated);
    if (manifest.runId !== options.runId) add(issues, { code: "RUN_ID_MISMATCH" });
    if (manifest.sourceDeployment !== options.sourceDeployment) add(issues, { code: "SOURCE_DEPLOYMENT_MISMATCH" });
    if (manifest.targetEnvironment !== options.targetEnvironment || manifest.targetIdentity !== options.targetEnvironmentIdentity) add(issues, { code: "TARGET_IDENTITY_MISMATCH" });

    let exportRoot: string | undefined;
    let rootEntries: Dirent<string>[] | undefined;
    try {
      exportRoot = resolve(options.exportRoot);
      const rootStat = await lstat(exportRoot);
      if (rootStat.isSymbolicLink()) add(issues, { code: "SYMBOLIC_LINK_EXPORT_ROOT" });
      else if (!rootStat.isDirectory()) add(issues, { code: "EXPORT_NOT_DIRECTORY" });
      else rootEntries = await readdir(exportRoot, { withFileTypes: true, encoding: "utf8" });
    } catch { add(issues, { code: "EXPORT_IO_ERROR" }); }
    if (!exportRoot || !rootEntries) return { ready: false, archiveSha256MatchesExpected, manifestSha256MatchesExpected, unpackedContentMatchesManifest: false, archiveProvenance: "not-established-by-hash", issues, tables: [] };

    const actualInventory = await inventory(exportRoot, issues);
  const expectedInventory = new Map<string, { size: number; sha256: string }>();
  for (const file of manifest.inventory) {
    if (expectedInventory.has(file.path)) {
      add(issues, { code: "DUPLICATE_MANIFEST_INVENTORY_PATH" });
      continue;
    }
    expectedInventory.set(file.path, { size: file.size, sha256: file.sha256 });
  }
  for (const file of actualInventory) {
    const expected = expectedInventory.get(file.path);
    if (!expected) add(issues, { code: "UNMANIFESTED_FILE", detail: file.path });
    else if (expected.size !== file.size || expected.sha256 !== file.sha256) add(issues, { code: "INVENTORY_DIGEST_MISMATCH", detail: file.path });
  }
  for (const file of expectedInventory.keys()) if (!actualInventory.some((actual) => actual.path === file)) add(issues, { code: "MISSING_MANIFESTED_FILE", detail: file });
  unpackedContentMatchesManifest = manifest.inventoryValid && !issues.some((issue) => ["DUPLICATE_MANIFEST_INVENTORY_PATH", "UNMANIFESTED_FILE", "INVENTORY_DIGEST_MISMATCH", "MISSING_MANIFESTED_FILE", "SNAPSHOT_DIRECTORY_IO_ERROR", "SNAPSHOT_FILE_IO_ERROR", "SYMBOLIC_LINK_IN_SNAPSHOT", "NON_REGULAR_FILE_IN_SNAPSHOT"].includes(issue.code));

  const sourceTables = rootEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const manifestTables = new Map<string, { disposition: ManifestDisposition; reason?: string }>();
  for (const table of manifest.tables) {
    if (manifestTables.has(table.name)) add(issues, { code: "DUPLICATE_MANIFEST_TABLE", table: table.name });
    else manifestTables.set(table.name, { disposition: table.disposition, ...(table.reason ? { reason: table.reason } : {}) });
  }
  for (const requiredTable of ["users", "businesses"]) {
    if (!sourceTables.includes(requiredTable)) add(issues, { code: "REQUIRED_SOURCE_TABLE_MISSING", table: requiredTable });
    else if (manifestTables.get(requiredTable)?.disposition !== "import") add(issues, { code: "REQUIRED_SOURCE_TABLE_NOT_IMPORT", table: requiredTable });
  }
  for (const name of sourceTables) {
    const planned = manifestTables.get(name);
    if (!planned) add(issues, { code: "UNDECLARED_SOURCE_TABLE", table: name });
    else if (RESERVED_SNAPSHOT_TABLES.has(name) && planned.disposition !== "exclude") add(issues, { code: "RESERVED_SNAPSHOT_TABLE_NOT_EXCLUDED", table: name });
    else if (!KNOWN_TABLES.has(name) && (planned.disposition !== "exclude" || !text(planned.reason))) add(issues, { code: "UNKNOWN_TABLE_NOT_REVIEWED_EXCLUDED", table: name });
  }
  for (const [name] of manifestTables) if (!sourceTables.includes(name)) add(issues, { code: "MANIFEST_TABLE_NOT_IN_EXPORT", table: name });

  const tableRows = new Map<string, Array<{ row: Row; line: number }>>();
  for (const table of sourceTables) {
    const plan = manifestTables.get(table);
    if (plan?.disposition === "exclude" && (!RESERVED_SNAPSHOT_TABLES.has(table) || table === "_components")) continue;
    const documents = join(exportRoot, table, "documents.jsonl");
    try {
      const documentStat = await lstat(documents);
      if (documentStat.isSymbolicLink()) { add(issues, { code: "SYMBOLIC_LINK_DOCUMENTS", table }); continue; }
      if (!documentStat.isFile()) { add(issues, { code: "DOCUMENTS_NOT_REGULAR_FILE", table }); continue; }
      tableRows.set(table, readRows(await readFile(documents, "utf8"), table, issues));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") { add(issues, { code: "SNAPSHOT_DOCUMENTS_IO_ERROR", table }); continue; }
      if (table !== "_storage") add(issues, { code: "MISSING_DOCUMENTS_JSONL", table });
    }
  }

  const idsByTable = new Map<string, Set<string>>();
  const allIds = new Set<string>();
  const emails = new Set<string>();
  const accounts = new Set<string>();
  const userEmailsById = new Map<string, string>();
  for (const [table, rows] of tableRows) {
    const ids = new Set<string>();
    idsByTable.set(table, ids);
    for (const { row, line } of rows) {
      if (RESERVED_SNAPSHOT_TABLES.has(table)) continue;
      const id = text(row._id);
      if (!id) add(issues, { code: "MISSING_ID", table, line });
      else if (ids.has(id) || allIds.has(id)) add(issues, { code: "DUPLICATE_ID", table, line });
      else { ids.add(id); allIds.add(id); }
      if (table === "users") {
        const sourceEmail = text(row.email);
        const email = normalizedEmail(sourceEmail);
        if (!email) add(issues, { code: "INVALID_USER_EMAIL", table, line, field: "email" });
        if (email && emails.has(email)) add(issues, { code: "DUPLICATE_EMAIL", table, line, field: "email" });
        else if (email) emails.add(email);
        if (id && email && !userEmailsById.has(id)) userEmailsById.set(id, email);
      }
    }
  }

  for (const [table, references] of Object.entries(REFERENCES)) {
    for (const { row, line } of tableRows.get(table) ?? []) for (const reference of references) {
      const value = text(row[reference.field]);
      if (!value) {
        if (reference.required) add(issues, { code: "MISSING_REFERENCE", table, line, field: reference.field });
      } else {
        if (manifestTables.get(table)?.disposition === "import" && manifestTables.get(reference.table)?.disposition !== "import") add(issues, { code: "REFERENCE_TARGET_NOT_IMPORT", table, line, field: reference.field });
        else if (!idsByTable.get(reference.table)?.has(value)) add(issues, { code: "UNRESOLVED_REFERENCE", table, line, field: reference.field });
      }
    }
  }

  for (const { row, line } of tableRows.get("inbox_items") ?? []) {
    if (text(row.kind) === "voice_message" && text(row.relatedId)) {
      if (manifestTables.get("inbox_items")?.disposition === "import" && manifestTables.get("calls")?.disposition !== "import") add(issues, { code: "REFERENCE_TARGET_NOT_IMPORT", table: "inbox_items", line, field: "relatedId" });
      else if (!idsByTable.get("calls")?.has(text(row.relatedId)!)) add(issues, { code: "UNRESOLVED_REFERENCE", table: "inbox_items", line, field: "relatedId" });
    }
  }

  const passwordHashesByUser = new Set<string>();
  for (const { row, line } of tableRows.get("authAccounts") ?? []) {
    const provider = text(row.provider);
    const normalizedProvider = provider?.toLowerCase();
    const providerAccountId = text(row.providerAccountId);
    const normalizedAccountEmail = normalizedEmail(providerAccountId);
    if (!provider || !normalizedProvider) add(issues, { code: "INVALID_AUTH_PROVIDER", table: "authAccounts", line, field: "provider" });
    else if (provider !== normalizedProvider) add(issues, { code: "AUTH_PROVIDER_NOT_NORMALIZED", table: "authAccounts", line, field: "provider" });
    if (!providerAccountId) add(issues, { code: "INVALID_AUTH_PROVIDER_ACCOUNT_ID", table: "authAccounts", line, field: "providerAccountId" });
    else if (normalizedAccountEmail && providerAccountId !== normalizedAccountEmail) add(issues, { code: "AUTH_PROVIDER_ACCOUNT_ID_NOT_NORMALIZED", table: "authAccounts", line, field: "providerAccountId" });
    else if (normalizedProvider === "password" && !normalizedAccountEmail) add(issues, { code: "AUTH_PROVIDER_ACCOUNT_ID_UNVERIFIABLE", table: "authAccounts", line, field: "providerAccountId" });
    if (normalizedProvider && providerAccountId) {
      const account = `${normalizedProvider}\u0000${normalizedAccountEmail ?? providerAccountId}`;
      if (accounts.has(account)) add(issues, { code: "DUPLICATE_ACCOUNT", table: "authAccounts", line });
      else accounts.add(account);
    }
    const userId = text(row.userId);
    if (normalizedAccountEmail && userId && userEmailsById.get(userId) && userEmailsById.get(userId) !== normalizedAccountEmail) add(issues, { code: "AUTH_ACCOUNT_EMAIL_MISMATCH", table: "authAccounts", line, field: "providerAccountId" });
    if (normalizedProvider === "password") {
      const passwordHash = text(row.secret);
      if (!passwordHash) add(issues, { code: "PASSWORD_HASH_UNVERIFIABLE", table: "authAccounts", line, field: "secret" });
      else if (userId) {
        if (passwordHashesByUser.has(userId)) add(issues, { code: "MULTIPLE_PASSWORD_HASHES_FOR_USER", table: "authAccounts", line, field: "userId" });
        else passwordHashesByUser.add(userId);
      }
    }
  }

  const storageRows = tableRows.get("_storage") ?? [];
  const storageFiles = actualInventory.filter((file) => file.path.startsWith("_storage/") && !file.path.endsWith("/documents.jsonl"));
  const storageFilesById = new Map<string, typeof storageFiles>();
  for (const file of storageFiles) {
    const id = basename(file.path).split(".", 1)[0]!;
    storageFilesById.set(id, [...(storageFilesById.get(id) ?? []), file]);
  }
  const declaredStorageIds = new Set<string>();
  for (const { row, line } of storageRows) {
    const id = text(row._id);
    if (!id) continue;
    declaredStorageIds.add(id);
    const files = storageFilesById.get(id) ?? [];
    if (files.length !== 1) { add(issues, { code: files.length ? "AMBIGUOUS_STORAGE_FILE" : "MISSING_STORAGE_FILE", table: "_storage", line }); continue; }
    const file = files[0]!;
    if (typeof row.size !== "number" || !Number.isSafeInteger(row.size) || row.size < 0) add(issues, { code: "STORAGE_METADATA_UNVERIFIABLE", table: "_storage", line, field: "size" });
    else if (row.size !== file.size) add(issues, { code: "STORAGE_SIZE_MISMATCH", table: "_storage", line, field: "size" });
    const checksum = storageChecksum(row.sha256);
    if (!checksum) add(issues, { code: "STORAGE_METADATA_UNVERIFIABLE", table: "_storage", line, field: "sha256" });
    else if (checksum !== file.sha256) add(issues, { code: "STORAGE_SHA256_MISMATCH", table: "_storage", line, field: "sha256" });
  }
  for (const [id, files] of storageFilesById) if (!declaredStorageIds.has(id)) for (const _file of files) add(issues, { code: "UNDECLARED_STORAGE_FILE", table: "_storage" });

  tableReports = [...manifestTables.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, plan]) => ({ name, disposition: plan.disposition, rows: tableRows.get(name)?.length ?? 0, known: KNOWN_TABLES.has(name) }));
  } catch {
    add(issues, { code: "UNEXPECTED_AUDIT_ERROR" });
  }
  return { ready: issues.length === 0, archiveSha256MatchesExpected, manifestSha256MatchesExpected, unpackedContentMatchesManifest, archiveProvenance: "not-established-by-hash", issues, tables: tableReports };
}

export async function writePrivateArtifact(path: string, value: unknown): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await chmod(path, 0o600);
  } finally {
    await handle.close();
  }
}
