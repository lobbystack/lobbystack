import { createHash } from "node:crypto";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { getTableConfig, type AnyPgTable } from "drizzle-orm/pg-core";
import * as schema from "../../packages/db/src/schema/index.ts";

export type SourceRow = Record<string, unknown> & { _id: string; _creationTime: number };
export type Snapshot = Record<string, SourceRow[]>;
export type PlannedRow = { sourceTable: string; sourceId: string; table: string; values: Record<string, unknown>; legacyMetadata?: Record<string, unknown> };
export type StorageFile = { id: string; path: string; size: number; sha256: string };
export type PlannedObject = StorageFile & { key: string; contentType: string };
export type PlanIssue = { table: string; field?: string; code: string };
export type SnapshotPlan = {
  version: 1;
  rows: PlannedRow[];
  objects: PlannedObject[];
  issues: PlanIssue[];
  sourceCounts: Record<string, number>;
  dispositions: Record<string, { action: "import" | "rebuild" | "discard"; reason: string }>;
};

const targets: Record<string, AnyPgTable> = Object.fromEntries((Object.values(schema) as unknown[]).filter((value): value is AnyPgTable => is(value, Table)).map((table) => [getTableName(table), table]));

// Order is deliberate: parents precede children. Cyclic calls/demo links are
// applied by the transaction runner after every row has been inserted.
export const IMPORT_TABLES = [
  "users", "authAccounts", "businesses", "business_memberships", "staff", "services", "staff_service_assignments",
  "business_hours", "closures", "phone_numbers", "receptionist_profiles", "contacts", "_storage",
  "conversations", "calls", "conversation_sessions", "messages", "transcripts", "appointments",
  "knowledge_documents", "knowledge_snippets", "agent_rules", "website_ingestion_jobs", "prospect_demos", "inbox_items",
  "notifications", "operator_notification_preferences", "operator_notification_deliveries",
  "billing_accounts", "billing_transactions", "billing_usage_events", "billing_usage_months", "unit_economics_events",
  "business_invitations", "onboarding_number_claim_events", "sms_consent_events", "feedback_submissions", "audit_logs",
  "appointment_change_audit_logs", "calendar_connections", "affiliate_profiles", "affiliate_attributions", "affiliate_clicks",
  "affiliate_payout_runs", "affiliate_payout_items", "affiliate_commissions", "affiliate_voided_sources", "idempotency_keys",
] as const;

const REBUILD = new Set(["business_context_snapshots", "calendar_busy_blocks", "unit_economics_rollups", "affiliate_profile_stats", "sms_consent_states", "auth_email_claims", "user_email_claims"]);
const DISCARD = new Set([
  "_tables", "_components", "authSessions", "authRefreshTokens", "authVerificationCodes", "authVerifiers", "authRateLimits",
  "auth_email_claim_backfill_state", "pending_email_changes", "calendar_oauth_states", "call_recording_download_tokens",
  "message_attachment_download_tokens", "preview_sessions", "telemetry_outbox", "workflow_jobs",
  "onboarding_phone_verifications", "appointment_change_verifications", "conversation_ai_state", "conversation_booking_state",
]);
// Retained in the restricted migration journal, not silently thrown away or
// exposed to runtime roles. These fields have no equivalent runtime column.
const ARCHIVE_FIELDS: Record<string, string[]> = {
  users: ["signupAttribution"],
  calls: ["recordingByteLength", "recordingContentType", "recordingDurationMs", "recordingExpiresAt", "recordingRetentionStatus", "providerCallStatus", "providerCallStatusSequence", "providerCallStatusSource"],
  messages: ["contentRetentionStatus"],
  appointments: ["calendarLastSyncAttemptAt", "calendarLastSyncedAt", "calendarSyncIssueId"],
  knowledge_documents: ["importance", "section", "indexVersion", "indexedEntryId", "lastIndexedAt", "websiteIngestionJobId"],
  knowledge_snippets: ["section", "indexVersion", "indexedEntryId", "lastIndexedAt"],
  website_ingestion_jobs: ["completedAt", "crawlFinishedCount", "crawlMode", "crawlTotalCount", "depth", "fallbackTriggered", "firecrawlScrapeJobs", "lastProgressAt", "pageLimit", "providerJobId", "startedAt", "workflowId"],
  notifications: ["senderRole", "providerErrorCode", "providerRawDlrDoneDate", "providerStatus", "providerUpdatedAt"],
  operator_notification_deliveries: ["digestForDate", "providerStatus", "providerUpdatedAt", "contentRetentionStatus"],
  billing_accounts: ["activeAddons", "billingContactEmail", "billingContactName", "checkoutId", "lastSyncedAt", "polarCustomerExternalId", "cancelAtPeriodEnd", "lastWebhookEventType", "proSubscriptionPriceId", "proSubscriptionProductId"],
  billing_usage_events: ["activeAddonsAtRecordTime", "overageRecordedAt", "syncAttemptedAt", "syncedAt"],
  billing_usage_months: ["aiSmsSegmentsUsed", "alertSmsSegmentsBillableUsed", "alertSmsSegmentsIncluded", "outboundCallAttemptsBillableUsed", "outboundCallAttemptsIncluded", "voiceSecondsBillableUsed", "voiceSecondsIncluded"],
  sms_consent_events: ["disclosureText", "disclosureVersion", "userId"],
  calendar_connections: ["externalAccountEmail", "lastSyncAttemptAt", "lastSyncedAt", "selectedCalendarSummary", "syncWindowStartsAt"],
};
export const REHEARSAL_TRANSFORMATIONS = {
  archiveFields: ARCHIVE_FIELDS,
  calendar: "disconnect; retain only ciphertext digests in target journal; original ciphertext stays in source archive",
  numberClaims: "retain audit-only legacy claims in audit_logs; never replay purchase attempts",
  inbox: "resolved becomes done; expired/scrubbed content stays scrubbed; non-call linkage retained in restricted journal",
  credentials: "Lucia scrypt preserved; Better Auth credential account_id is target user UUID; legacy sessions discarded",
  knowledge: "source documents and disabled flags preserved; fresh chunks marked pending; legacy RAG identifiers archived",
  notifications: "scrubbed missing destinations stay unsendable; missing retention expiry derives from original creation + 90 days",
  calls: "missing legacy transport defaults to pstn",
  onboarding: "completed becomes complete",
} as const;
const TARGET_NAMES: Record<string, string> = { authAccounts: "accounts", _storage: "storage_objects", appointment_change_audit_logs: "audit_logs" };
const EXTRA_REFERENCES: Record<string, Record<string, string>> = {
  users: { activeBusinessId: "businesses" },
  conversation_sessions: { callId: "calls" },
  calls: { prospectDemoId: "prospect_demos", conversationId: "conversations", contactId: "contacts", recordingStorageId: "storage_objects" },
  prospect_demos: { websiteIngestionJobId: "website_ingestion_jobs" },
  knowledge_documents: { storageObjectId: "storage_objects" },
  affiliate_commissions: { payoutItemId: "affiliate_payout_items" },
};
const ALIASES: Record<string, Record<string, string>> = {
  users: { displayName: "name", phoneVerificationTime: "phoneVerifiedAt" },
  authAccounts: { secret: "password" },
  phone_numbers: { twilioPhoneSid: "providerPhoneId" },
  calls: { twilioCallSid: "providerCallId", providerCallDurationSeconds: "providerDurationSeconds", recordingStorageId: "recordingObjectId" },
  messages: { providerMessageSid: "providerMessageId" },
  appointments: { calendarExternalEventId: "calendarExternalId" },
  agent_rules: { order: "sortOrder" },
  business_invitations: { expirationTime: "expiresAt", invitedAt: "createdAt" },
  billing_accounts: { polarCustomerId: "customerId", proSubscriptionId: "subscriptionId", currentPlan: "plan" },
  billing_usage_events: { recordedAt: "createdAt" },
  affiliate_profiles: { paypalEmail: "payoutEmail" },
  affiliate_payout_items: { paypalEmail: "payoutEmail" },
  idempotency_keys: { resourceTable: "resourceType" },
  onboarding_number_claim_events: { twilioPhoneSid: "providerPhoneId" },
};

// Explicitly handled by custom transformations below, never copied blindly.
const SPECIAL: Record<string, string[]> = {
  users: ["emailVerificationTime", "authSubject"],
  authAccounts: ["provider", "providerAccountId", "emailVerified"],
  knowledge_documents: ["storageId", "extractedTextStorageId", "textContent"],
  inbox_items: ["relatedId"],
  appointment_change_audit_logs: [],
  _storage: [],
};

export function legacyUuid(id: string): string {
  const bytes = createHash("sha256").update(`convex:${id}`).digest();
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function instant(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

/** Pure compiler. It never reads env, contacts providers, modifies a DB, or
 * invents missing customer values. The returned rows contain sensitive data. */
export function compileSnapshot(snapshot: Snapshot, files: StorageFile[] = []): SnapshotPlan {
  const plan: SnapshotPlan = { version: 1, rows: [], objects: [], issues: [], sourceCounts: {}, dispositions: {} };
  const issueKeys = new Set<string>();
  const issue = (table: string, code: string, field?: string) => {
    const key = `${table}:${code}:${field ?? ""}`;
    if (!issueKeys.has(key)) { issueKeys.add(key); plan.issues.push({ table, code, ...(field ? { field } : {}) }); }
  };
  for (const table of ["users", "businesses", "authAccounts", "business_memberships", "_storage"]) {
    if (!Array.isArray(snapshot[table])) issue(table, "REQUIRED_SOURCE_TABLE_MISSING");
  }
  for (const table of ["users", "businesses"]) if (!snapshot[table]?.length) issue(table, "REQUIRED_SOURCE_TABLE_EMPTY");
  const ids = new Map<string, { table: string; row: SourceRow }>();
  for (const [table, rows] of Object.entries(snapshot)) {
    plan.sourceCounts[table] = rows.length;
    const imported = (IMPORT_TABLES as readonly string[]).includes(table);
    if (!imported && !REBUILD.has(table) && !DISCARD.has(table)) {
      if (rows.length || !["message_attachment_uploads", "platform_sms_senders", "sms_compliance_registrations", "sms_compliance_submissions"].includes(table)) issue(table, "UNCLASSIFIED_SOURCE_TABLE");
    }
    plan.dispositions[table] = { action: imported ? "import" : REBUILD.has(table) ? "rebuild" : "discard", reason: imported ? "authoritative source" : REBUILD.has(table) ? "derived state; rebuild before release" : "ephemeral legacy state; never replay automatically" };
    if (table.startsWith("_")) continue;
    for (const row of rows) {
      if (typeof row._id !== "string" || !row._id) issue(table, "MISSING_SOURCE_ID");
      else if (ids.has(row._id)) issue(table, "DUPLICATE_SOURCE_ID");
      else ids.set(row._id, { table, row });
    }
  }
  for (const row of snapshot._storage ?? []) ids.set(row._id, { table: "_storage", row });
  const ownership = new Map<string, { businessId: string; purpose: string; expiresAt?: string }>();
  for (const [table, fields, purpose] of [["calls", ["recordingStorageId"], "recording"], ["knowledge_documents", ["storageId", "extractedTextStorageId"], "knowledge"]] as const) {
    for (const row of snapshot[table] ?? []) for (const field of fields) {
      if (typeof row[field] !== "string") continue;
      const storageId = row[field] as string;
      if (typeof row.businessId !== "string") { issue(table, "STORAGE_OWNER_MISSING", field); continue; }
      const previous = ownership.get(storageId);
      if (previous && previous.businessId !== row.businessId) issue(table, "CROSS_TENANT_STORAGE_REFERENCE", field);
      else { const expiresAt = instant(row.recordingExpiresAt); ownership.set(storageId, { businessId: row.businessId, purpose, ...(expiresAt ? { expiresAt } : {}) }); }
    }
  }
  let currentBusinessId: unknown;
  const reference = (table: string, field: string, value: unknown, expected?: string): string | undefined => {
    if (value === null || value === undefined) return undefined;
    const source = typeof value === "string" ? ids.get(value) : undefined;
    if (!source || (expected && (TARGET_NAMES[source.table] ?? source.table) !== expected)) { issue(table, "UNRESOLVED_REFERENCE", field); return undefined; }
    if (currentBusinessId && source.row.businessId && currentBusinessId !== source.row.businessId) { issue(table, "CROSS_TENANT_REFERENCE", field); return undefined; }
    if (plan.dispositions[source.table]?.action !== "import") { issue(table, "REFERENCE_TO_EXCLUDED_TABLE", field); return undefined; }
    return legacyUuid(value as string);
  };

  for (const sourceTable of IMPORT_TABLES) {
    const tableName = TARGET_NAMES[sourceTable] ?? sourceTable;
    const target = targets[tableName];
    if (!target) { issue(sourceTable, "MISSING_TARGET_TABLE"); continue; }
    const columns = getTableColumns(target);
    const foreignTargets = new Map<string, string>();
    for (const foreignKey of getTableConfig(target).foreignKeys) {
      const ref = foreignKey.reference();
      if (ref.columns.length === 1) foreignTargets.set(ref.columns[0]!.name, getTableName(ref.foreignTable));
    }
    for (const row of snapshot[sourceTable] ?? []) {
      currentBusinessId = row.businessId;
      const values: Record<string, unknown> = {};
      const legacyMetadata: Record<string, unknown> = {};
      if (columns.id) values.id = legacyUuid(row._id);
      if (columns.legacyConvexId) values.legacy_convex_id = row._id;
      const created = instant(row.createdAt ?? row._creationTime);
      const updated = instant(row.updatedAt ?? row.createdAt ?? row._creationTime);
      if (!created || !updated) issue(sourceTable, "INVALID_TIMESTAMP", "_creationTime");
      values.created_at = created;
      values.updated_at = updated;

      // Appointment audit rows retain all historical details, even fields the
      // current UI does not render. They are not folded into generic prose.
      if (sourceTable === "appointment_change_audit_logs") {
        values.business_id = reference(sourceTable, "businessId", row.businessId, "businesses");
        values.entity_type = "appointment";
        values.entity_id = reference(sourceTable, "appointmentId", row.appointmentId, "appointments");
        values.event_type = "appointment.legacy_change";
        values.payload = { ...row, migrationSource: sourceTable };
      } else if (sourceTable === "_storage") {
        const file = files.find((candidate) => candidate.id === row._id);
        if (!file) { issue(sourceTable, "STORAGE_FILE_MISSING"); continue; }
        const owner = ownership.get(row._id);
        const contentType = typeof row.contentType === "string" ? row.contentType : "application/octet-stream";
        const key = owner ? `${legacyUuid(owner.businessId)}/${owner.purpose}/${row._id}` : `migration-archive/${row._id}`;
        plan.objects.push({ ...file, key, contentType });
        // Unreferenced files are retained and verified in the private object
        // archive; never assign them to an invented tenant.
        if (!owner) continue;
        values.business_id = reference(sourceTable, "businessId", owner.businessId, "businesses");
        values.object_key = key; values.purpose = owner.purpose;
        values.file_name = row._id; values.content_type = contentType;
        values.content_length = file.size; values.checksum = file.sha256;
        values.status = "ready"; values.retention_until = owner.expiresAt ?? null;
      } else {
        for (const [key, value] of Object.entries(row)) {
          if (["_id", "_creationTime", "createdAt", "updatedAt"].includes(key) || SPECIAL[sourceTable]?.includes(key)) continue;
          if (ARCHIVE_FIELDS[sourceTable]?.includes(key)) { legacyMetadata[key] = value; continue; }
          const property = ALIASES[sourceTable]?.[key] ?? key;
          const column = columns[property];
          if (!column) { issue(sourceTable, "UNMAPPED_SOURCE_FIELD", key); continue; }
          let converted = value;
          if (column.columnType === "PgUUID") {
            const expected = sourceTable === "idempotency_keys" && key === "resourceId" && typeof row.resourceTable === "string"
              ? TARGET_NAMES[row.resourceTable] ?? row.resourceTable
              : EXTRA_REFERENCES[sourceTable]?.[key] ?? foreignTargets.get(column.name);
            converted = reference(sourceTable, key, value, expected);
          }
          else if (column.dataType === "date") {
            converted = value === null ? null : instant(value);
            if (converted === undefined) issue(sourceTable, "INVALID_TIMESTAMP", key);
          } else if (column.dataType === "number" && (typeof value !== "number" || !Number.isFinite(value))) issue(sourceTable, "INVALID_NUMBER", key);
          else if (column.dataType === "boolean" && typeof value !== "boolean") issue(sourceTable, "INVALID_BOOLEAN", key);
          else if (column.dataType === "string" && typeof value !== "string" && value !== null) issue(sourceTable, "INVALID_STRING", key);
          if (converted !== undefined) values[column.name] = converted;
        }
      }
      if (sourceTable === "users") {
        if (typeof row.email !== "string" || !row.email.trim()) issue(sourceTable, "MISSING_EMAIL");
        else { values.email = row.email.trim(); values.normalized_email = row.email.trim().toLowerCase(); }
        values.email_verified = row.emailVerificationTime !== undefined;
        const accounts = (snapshot.authAccounts ?? []).filter((account) => account.userId === row._id && account.provider === "password");
        if (accounts.length > 1) issue(sourceTable, "MULTIPLE_PASSWORD_ACCOUNTS");
        if (accounts[0]) { values.password_hash = accounts[0].secret; values.password_algorithm = "convex-scrypt"; }
      }
      if (sourceTable === "authAccounts") {
        if (row.provider !== "password" || typeof row.secret !== "string" || !row.secret) issue(sourceTable, "UNSUPPORTED_CREDENTIAL");
        else if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(row.secret)) issue(sourceTable, "INVALID_LEGACY_SCRYPT_FORMAT");
        values.provider_id = "credential";
        // Better Auth credential account IDs are user IDs, not login emails.
        values.account_id = reference(sourceTable, "userId", row.userId, "users");
      }
      if (sourceTable === "businesses" && row.onboardingStage === "completed") values.onboarding_stage = "complete";
      if (sourceTable === "business_invitations" && typeof row.email === "string") values.normalized_email = row.email.trim().toLowerCase();
      if (sourceTable === "inbox_items" && row.relatedId) {
        if (row.kind === "voice_message") values.related_call_id = reference(sourceTable, "relatedId", row.relatedId, "calls");
        else { legacyMetadata.relatedId = row.relatedId; legacyMetadata.kind = row.kind; }
      }
      if (sourceTable === "inbox_items" && ["expired", "scrubbed"].includes(String(row.contentRetentionStatus))) {
        values.content_retention_status = "scrubbed";
        values.title = "Expired voice message";
        values.body = "[Expired by 365-day retention policy]";
      }
      if (sourceTable === "inbox_items" && row.status === "resolved") { values.status = "done"; legacyMetadata.status = row.status; }
      if (sourceTable === "calls" && row.transport === undefined) values.transport = "pstn";
      if (sourceTable === "calendar_connections") {
        // Rehearsals MUST NOT carry working production OAuth credentials into
        // a worker. Retain ciphertext privately; operator reconnect is a gate.
        if (typeof row.encryptedAccessToken === "string") legacyMetadata.encryptedAccessTokenSha256 = createHash("sha256").update(row.encryptedAccessToken).digest("hex");
        if (typeof row.encryptedRefreshToken === "string") legacyMetadata.encryptedRefreshTokenSha256 = createHash("sha256").update(row.encryptedRefreshToken).digest("hex");
        values.encrypted_access_token = null; values.encrypted_refresh_token = null;
        values.status = "disconnected";
      }
      if (sourceTable === "operator_notification_deliveries") {
        // Historical scrubbed deliveries may have no destination. They are not
        // eligible to send again; preserve original status in the journal.
        if (values.destination === undefined) { values.destination = ""; legacyMetadata.originalStatus = row.status; values.status = "cancelled"; }
        if (values.content_expires_at === undefined && created) values.content_expires_at = new Date(Date.parse(created) + 90 * 86400000).toISOString();
      }
      if (sourceTable === "onboarding_number_claim_events") {
        // Legacy audit-only claims cannot be resumed as new purchase requests.
        // Preserve the whole record and import into the existing audit ledger.
        plan.rows.push({ sourceTable, sourceId: row._id, table: "audit_logs", values: {
          id: legacyUuid(row._id), legacy_convex_id: row._id, business_id: values.business_id,
          actor_user_id: values.user_id, event_type: "phone.legacy_claim", entity_type: "phone_number",
          entity_id: values.phone_number_id ?? null, payload: row, created_at: created, updated_at: updated,
        } });
        continue;
      }
      if (sourceTable === "billing_accounts") values.source = "polar";
      if (sourceTable === "knowledge_documents") {
        values.storage_object_id = reference(sourceTable, "storageId", row.storageId ?? row.extractedTextStorageId, "storage_objects");
        if (typeof row.textContent === "string" && row.textContent.length) {
          plan.rows.push({ sourceTable, sourceId: row._id, table: "knowledge_chunks", values: {
            id: legacyUuid(`${row._id}:chunk:0`), business_id: values.business_id, document_id: values.id, sequence: 0,
            content: row.textContent, content_hash: createHash("sha256").update(row.textContent).digest("hex"),
            embedding_status: "pending", embedding_fingerprint: null, created_at: created, updated_at: updated,
          } });
        }
      }
      for (const column of Object.values(columns)) {
        if (column.notNull && !column.hasDefault && values[column.name] === undefined) issue(sourceTable, "MISSING_REQUIRED_TARGET_FIELD", column.name);
      }
      plan.rows.push({ sourceTable, sourceId: row._id, table: tableName, values, legacyMetadata });
    }
  }
  return plan;
}

/** Independent accounting against source identities. Extra chunk rows cannot
 * disguise a missing source document, and an archived orphan file must exist
 * in the transfer manifest even when it has no runtime storage row. */
export function assertSourceAccounting(snapshot: Snapshot, plan: SnapshotPlan): void {
  for (const [table, source] of Object.entries(snapshot)) {
    if (plan.sourceCounts[table] !== source.length || !plan.dispositions[table]) throw new Error(`SOURCE_COUNT_MISMATCH:${table}`);
    if (plan.dispositions[table]!.action !== "import") continue;
    if (table === "_storage") {
      const expected = new Set(source.map((row) => row._id));
      if (expected.size !== source.length || plan.objects.length !== source.length || plan.objects.some((object) => !expected.delete(object.id)) || expected.size) throw new Error("SOURCE_STORAGE_ACCOUNTING_MISMATCH");
      continue;
    }
    const target = table === "onboarding_number_claim_events" ? "audit_logs" : TARGET_NAMES[table] ?? table;
    const rows = plan.rows.filter((row) => row.sourceTable === table && row.table === target);
    const expected = new Set(source.map((row) => row._id));
    if (expected.size !== source.length || rows.length !== source.length || rows.some((row) => !expected.delete(row.sourceId)) || expected.size) throw new Error(`SOURCE_ROW_ACCOUNTING_MISMATCH:${table}`);
  }
  for (const row of plan.rows) {
    if (!snapshot[row.sourceTable]?.some((source) => source._id === row.sourceId) || plan.dispositions[row.sourceTable]?.action !== "import") throw new Error(`UNEXPLAINED_TARGET_ROW:${row.table}`);
  }
}
