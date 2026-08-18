import "dotenv/config";

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import { createDatabaseClient } from "@lobbystack/db";
import { S3StorageProvider } from "../packages/providers/src/storage/s3.ts";

type LegacyRow = Record<string, unknown> & { _id: string; _creationTime?: number };

const DEV_DEPLOYMENT = "dev:valiant-ibis-521";
const SOURCE_ARG = process.argv.find((value) => value.startsWith("--source-deployment="))?.slice("--source-deployment=".length);
const EXPORT_ARG = process.argv.find((value) => value.startsWith("--export="))?.slice("--export=".length);
const DRY_RUN = process.argv.includes("--dry-run");

if (SOURCE_ARG !== DEV_DEPLOYMENT) {
  throw new Error(`Refusing migration: pass --source-deployment=${DEV_DEPLOYMENT}. Production deployments are never accepted.`);
}
if (!EXPORT_ARG) {
  throw new Error("Usage: pnpm convex:dev:migrate -- --export=/path/to/unpacked --source-deployment=dev:valiant-ibis-521 [--dry-run]");
}

const exportRoot = resolve(EXPORT_ARG);
if (exportRoot.includes("determined-reindeer-80") || /(^|[\\/])prod(uction)?([\\/]|$)/i.test(exportRoot)) {
  throw new Error(`Refusing migration from a production-looking path: ${exportRoot}`);
}

function rows(table: string): LegacyRow[] {
  const file = join(exportRoot, table, "documents.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as LegacyRow);
}

function text(value: unknown, fallback?: string): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback?: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback?: boolean): boolean | undefined {
  return typeof value === "boolean" ? value : fallback;
}

function date(value: unknown, fallback?: Date): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function created(row: LegacyRow): Date {
  return date(row._creationTime) ?? new Date();
}

function updated(row: LegacyRow): Date {
  return date(row.updatedAt) ?? created(row);
}

function json(value: unknown, fallback: unknown = null): unknown {
  return value === undefined ? fallback : value;
}

function uuidFor(legacyId: string): string {
  const bytes = createHash("sha256").update(`convex:${legacyId}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function slug(value: string | undefined, id: string): string {
  const base = (value ?? `legacy-${id}`).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || `legacy-${id}`;
  return base;
}

function onboardingStage(value: unknown): string {
  const stage = text(value, "create_business")!;
  return stage === "completed" ? "complete" : stage;
}

function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mapRows(input: LegacyRow[]): Map<string, string> {
  return new Map(input.map((row) => [row._id, uuidFor(row._id)]));
}

function required(map: Map<string, string>, value: unknown, owner: string): string | undefined {
  const id = typeof value === "string" ? map.get(value) : undefined;
  if (!id) console.warn(`Skipping ${owner}: missing referenced legacy id ${String(value)}`);
  return id;
}

type DbClient = Awaited<ReturnType<ReturnType<typeof createDatabaseClient>["pool"]["connect"]>>;

async function upsert(client: DbClient, table: string, values: Record<string, unknown>, conflict: string[], updates?: string[]): Promise<void> {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const columns = entries.map(([key]) => `"${key}"`);
  const params = entries.map(([, value]) => Array.isArray(value) || (value !== null && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) ? JSON.stringify(value) : value);
  const placeholders = params.map((_, index) => `$${index + 1}`);
  const updateColumns = (updates ?? entries.map(([key]) => key)).filter((key) => !conflict.includes(key));
  const action = updateColumns.length
    ? `DO UPDATE SET ${updateColumns.map((key) => `"${key}" = EXCLUDED."${key}"`).join(", ")}`
    : "DO NOTHING";
  try {
    await client.query(`INSERT INTO public."${table}" (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (${conflict.map((key) => `"${key}"`).join(", ")}) ${action}`, params);
  } catch (error) {
    throw new Error(`Import failed for ${table} (${String(values.id ?? values.legacy_convex_id ?? "unknown")}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  if (!existsSync(join(exportRoot, "users", "documents.jsonl")) || !existsSync(join(exportRoot, "businesses", "documents.jsonl"))) {
    throw new Error(`Export directory does not look like a Convex snapshot: ${exportRoot}`);
  }

  const all = {
    users: rows("users"),
    authAccounts: rows("authAccounts"),
    authSessions: rows("authSessions"),
    businesses: rows("businesses"),
    memberships: rows("business_memberships"),
    staff: rows("staff"),
    services: rows("services"),
    assignments: rows("staff_service_assignments"),
    hours: rows("business_hours"),
    phoneNumbers: rows("phone_numbers"),
    receptionist: rows("receptionist_profiles"),
    contacts: rows("contacts"),
    conversations: rows("conversations"),
    conversationSessions: rows("conversation_sessions"),
    messages: rows("messages"),
    calls: rows("calls"),
    transcripts: rows("transcripts"),
    appointments: rows("appointments"),
    knowledgeDocuments: rows("knowledge_documents"),
    knowledgeSnippets: rows("knowledge_snippets"),
    agentRules: rows("agent_rules"),
    websiteJobs: rows("website_ingestion_jobs"),
    contextSnapshots: rows("business_context_snapshots"),
    notifications: rows("notifications"),
    notificationPreferences: rows("operator_notification_preferences"),
    notificationDeliveries: rows("operator_notification_deliveries"),
    billingAccounts: rows("billing_accounts"),
    billingTransactions: rows("billing_transactions"),
    usageEvents: rows("billing_usage_events"),
    usageMonths: rows("billing_usage_months"),
    unitEconomics: rows("unit_economics_events"),
    unitRollups: rows("unit_economics_rollups"),
    invitations: rows("business_invitations"),
    prospectDemos: rows("prospect_demos"),
    onboardingVerifications: rows("onboarding_phone_verifications"),
    numberClaims: rows("onboarding_number_claim_events"),
    smsConsent: rows("sms_consent_events"),
    feedback: rows("feedback_submissions"),
    auditLogs: rows("audit_logs"),
    appointmentVerifications: rows("appointment_change_verifications"),
    closures: rows("closures"),
    calendarConnections: rows("calendar_connections"),
    calendarBusyBlocks: rows("calendar_busy_blocks"),
    storage: rows("_storage"),
  };

  const ids = {
    users: mapRows(all.users),
    businesses: mapRows(all.businesses),
    memberships: mapRows(all.memberships),
    staff: mapRows(all.staff),
    services: mapRows(all.services),
    assignments: mapRows(all.assignments),
    hours: mapRows(all.hours),
    phoneNumbers: mapRows(all.phoneNumbers),
    receptionist: mapRows(all.receptionist),
    contacts: mapRows(all.contacts),
    conversations: mapRows(all.conversations),
    conversationSessions: mapRows(all.conversationSessions),
    messages: mapRows(all.messages),
    calls: mapRows(all.calls),
    transcripts: mapRows(all.transcripts),
    appointments: mapRows(all.appointments),
    knowledgeDocuments: mapRows(all.knowledgeDocuments),
    knowledgeSnippets: mapRows(all.knowledgeSnippets),
    agentRules: mapRows(all.agentRules),
    websiteJobs: mapRows(all.websiteJobs),
    contextSnapshots: mapRows(all.contextSnapshots),
    notifications: mapRows(all.notifications),
    notificationPreferences: mapRows(all.notificationPreferences),
    notificationDeliveries: mapRows(all.notificationDeliveries),
    billingAccounts: mapRows(all.billingAccounts),
    billingTransactions: mapRows(all.billingTransactions),
    usageEvents: mapRows(all.usageEvents),
    usageMonths: mapRows(all.usageMonths),
    unitEconomics: mapRows(all.unitEconomics),
    unitRollups: mapRows(all.unitRollups),
    invitations: mapRows(all.invitations),
    prospectDemos: mapRows(all.prospectDemos),
    onboardingVerifications: mapRows(all.onboardingVerifications),
    numberClaims: mapRows(all.numberClaims),
    smsConsent: mapRows(all.smsConsent),
    feedback: mapRows(all.feedback),
    auditLogs: mapRows(all.auditLogs),
    appointmentVerifications: mapRows(all.appointmentVerifications),
    closures: mapRows(all.closures),
    calendarConnections: mapRows(all.calendarConnections),
    calendarBusyBlocks: mapRows(all.calendarBusyBlocks),
    storage: mapRows(all.storage),
  };

  const storageRefs = new Map<string, { businessId: string; purpose: string; expiresAt?: Date }>();
  for (const row of all.calls) {
    const storageId = text(row.recordingStorageId);
    const businessId = required(ids.businesses, row.businessId, `call ${row._id}`);
    if (storageId && businessId) storageRefs.set(storageId, { businessId, purpose: "recording", expiresAt: date(row.recordingExpiresAt) });
  }
  for (const row of all.knowledgeDocuments) {
    const businessId = required(ids.businesses, row.businessId, `knowledge document ${row._id}`);
    for (const storageId of [text(row.storageId), text(row.extractedTextStorageId)]) {
      if (storageId && businessId && !storageRefs.has(storageId)) storageRefs.set(storageId, { businessId, purpose: "knowledge" });
    }
  }

  const client = createDatabaseClient("lobbystack_migrator");
  const counts: Record<string, number> = {};
  const count = (table: string) => { counts[table] = (counts[table] ?? 0) + 1; };
  const db = await client.pool.connect();
  const uploaded: Array<{ key: string; file: string; contentType: string }> = [];
  try {
    await db.query("BEGIN");

    for (const row of all.users) {
      const id = ids.users.get(row._id)!;
      const account = all.authAccounts.find((candidate) => candidate.userId === row._id && candidate.provider === "password");
      const email = text(row.email, text(account?.providerAccountId, `${row._id}@legacy.invalid`))!;
      await upsert(db, "users", {
        id, legacy_convex_id: row._id, name: text(row.displayName, text(row.name, email.split("@")[0])), email,
        normalized_email: email.toLowerCase().trim(), email_verified: Boolean(row.emailVerificationTime), image: text(row.image), phone: text(row.phone),
        phone_verified_at: date(row.phoneVerificationTime), password_hash: text(account?.secret), password_algorithm: account?.secret ? "convex-scrypt" : undefined,
        platform_role: text(row.platformRole, "operator"), active_business_id: row.activeBusinessId ? ids.businesses.get(String(row.activeBusinessId)) : undefined,
        preferred_locale: text(row.preferredLocale, "en"), created_at: created(row), updated_at: updated(row),
      }, ["legacy_convex_id"]);
      count("users");
      if (account) {
        await upsert(db, "accounts", { id: uuidFor(account._id), user_id: id, provider_id: "credential", account_id: id, password: text(account.secret), created_at: created(account), updated_at: created(account) }, ["id"]);
        count("accounts");
      }
    }

    for (const row of all.businesses) {
      await upsert(db, "businesses", {
        id: ids.businesses.get(row._id)!, legacy_convex_id: row._id, slug: slug(text(row.slug), row._id), name: text(row.name, `Legacy business ${row._id}`)!,
        timezone: text(row.timezone, "UTC"), default_locale: text(row.defaultLocale, "en"), business_type: text(row.businessType, "general"),
        deployment_mode: text(row.deploymentMode, "cloud"), status: text(row.status, "active"), website_url: text(row.websiteUrl),
        onboarding_stage: onboardingStage(row.onboardingStage), telemetry_enabled: true, created_at: created(row), updated_at: updated(row),
      }, ["legacy_convex_id"]);
      count("businesses");
    }

    for (const row of all.memberships) {
      const businessId = required(ids.businesses, row.businessId, `membership ${row._id}`);
      const userId = required(ids.users, row.userId, `membership ${row._id}`);
      if (!businessId || !userId) continue;
      await upsert(db, "business_memberships", { id: ids.memberships.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, user_id: userId, role: text(row.role, "business_member"), status: text(row.status, "active"), created_at: created(row), updated_at: updated(row) }, ["id"]);
      count("business_memberships");
    }

    for (const row of all.staff) {
      const businessId = required(ids.businesses, row.businessId, `staff ${row._id}`); if (!businessId) continue;
      await upsert(db, "staff", { id: ids.staff.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, name: text(row.name, "Staff")!, timezone: text(row.timezone, "UTC"), active: bool(row.active, true), transfer_number: text(row.transferNumber), created_at: created(row), updated_at: updated(row) }, ["id"]); count("staff");
    }
    for (const row of all.services) {
      const businessId = required(ids.businesses, row.businessId, `service ${row._id}`); if (!businessId) continue;
      await upsert(db, "services", { id: ids.services.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, name: text(row.name, "Service")!, slug: slug(text(row.slug), row._id), localized_names: json(row.localizedNames), description: text(row.description), duration_minutes: number(row.durationMinutes, 30), active: bool(row.active, true), created_at: created(row), updated_at: updated(row) }, ["id"]); count("services");
    }
    for (const row of all.assignments) {
      const businessId = required(ids.businesses, row.businessId, `assignment ${row._id}`); const staffId = required(ids.staff, row.staffId, `assignment ${row._id}`); const serviceId = required(ids.services, row.serviceId, `assignment ${row._id}`); if (!businessId || !staffId || !serviceId) continue;
      await upsert(db, "staff_service_assignments", { business_id: businessId, staff_id: staffId, service_id: serviceId, created_at: created(row), updated_at: updated(row) }, ["staff_id", "service_id"]); count("staff_service_assignments");
    }
    for (const row of all.hours) {
      const businessId = required(ids.businesses, row.businessId, `business hours ${row._id}`); if (!businessId) continue;
      await upsert(db, "business_hours", { id: ids.hours.get(row._id)!, business_id: businessId, day_of_week: number(row.dayOfWeek, 0), open_minutes: number(row.openMinutes, 0), close_minutes: number(row.closeMinutes, 1440), created_at: created(row), updated_at: updated(row) }, ["business_id", "day_of_week"]); count("business_hours");
    }
    for (const row of all.phoneNumbers) {
      const businessId = required(ids.businesses, row.businessId, `phone ${row._id}`); if (!businessId) continue;
      await upsert(db, "phone_numbers", { id: ids.phoneNumbers.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, e164: text(row.e164, `+1000000${row._id.slice(-4)}`)!, provider_phone_id: text(row.twilioPhoneSid), voice_enabled: bool(row.voiceEnabled, true), sms_enabled: bool(row.smsEnabled, true), status: text(row.status, "active"), reclaim_scheduled_at: date(row.reclaimScheduledAt), reclaim_reason: text(row.reclaimReason), voice_webhook_status: text(row.voiceWebhookStatus), sms_webhook_status: text(row.smsWebhookStatus), created_at: created(row), updated_at: updated(row) }, ["id"]); count("phone_numbers");
    }
    for (const row of all.receptionist) {
      const businessId = required(ids.businesses, row.businessId, `receptionist ${row._id}`); if (!businessId) continue;
      await upsert(db, "receptionist_profiles", { id: ids.receptionist.get(row._id)!, business_id: businessId, greeting: text(row.greeting, "Hello, how can I help?")!, tone: text(row.tone, "warm")!, summary: text(row.summary, "")!, booking_policy: text(row.bookingPolicy, "")!, voice_instructions: text(row.voiceInstructions), sms_instructions: text(row.smsInstructions), chat_instructions: text(row.chatInstructions), transfer_mode: text(row.transferMode, "on_request")!, transfer_number: text(row.transferNumber), appointment_change_policy: json(row.appointmentChangePolicy), created_at: created(row), updated_at: updated(row) }, ["id"]); count("receptionist_profiles");
    }
    for (const row of all.contacts) {
      const businessId = required(ids.businesses, row.businessId, `contact ${row._id}`); if (!businessId) continue;
      await upsert(db, "contacts", { id: ids.contacts.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, name: text(row.name), phone: text(row.phone), email: text(row.email), timezone: text(row.timezone), preferred_locale: text(row.preferredLocale), sms_consent_status: text(row.smsConsentStatus), sms_consent_updated_at: date(row.smsConsentUpdatedAt), sms_consent_source: text(row.smsConsentSource), operator_blocked_at: date(row.operatorBlockedAt), created_at: created(row), updated_at: updated(row) }, ["id"]); count("contacts");
    }

    // Storage metadata is imported before calls/documents so their foreign keys remain valid.
    for (const row of all.storage) {
      const ref = storageRefs.get(row._id); if (!ref) continue;
      const file = (await readdir(join(exportRoot, "_storage"))).find((candidate) => candidate.startsWith(`${row._id}.`));
      const filePath = file ? join(exportRoot, "_storage", file) : undefined;
      const contentType = text(row.contentType, "application/octet-stream")!.split(";", 1)[0];
      const key = `${ref.businessId}/${ref.purpose}/${row._id}${file ? extname(file) : ""}`;
      await upsert(db, "storage_objects", { id: ids.storage.get(row._id)!, business_id: ref.businessId, object_key: key, purpose: ref.purpose, file_name: file ? basename(file) : row._id, content_type: contentType, content_length: number(row.size), checksum: text(row.sha256), status: filePath ? "ready" : "pending", retention_until: ref.expiresAt, created_at: created(row), updated_at: updated(row) }, ["id"]); count("storage_objects");
      if (filePath) uploaded.push({ key, file: filePath, contentType });
    }

    for (const row of all.conversations) {
      const businessId = required(ids.businesses, row.businessId, `conversation ${row._id}`); const contactId = row.contactId ? ids.contacts.get(String(row.contactId)) : undefined; if (!businessId) continue;
      await upsert(db, "conversations", { id: ids.conversations.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, contact_id: contactId, channel: text(row.channel, "voice"), status: text(row.status, "closed"), automation_state: text(row.automationState, "ai_active"), locale: text(row.locale), revision: 0, created_at: created(row), updated_at: updated(row) }, ["id"]); count("conversations");
    }
    for (const row of all.calls) {
      const businessId = required(ids.businesses, row.businessId, `call ${row._id}`); if (!businessId) continue;
      const conversationId = row.conversationId ? ids.conversations.get(String(row.conversationId)) : undefined; const contactId = row.contactId ? ids.contacts.get(String(row.contactId)) : undefined;
      await upsert(db, "calls", { id: ids.calls.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, conversation_id: conversationId, contact_id: contactId, provider: text(row.provider, "twilio"), provider_call_id: text(row.providerCallId, text(row.twilioCallSid, row._id))!, gateway_session_id: text(row.gatewaySessionId), transport: text(row.transport, "pstn"), status: text(row.status, "started"), transfer_state: text(row.transferState), disposition: text(row.disposition), started_at: date(row.startedAt, created(row)), ended_at: date(row.endedAt), provider_duration_seconds: number(row.providerCallDurationSeconds), recording_object_id: row.recordingStorageId ? ids.storage.get(String(row.recordingStorageId)) : undefined, revision: 0, created_at: created(row), updated_at: updated(row), provider_updated_at: date(row.providerUpdatedAt), provider_price: number(row.providerPrice), provider_price_unit: text(row.providerPriceUnit), provider_cost_usd: number(row.providerCostUsd), origin_url: text(row.originUrl), user_agent: text(row.userAgent), widget_id: text(row.widgetId), session_purpose: text(row.sessionPurpose), web_call_max_duration_ms: number(row.webCallMaxDurationMs), billing_excluded: false }, ["id"]); count("calls");
    }
    for (const row of all.conversationSessions) {
      const businessId = required(ids.businesses, row.businessId, `conversation session ${row._id}`); const conversationId = required(ids.conversations, row.conversationId, `conversation session ${row._id}`); if (!businessId || !conversationId) continue;
      await upsert(db, "conversation_sessions", { id: ids.conversationSessions.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, conversation_id: conversationId, call_id: row.callId ? ids.calls.get(String(row.callId)) : undefined, channel: text(row.channel, "voice"), status: text(row.status, "closed"), started_at: date(row.startedAt, created(row)), last_message_at: date(row.lastMessageAt, created(row)), closed_at: date(row.closedAt), summary: json(row.summary), summary_generated_at: date(row.summaryGeneratedAt), summary_kind: text(row.summaryKind), created_at: created(row), updated_at: updated(row) }, ["id"]); count("conversation_sessions");
    }
    for (const row of all.messages) {
      const businessId = required(ids.businesses, row.businessId, `message ${row._id}`); const conversationId = required(ids.conversations, row.conversationId, `message ${row._id}`); if (!businessId || !conversationId) continue;
      await upsert(db, "messages", { id: ids.messages.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, conversation_id: conversationId, conversation_session_id: row.conversationSessionId ? ids.conversationSessions.get(String(row.conversationSessionId)) : undefined, direction: text(row.direction, "inbound"), channel: text(row.channel, "sms"), provider_message_id: text(row.providerMessageSid), body: text(row.body, "")!, status: text(row.status, "received"), ai_generated: bool(row.aiGenerated, false), created_at: created(row), updated_at: updated(row) }, ["id"]); count("messages");
    }
    for (const row of all.transcripts) {
      const businessId = required(ids.businesses, row.businessId, `transcript ${row._id}`); const callId = required(ids.calls, row.callId, `transcript ${row._id}`); if (!businessId || !callId) continue;
      await upsert(db, "transcripts", { id: ids.transcripts.get(row._id)!, business_id: businessId, call_id: callId, sequence: number(row.sequence, 0), speaker: text(row.speaker, "unknown"), text: text(row.text, "")!, confidence: number(row.confidence), final: bool(row.final, false), expires_at: date(row.expiresAt), created_at: created(row), updated_at: updated(row) }, ["id"]); count("transcripts");
    }
    for (const row of all.appointments) {
      const businessId = required(ids.businesses, row.businessId, `appointment ${row._id}`); const contactId = required(ids.contacts, row.contactId, `appointment ${row._id}`); const staffId = required(ids.staff, row.staffId, `appointment ${row._id}`); const serviceId = required(ids.services, row.serviceId, `appointment ${row._id}`); if (!businessId || !contactId || !staffId || !serviceId) continue;
      await upsert(db, "appointments", { id: ids.appointments.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, contact_id: contactId, staff_id: staffId, service_id: serviceId, starts_at: date(row.startsAt, created(row)), ends_at: date(row.endsAt, created(row)), timezone: text(row.timezone, "UTC"), status: text(row.status, "confirmed"), source_channel: text(row.sourceChannel, "voice"), calendar_sync_state: text(row.calendarSyncState, "not_required"), calendar_external_id: text(row.calendarExternalId), created_at: created(row), updated_at: updated(row) }, ["id"]); count("appointments");
    }

    const documentHashes = new Set<string>();
    const documentUrls = new Set<string>();
    for (const row of all.knowledgeDocuments) {
      const businessId = required(ids.businesses, row.businessId, `knowledge document ${row._id}`); if (!businessId) continue;
      const sourceText = text(row.textContent, ""); const storageId = text(row.storageId, text(row.extractedTextStorageId));
      const sourceUrl = text(row.sourceUrl);
      const hash = text(row.contentHash, sourceText ? contentHash(sourceText) : undefined);
      const uniqueSourceUrl = sourceUrl && !documentUrls.has(`${businessId}:${sourceUrl}`) ? sourceUrl : undefined;
      const uniqueHash = hash && !documentHashes.has(`${businessId}:${hash}`) ? hash : undefined;
      if (uniqueSourceUrl) documentUrls.add(`${businessId}:${uniqueSourceUrl}`);
      if (uniqueHash) documentHashes.add(`${businessId}:${uniqueHash}`);
      await upsert(db, "knowledge_documents", { id: ids.knowledgeDocuments.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, source_type: text(row.sourceType, "upload"), title: text(row.title, "Imported knowledge")!, source_url: uniqueSourceUrl, storage_object_id: storageId ? ids.storage.get(storageId) : undefined, mime_type: text(row.mimeType), status: text(row.status, "indexed"), processing_progress: number(row.processingProgress, 100), content_hash: uniqueHash, error: text(row.error), revision: 0, created_at: created(row), updated_at: updated(row) }, ["id"]);
      if (sourceText) await upsert(db, "knowledge_chunks", { id: uuidFor(`${row._id}:chunk:0`), business_id: businessId, document_id: ids.knowledgeDocuments.get(row._id)!, sequence: 0, content: sourceText, content_hash: contentHash(sourceText), embedding_status: "pending", embedding_fingerprint: null, created_at: created(row), updated_at: updated(row) }, ["id"]);
      count("knowledge_documents"); if (sourceText) count("knowledge_chunks");
    }
    for (const row of all.knowledgeSnippets) { const businessId = required(ids.businesses, row.businessId, `knowledge snippet ${row._id}`); if (!businessId) continue; await upsert(db, "knowledge_snippets", { id: ids.knowledgeSnippets.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, title: text(row.title, "Imported snippet")!, content: text(row.content, "")!, tags: json(row.tags, []), priority: number(row.priority, 0), active: bool(row.active, true), created_at: created(row), updated_at: updated(row) }, ["id"]); count("knowledge_snippets"); }
    for (const row of all.agentRules) { const businessId = required(ids.businesses, row.businessId, `agent rule ${row._id}`); if (!businessId) continue; await upsert(db, "agent_rules", { id: ids.agentRules.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, title: text(row.title, "Imported rule")!, content: text(row.content, "")!, active: bool(row.active, true), sort_order: number(row.order, 0), created_at: date(row.createdAt, created(row)), updated_at: date(row.updatedAt, updated(row)) }, ["id"]); count("agent_rules"); }
    for (const row of all.websiteJobs) { const businessId = required(ids.businesses, row.businessId, `website job ${row._id}`); if (!businessId) continue; await upsert(db, "website_ingestion_jobs", { id: ids.websiteJobs.get(row._id)!, business_id: businessId, website_url: text(row.websiteUrl, "https://invalid.local")!, provider: text(row.provider, "legacy"), status: text(row.status, "completed"), imported_count: number(row.importedCount, 0), indexed_count: number(row.indexedCount, 0), error_count: number(row.errorCount, 0), created_at: created(row), updated_at: updated(row) }, ["id"]); count("website_ingestion_jobs"); }
    for (const row of all.contextSnapshots) { const businessId = required(ids.businesses, row.businessId, `context snapshot ${row._id}`); if (!businessId) continue; const snapshot = { ...row }; delete snapshot._id; delete snapshot._creationTime; await upsert(db, "business_context_snapshots", { id: ids.contextSnapshots.get(row._id)!, business_id: businessId, version: text(row.version, row._id)!, snapshot, generated_at: date(row.generatedAt, created(row)), created_at: created(row), updated_at: updated(row) }, ["id"]); count("business_context_snapshots"); }
    for (const row of all.notifications) { const businessId = required(ids.businesses, row.businessId, `notification ${row._id}`); if (!businessId) continue; await upsert(db, "notifications", { id: ids.notifications.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, channel: text(row.channel, "sms"), kind: text(row.kind, "legacy"), related_id: row.relatedId ? uuidFor(String(row.relatedId)) : undefined, scheduled_for: date(row.scheduledFor, created(row)), status: text(row.status, "pending"), provider_message_id: text(row.providerMessageId), provider_num_segments: number(row.providerNumSegments), provider_price_unit: text(row.providerPriceUnit), created_at: created(row), updated_at: updated(row) }, ["id"]); count("notifications"); }
    for (const row of all.notificationPreferences) { const businessId = required(ids.businesses, row.businessId, `notification preference ${row._id}`); const userId = required(ids.users, row.userId, `notification preference ${row._id}`); if (!businessId || !userId) continue; await upsert(db, "operator_notification_preferences", { id: ids.notificationPreferences.get(row._id)!, business_id: businessId, user_id: userId, email_enabled: bool(row.emailEnabled, true), sms_enabled: bool(row.smsEnabled, false), event_preferences: json(row.eventPreferences, {}), daily_summary_enabled: bool(row.dailySummaryEnabled, false), daily_summary_send_time: text(row.dailySummarySendTime), created_at: created(row), updated_at: updated(row) }, ["id"]); count("operator_notification_preferences"); }
    for (const row of all.notificationDeliveries) { const businessId = required(ids.businesses, row.businessId, `notification delivery ${row._id}`); const userId = required(ids.users, row.userId, `notification delivery ${row._id}`); if (!businessId || !userId) continue; await upsert(db, "operator_notification_deliveries", { id: ids.notificationDeliveries.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, user_id: userId, event_kind: text(row.eventKind, "legacy"), event_key: text(row.eventKey, row._id)!, channel: text(row.channel, "email"), status: text(row.status, "pending"), destination: text(row.destination, "unknown")!, subject: text(row.subject, "Legacy notification")!, body: text(row.body, "")!, provider_message_id: text(row.providerMessageId), scheduled_for: date(row.createdAt, created(row)), sent_at: date(row.sentAt), content_expires_at: date(row.contentExpiresAt, new Date(Date.now() + 90 * 86400000)), created_at: date(row.createdAt, created(row)), updated_at: updated(row) }, ["id"]); count("operator_notification_deliveries"); }

    for (const row of all.billingAccounts) { const businessId = required(ids.businesses, row.businessId, `billing account ${row._id}`); if (!businessId) continue; await upsert(db, "billing_accounts", { id: ids.billingAccounts.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, source: "polar", billing_key: text(row.billingKey, `business:${row.businessId}`)!, customer_id: text(row.polarCustomerId, text(row.polarCustomerExternalId)), subscription_id: text(row.proSubscriptionId, text(row.aiSmsSubscriptionId)), plan: text(row.currentPlan), subscription_state: text(row.subscriptionState), current_period_start: date(row.currentPeriodStart), current_period_end: date(row.currentPeriodEnd), billing_interval: text(row.billingInterval), overage_spending_cap_cents: number(row.overageSpendingCapCents), created_at: created(row), updated_at: updated(row) }, ["legacy_convex_id"]); count("billing_accounts"); }
    for (const row of all.billingTransactions) { const businessId = required(ids.businesses, row.businessId, `billing transaction ${row._id}`); if (!businessId) continue; await upsert(db, "billing_transactions", { id: ids.billingTransactions.get(row._id)!, business_id: businessId, kind: text(row.kind, "legacy"), source_id: text(row.sourceId, row._id), status: text(row.status, "succeeded"), amount_cents: number(row.amountCents, 0), currency: text(row.currency, "usd"), description: text(row.description), invoice_url: text(row.invoiceUrl), order_id: text(row.orderId), subscription_id: text(row.subscriptionId), polar_customer_id: text(row.polarCustomerId), occurred_at: date(row.occurredAt, created(row)), last_synced_at: date(row.lastSyncedAt), created_at: created(row), updated_at: updated(row) }, ["id"]); count("billing_transactions"); }
    for (const row of all.usageEvents) { const businessId = required(ids.businesses, row.businessId, `usage event ${row._id}`); if (!businessId) continue; await upsert(db, "billing_usage_events", { id: ids.usageEvents.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, period_key: text(row.periodKey, "unknown"), source_key: text(row.sourceKey, row._id)!, usage_kind: text(row.usageKind, "unknown"), quantity: number(row.quantity, 0), sync_status: "skipped", created_at: date(row.recordedAt, created(row)), updated_at: updated(row), plan_at_record_time: text(row.planAtRecordTime), is_final: true }, ["id"]); count("billing_usage_events"); }
    for (const row of all.usageMonths) { const businessId = required(ids.businesses, row.businessId, `usage month ${row._id}`); if (!businessId) continue; await upsert(db, "billing_usage_months", { id: ids.usageMonths.get(row._id)!, business_id: businessId, period_key: text(row.periodKey, "unknown")!, plan_at_snapshot: text(row.planAtSnapshot), voice_seconds_used: number(row.voiceSecondsUsed, 0), alert_sms_segments_used: number(row.alertSmsSegmentsUsed, 0), outbound_call_attempts_used: number(row.outboundCallAttemptsUsed, 0), voice_blocked: bool(row.voiceBlocked, false), alert_sms_blocked: bool(row.alertSmsBlocked, false), outbound_call_attempts_blocked: bool(row.outboundCallAttemptsBlocked, false), overage_spend_cents: number(row.overageSpendCents, 0), last_recorded_at: date(row.lastRecordedAt, created(row)), created_at: created(row), updated_at: updated(row), chat_ai_tokens_used: number(row.chatAiTokensUsed, 0), chat_ai_tokens_blocked: false }, ["business_id", "period_key"]); count("billing_usage_months"); }
    for (const row of all.unitEconomics) { const businessId = required(ids.businesses, row.businessId, `unit economics ${row._id}`); if (!businessId) continue; await upsert(db, "unit_economics_events", { id: ids.unitEconomics.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, month_key: text(row.monthKey, "unknown")!, occurred_at: date(row.occurredAt, created(row)), event_key: text(row.eventKey, row._id)!, event_kind: text(row.eventKind, "legacy"), channel: text(row.channel, "platform"), cost_usd: number(row.costUsd, 0), quantity: number(row.quantity), quantity_unit: text(row.quantityUnit), provider: text(row.provider), model: text(row.model), operation: text(row.operation), call_id: row.callId ? ids.calls.get(String(row.callId)) : undefined, conversation_id: row.conversationId ? ids.conversations.get(String(row.conversationId)) : undefined, created_at: created(row), updated_at: updated(row) }, ["id"]); count("unit_economics_events"); }
    for (const row of all.unitRollups) { const businessId = required(ids.businesses, row.businessId, `unit economics rollup ${row._id}`); if (!businessId) continue; const values: Record<string, unknown> = { id: ids.unitRollups.get(row._id)!, business_id: businessId, month_key: text(row.monthKey, "unknown")!, created_at: created(row), updated_at: updated(row) }; for (const [key, value] of Object.entries(row)) if (!["_id", "_creationTime", "businessId", "monthKey"].includes(key) && typeof value === "number") values[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = value; await upsert(db, "unit_economics_rollups", values, ["id"]); count("unit_economics_rollups"); }

    for (const row of all.invitations) { const businessId = required(ids.businesses, row.businessId, `invitation ${row._id}`); const inviter = required(ids.users, row.invitedByUserId, `invitation ${row._id}`); if (!businessId || !inviter) continue; const email = text(row.email, "legacy@example.invalid")!; await upsert(db, "business_invitations", { id: ids.invitations.get(row._id)!, business_id: businessId, invited_by_user_id: inviter, email, normalized_email: email.toLowerCase(), role: text(row.role, "business_member"), token_hash: text(row.tokenHash, contentHash(row._id)), status: text(row.status, "pending"), expires_at: date(row.expirationTime, new Date(Date.now() + 7 * 86400000)), accepted_by_user_id: row.acceptedByUserId ? ids.users.get(String(row.acceptedByUserId)) : undefined, accepted_at: date(row.acceptedAt), created_at: date(row.invitedAt, created(row)), updated_at: updated(row) }, ["id"]); count("business_invitations"); }
    for (const row of all.prospectDemos) { const businessId = required(ids.businesses, row.businessId, `prospect demo ${row._id}`); const operator = required(ids.users, row.operatorUserId, `prospect demo ${row._id}`); if (!businessId || !operator) continue; await upsert(db, "prospect_demos", { id: ids.prospectDemos.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, token_hash: text(row.tokenHash, contentHash(row._id)), status: text(row.status, "preparing"), locale: text(row.locale, "en"), suggested_prompts: json(row.suggestedPrompts, []), recipient_email: text(row.recipientEmail), recipient_name: text(row.recipientName), campaign_id: text(row.campaignId), website_url: text(row.websiteUrl, "https://invalid.local"), business_name: text(row.businessName, "Legacy business"), operator_user_id: operator, website_ingestion_job_id: row.websiteIngestionJobId ? ids.websiteJobs.get(String(row.websiteIngestionJobId)) : undefined, expires_at: date(row.expiresAt, new Date(Date.now() + 7 * 86400000)), published_at: date(row.publishedAt), claimed_at: date(row.claimedAt), claimed_by_user_id: row.claimedByUserId ? ids.users.get(String(row.claimedByUserId)) : undefined, created_at: date(row.createdAt, created(row)), updated_at: updated(row) }, ["id"]); count("prospect_demos"); for (const call of all.calls.filter((candidate) => candidate.prospectDemoId === row._id)) await db.query("UPDATE public.calls SET prospect_demo_id = $1 WHERE id = $2", [ids.prospectDemos.get(row._id), ids.calls.get(call._id)]); }
    const verificationProviderIds = new Set<string>();
    for (const row of all.onboardingVerifications) { const businessId = required(ids.businesses, row.businessId, `phone verification ${row._id}`); const userId = required(ids.users, row.userId, `phone verification ${row._id}`); if (!businessId || !userId) continue; const verificationId = text(row.verificationSid); const uniqueVerificationId = verificationId && !verificationProviderIds.has(verificationId) ? verificationId : undefined; if (uniqueVerificationId) verificationProviderIds.add(uniqueVerificationId); await upsert(db, "onboarding_phone_verifications", { id: ids.onboardingVerifications.get(row._id)!, business_id: businessId, user_id: userId, phone_e164: text(row.phoneE164, "")!, country_code: text(row.countryCode, "US"), line_type: text(row.lineType), provider_verification_id: uniqueVerificationId, status: text(row.status, "queued"), started_at: date(row.startedAt, created(row)), expires_at: date(row.expiresAt, new Date(Date.now() + 86400000)), approved_at: date(row.approvedAt), attempt_count: number(row.attemptCount, 0), last_error: text(row.lastError), request_fingerprint: contentHash(`${row._id}:${row.phoneE164}`), created_at: created(row), updated_at: updated(row) }, ["id"]); count("onboarding_phone_verifications"); }
    for (const row of all.numberClaims) { const businessId = required(ids.businesses, row.businessId, `number claim ${row._id}`); const userId = required(ids.users, row.userId, `number claim ${row._id}`); if (!businessId || !userId) continue; await upsert(db, "onboarding_number_claim_events", { id: ids.numberClaims.get(row._id)!, business_id: businessId, user_id: userId, requested_e164: text(row.requestedE164, text(row.e164, ""))!, selection_context: json(row.selectionContext, {}), claim_token_hash: text(row.claimTokenHash, contentHash(row._id)), idempotency_key: text(row.idempotencyKey, row._id), status: text(row.status, "reserved"), phone_number_id: row.phoneNumberId ? ids.phoneNumbers.get(String(row.phoneNumberId)) : undefined, provider_phone_id: text(row.twilioPhoneSid), reserved_at: date(row.reservedAt, created(row)), purchased_at: date(row.purchasedAt), completed_at: date(row.completedAt), attempt_count: number(row.attemptCount, 0), last_error: text(row.lastError), alternatives: json(row.alternatives), created_at: created(row), updated_at: updated(row), purpose: "onboarding" }, ["id"]); count("onboarding_number_claim_events"); }
    for (const row of all.smsConsent) { const businessId = required(ids.businesses, row.businessId, `SMS consent ${row._id}`); if (!businessId) continue; await upsert(db, "sms_consent_events", { id: ids.smsConsent.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, contact_id: row.contactId ? ids.contacts.get(String(row.contactId)) : undefined, phone: text(row.phone, "unknown"), recipient_type: text(row.recipientType, "contact"), action: text(row.action, "legacy"), source: text(row.source, "convex_import"), occurred_at: date(row.occurredAt, created(row)), created_at: created(row), updated_at: updated(row) }, ["legacy_convex_id"]); count("sms_consent_events"); }
    for (const row of all.feedback) { const userId = required(ids.users, row.userId, `feedback ${row._id}`); if (!userId) continue; await upsert(db, "feedback_submissions", { id: ids.feedback.get(row._id)!, legacy_convex_id: row._id, user_id: userId, user_email: text(row.userEmail), user_name: text(row.userName), business_id: row.businessId ? ids.businesses.get(String(row.businessId)) : undefined, business_name: text(row.businessName), message: text(row.message, "Imported feedback")!, page_path: text(row.pagePath), user_agent: text(row.userAgent), email_status: text(row.emailStatus, "email_sent"), recipient_email: text(row.recipientEmail), provider_message_id: text(row.providerMessageId), email_error: text(row.emailError), submitted_at: date(row.submittedAt, created(row)), emailed_at: date(row.emailedAt), created_at: created(row), updated_at: updated(row) }, ["legacy_convex_id"]); count("feedback_submissions"); }
    for (const row of all.auditLogs) { const businessId = required(ids.businesses, row.businessId, `audit log ${row._id}`); if (!businessId) continue; await upsert(db, "audit_logs", { id: ids.auditLogs.get(row._id)!, legacy_convex_id: row._id, business_id: businessId, actor_user_id: row.actorUserId ? ids.users.get(String(row.actorUserId)) : undefined, event_type: text(row.eventType, "legacy.imported"), entity_type: text(row.entityType, "legacy"), entity_id: row.entityId ? uuidFor(String(row.entityId)) : undefined, payload: json(row.payload), created_at: date(row.createdAt, created(row)), updated_at: updated(row) }, ["legacy_convex_id"]); count("audit_logs"); }
    for (const row of all.appointmentVerifications) { const businessId = required(ids.businesses, row.businessId, `appointment verification ${row._id}`); const appointmentId = required(ids.appointments, row.appointmentId, `appointment verification ${row._id}`); const contactId = required(ids.contacts, row.contactId, `appointment verification ${row._id}`); if (!businessId || !appointmentId || !contactId) continue; await upsert(db, "appointment_change_verifications", { id: ids.appointmentVerifications.get(row._id)!, business_id: businessId, appointment_id: appointmentId, contact_id: contactId, caller_phone: text(row.callerPhone, "unknown"), action: text(row.action, "legacy"), status: text(row.status, "pending"), code_hash: text(row.codeHash), expires_at: date(row.expiresAt, new Date(Date.now() + 3600000)), attempt_count: number(row.attemptCount, 0), created_at: created(row), updated_at: updated(row) }, ["id"]); count("appointment_change_verifications"); }

    if (DRY_RUN) {
      await db.query("ROLLBACK");
    } else {
      await db.query("COMMIT");
    }
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    db.release();
    await client.pool.end();
  }

  if (!DRY_RUN && uploaded.length > 0) {
    const storage = new S3StorageProvider({ bucket: process.env.S3_BUCKET ?? "lobbystack", region: process.env.S3_REGION ?? "us-east-1", ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}), accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin", forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" });
    let uploadedCount = 0;
    for (const item of uploaded) {
      try { await storage.putObject({ key: item.key, body: new Uint8Array(await readFile(item.file)), contentType: item.contentType }); uploadedCount += 1; } catch (error) { console.warn(`Storage upload failed for ${item.file}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    counts.storage_objects_uploaded = uploadedCount;
  }

  console.log(JSON.stringify({ sourceDeployment: DEV_DEPLOYMENT, exportRoot, dryRun: DRY_RUN, imported: counts, intentionallySkipped: { telemetry_outbox: rows("telemetry_outbox").length, convexComponents: "internal Convex component state is not imported", authSessions: all.authSessions.length }, note: "Knowledge chunks are imported without embeddings and marked pending for the provider-safe re-embedding job." }, null, 2));
}

void main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
