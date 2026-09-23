// Hand-written SQL migrations that run in order after the Drizzle generated
// migrations. They are tracked in `__lobbystack_migrations` so each file is
// applied at most once; replaying them would take ACCESS EXCLUSIVE locks on
// live tables (RLS bootstrap, policy rewrites) and can deadlock against running
// workers. Keep this list and `packages/db/migrations/*.sql` in sync; the
// accompanying test fails when a file is missing or extra.
export const MIGRATION_JOURNAL_TABLE = "__lobbystack_migrations";

export const ROLE_MIGRATION = "0000_roles.sql";

export const SCHEMA_MIGRATIONS = [
  "0002_rls.sql",
  "0003_resolvers.sql",
  "0004_vector.sql",
  "0005_booking_concurrency.sql",
  "0006_auth.sql",
  "0007_outbox_dlq.sql",
  "0008_dispatcher_business_listing.sql",
  "0009_knowledge_url_unique.sql",
  "0010_provider_pricing.sql",
  "0011_billing_affiliate_ledger.sql",
  "0012_dispatcher_runtime.sql",
  "0013_billing_checkout.sql",
  "0014_worker_affiliate_user_access.sql",
  "0015_actor_role_enforcement.sql",
  "0016_conversation_session_summaries.sql",
  "0017_prospect_demo_isolation.sql",
  "0018_fractional_usage_quantity.sql",
  "0019_web_voice_policy.sql",
  "0020_prospect_demo_lifecycle.sql",
  "0021_prospect_demo_operator_resolvers.sql",
  "0022_operator_notification_preferences.sql",
  "0023_operator_notification_deliveries.sql",
  "0024_phone_onboarding.sql",
  "0025_phone_claims.sql",
  "0026_phone_replacement.sql",
  "0027_operator_notification_resolver.sql",
  "0028_message_callback_resolver.sql",
  "0029_sms_consent.sql",
  "0030_billing_usage_caps.sql",
  "0031_feedback_submissions.sql",
  "0032_unit_economics.sql",
  "0033_notification_provider_pricing.sql",
  "0034_call_billing_exclusion.sql",
  "0035_app_user_profile_columns.sql",
  "0036_replacement_import_ids.sql",
  "0037_onboarding_attribution.sql",
  "0038_website_chat_widget.sql",
  "0039_website_chat_runtime.sql",
  "0040_embedding_fingerprints.sql",
  "0041_ui_functional_parity.sql",
  "0042_knowledge_document_tags.sql",
  "0043_phone_number_revisit.sql",
  "0044_operator_sms_consent_version.sql",
  "0045_verified_phone_market.sql",
  "0046_knowledge_document_activity.sql",
  "0047_website_import_document_link.sql",
  "0048_knowledge_keyword_search.sql",
  "0049_finance_usage_metadata.sql",
  "0050_phone_verification_resends.sql",
  "0051_knowledge_content_hash_index.sql",
  "0052_calendar_sync_freshness.sql",
  "0053_legacy_email_verified_backfill.sql",
  "0054_finance_billing_transactions.sql",
  "0055_product_event_retention_index.sql",
  "0056_phone_verified_email_backfill.sql",
  "0057_query_plan_indexes.sql",
  "0058_web_call_media_started_at.sql",
] as const;

const CONCURRENT_INDEX_DIRECTIVE = /^-- lobbystack:concurrent-index ([a-z][a-z0-9_]*)$/m;

export function concurrentIndexName(contents: string): string | undefined {
  return CONCURRENT_INDEX_DIRECTIVE.exec(contents)?.[1];
}

export const RAW_MIGRATIONS = [ROLE_MIGRATION, ...SCHEMA_MIGRATIONS] as const;

// The migration journal was introduced after 0052. Databases that predate the
// journal may baseline only that fixed history; later migrations must execute.
// Never extend this list when adding a migration.
export const LEGACY_BASELINE_MIGRATIONS = [
  ROLE_MIGRATION,
  ...SCHEMA_MIGRATIONS.slice(
    0,
    SCHEMA_MIGRATIONS.indexOf("0053_legacy_email_verified_backfill.sql"),
  ),
] as const;
