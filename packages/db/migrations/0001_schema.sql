-- Schemas created in 0000_foundation.sql
--> statement-breakpoint
CREATE TABLE "auth"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."pending_email_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"session_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_subject" text,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"display_name" text,
	"image_url" text,
	"preferred_locale" text,
	"platform_role" text,
	"active_business_id" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"signup_attribution" text,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."business_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value_json" text NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"onboarding_step" text,
	"owner_user_id" text,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invited_by_user_id" text,
	"joined_at" timestamp with time zone,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."setup_guide_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."business_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_minutes" integer NOT NULL,
	"close_minutes" integer NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"starts_at" text NOT NULL,
	"ends_at" text NOT NULL,
	"reason" text NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"e164" text NOT NULL,
	"label" text,
	"provider" text DEFAULT 'twilio' NOT NULL,
	"provider_sid" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"capabilities_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."receptionist_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"voice_id" text,
	"greeting" text,
	"personality" text,
	"language" text DEFAULT 'en' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"settings_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"localized_names_json" jsonb,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"price_cents" integer,
	"currency" text DEFAULT 'USD',
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"title" text,
	"bio" text,
	"avatar_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."staff_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"staff_id" text NOT NULL,
	"service_id" text NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."appointment_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"appointment_id" text NOT NULL,
	"actor_user_id" text,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"reason" text,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."appointment_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"appointment_id" text NOT NULL,
	"channel" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"contact_id" text,
	"service_id" text,
	"staff_id" text,
	"conversation_id" text,
	"call_id" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"notes" text,
	"cancellation_reason" text,
	"source" text DEFAULT 'voice' NOT NULL,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"display_name" text,
	"phone_e164" text,
	"email" text,
	"notes" text,
	"tags_json" jsonb,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."conversation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" text NOT NULL,
	"call_id" text,
	"kind" text NOT NULL,
	"summary_json" jsonb,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"contact_id" text,
	"channel" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"subject" text,
	"assigned_user_id" text,
	"last_message_at" timestamp with time zone,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" text NOT NULL,
	"direction" text NOT NULL,
	"sender_role" text NOT NULL,
	"body" text,
	"media_json" jsonb,
	"provider_message_id" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."call_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"call_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_json" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."call_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"call_id" text NOT NULL,
	"speaker" text NOT NULL,
	"text" text NOT NULL,
	"sequence" integer NOT NULL,
	"spoken_at" timestamp with time zone,
	"confidence" integer,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" text,
	"contact_id" text,
	"phone_number_id" text,
	"direction" text NOT NULL,
	"status" text DEFAULT 'ringing' NOT NULL,
	"from_e164" text NOT NULL,
	"to_e164" text NOT NULL,
	"provider" text DEFAULT 'twilio' NOT NULL,
	"provider_call_sid" text,
	"started_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"disposition" text,
	"recording_url" text,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."agent_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."context_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'building' NOT NULL,
	"payload_json" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"document_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"token_count" integer,
	"embedding" vector(1536),
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"storage_object_id" text,
	"mime_type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"section" text,
	"content_hash" text,
	"metadata_json" jsonb,
	"processed_at" timestamp with time zone,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."knowledge_snippets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"tags_json" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."website_scrape_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider" text DEFAULT 'firecrawl' NOT NULL,
	"result_json" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"calendar_name" text,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp with time zone,
	"sync_status" text DEFAULT 'active' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."calendar_sync_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"connection_id" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"appointment_id" text,
	"action" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload_json" jsonb,
	"error_message" text,
	"processed_at" timestamp with time zone,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."external_calendar_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"connection_id" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"title" text,
	"is_busy" boolean DEFAULT true NOT NULL,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" text,
	"channel" text NOT NULL,
	"event_kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"recipient" text NOT NULL,
	"subject" text,
	"body" text,
	"provider_message_id" text,
	"payload_json" jsonb,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_message" text,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"event_kind" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"settings_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."billing_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"provider" text DEFAULT 'polar' NOT NULL,
	"provider_customer_id" text,
	"plan_slug" text DEFAULT 'free_cloud' NOT NULL,
	"billing_interval" text,
	"status" text DEFAULT 'active' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."billing_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"addon_slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."billing_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"billing_account_id" text NOT NULL,
	"provider_subscription_id" text,
	"plan_slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" text,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."unit_economics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"event_kind" text NOT NULL,
	"channel" text NOT NULL,
	"quantity" integer NOT NULL,
	"quantity_unit" text NOT NULL,
	"cost_micros" integer,
	"revenue_micros" integer,
	"currency" text DEFAULT 'USD',
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"usage_kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"source_ref" text,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."data_retention_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"retention_days" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."sms_compliance_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"brand_kind" text,
	"customer_type" text,
	"traffic_tier" text,
	"draft_json" jsonb,
	"submission_snapshot_json" jsonb,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."sms_consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"consent_state_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" text,
	"payload_json" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."sms_consent_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"contact_id" text,
	"phone_e164" text NOT NULL,
	"recipient_type" text NOT NULL,
	"scope" text NOT NULL,
	"status" text NOT NULL,
	"source" text,
	"evidence_json" jsonb,
	"consented_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."affiliate_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" text NOT NULL,
	"referral_id" text NOT NULL,
	"business_id" text,
	"amount_micros" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."affiliate_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"commission_bps" integer DEFAULT 0 NOT NULL,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."affiliate_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" text NOT NULL,
	"business_id" text,
	"user_id" text,
	"referral_code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attributed_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"actor_user_id" text,
	"actor_type" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"action" text NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"ip_address" text,
	"user_agent" text,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text,
	"response_json" jsonb,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."outbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"dedupe_key" text,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text,
	"byte_length" integer,
	"checksum" text,
	"status" text DEFAULT 'active' NOT NULL,
	"retention_status" text DEFAULT 'active' NOT NULL,
	"metadata_json" jsonb,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."workflow_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"workflow_type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input_json" jsonb NOT NULL,
	"output_json" jsonb,
	"error_message" text,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"legacy_convex_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_idx" ON "auth"."accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "auth"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pending_email_changes_account_id_idx" ON "auth"."pending_email_changes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "pending_email_changes_code_hash_idx" ON "auth"."pending_email_changes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_session_token_idx" ON "auth"."sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "auth"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_subject_idx" ON "auth"."users" USING btree ("auth_subject");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "auth"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "auth"."users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_identifier_token_idx" ON "auth"."verification_tokens" USING btree ("identifier","token");--> statement-breakpoint
CREATE UNIQUE INDEX "business_settings_business_key_idx" ON "app"."business_settings" USING btree ("business_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_slug_idx" ON "app"."businesses" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "businesses_owner_user_id_idx" ON "app"."businesses" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_idx" ON "app"."invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_business_id_idx" ON "app"."invitations" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "app"."invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_business_user_idx" ON "app"."memberships" USING btree ("business_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "app"."memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "setup_guide_progress_business_step_idx" ON "app"."setup_guide_progress" USING btree ("business_id","step_id");--> statement-breakpoint
CREATE INDEX "business_hours_business_id_idx" ON "app"."business_hours" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_hours_business_day_idx" ON "app"."business_hours" USING btree ("business_id","day_of_week");--> statement-breakpoint
CREATE INDEX "closures_business_id_idx" ON "app"."closures" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_numbers_e164_idx" ON "app"."phone_numbers" USING btree ("e164");--> statement-breakpoint
CREATE INDEX "phone_numbers_business_id_idx" ON "app"."phone_numbers" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "receptionist_profiles_business_id_idx" ON "app"."receptionist_profiles" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "services_business_id_idx" ON "app"."services" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "staff_business_id_idx" ON "app"."staff" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_services_staff_service_idx" ON "app"."staff_services" USING btree ("staff_id","service_id");--> statement-breakpoint
CREATE INDEX "staff_services_business_id_idx" ON "app"."staff_services" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "appointment_audit_logs_appointment_id_idx" ON "app"."appointment_audit_logs" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "appointment_audit_logs_business_id_idx" ON "app"."appointment_audit_logs" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "appointment_verifications_appointment_id_idx" ON "app"."appointment_verifications" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "appointment_verifications_business_id_idx" ON "app"."appointment_verifications" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "appointments_business_id_idx" ON "app"."appointments" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "appointments_starts_at_idx" ON "app"."appointments" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "appointments_contact_id_idx" ON "app"."appointments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contacts_business_id_idx" ON "app"."contacts" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "contacts_phone_e164_idx" ON "app"."contacts" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "app"."contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "conversation_sessions_conversation_id_idx" ON "app"."conversation_sessions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_sessions_business_id_idx" ON "app"."conversation_sessions" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "conversations_business_id_idx" ON "app"."conversations" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "conversations_contact_id_idx" ON "app"."conversations" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "conversations_last_message_at_idx" ON "app"."conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "app"."messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_business_id_idx" ON "app"."messages" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "messages_provider_message_id_idx" ON "app"."messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "call_events_call_id_idx" ON "app"."call_events" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "call_events_business_id_idx" ON "app"."call_events" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "call_transcripts_call_id_idx" ON "app"."call_transcripts" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "call_transcripts_business_id_idx" ON "app"."call_transcripts" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "calls_business_id_idx" ON "app"."calls" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "calls_provider_call_sid_idx" ON "app"."calls" USING btree ("provider_call_sid");--> statement-breakpoint
CREATE INDEX "calls_conversation_id_idx" ON "app"."calls" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_rules_business_id_idx" ON "app"."agent_rules" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "context_snapshots_business_id_idx" ON "app"."context_snapshots" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "context_snapshots_business_version_idx" ON "app"."context_snapshots" USING btree ("business_id","version");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_document_id_idx" ON "app"."knowledge_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_business_id_idx" ON "app"."knowledge_chunks" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "knowledge_documents_business_id_idx" ON "app"."knowledge_documents" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "knowledge_documents_status_idx" ON "app"."knowledge_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledge_snippets_business_id_idx" ON "app"."knowledge_snippets" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "website_scrape_jobs_business_id_idx" ON "app"."website_scrape_jobs" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "website_scrape_jobs_status_idx" ON "app"."website_scrape_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "calendar_connections_business_id_idx" ON "app"."calendar_connections" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "calendar_connections_provider_account_idx" ON "app"."calendar_connections" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "calendar_sync_events_connection_id_idx" ON "app"."calendar_sync_events" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "calendar_sync_events_business_id_idx" ON "app"."calendar_sync_events" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "external_calendar_blocks_connection_id_idx" ON "app"."external_calendar_blocks" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "external_calendar_blocks_business_id_idx" ON "app"."external_calendar_blocks" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "external_calendar_blocks_starts_at_idx" ON "app"."external_calendar_blocks" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_business_id_idx" ON "app"."notification_deliveries" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_idx" ON "app"."notification_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_preferences_business_user_idx" ON "app"."notification_preferences" USING btree ("business_id","user_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "app"."push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_business_id_idx" ON "app"."push_subscriptions" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "billing_accounts_business_id_idx" ON "app"."billing_accounts" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "billing_accounts_provider_customer_id_idx" ON "app"."billing_accounts" USING btree ("provider_customer_id");--> statement-breakpoint
CREATE INDEX "billing_addons_business_id_idx" ON "app"."billing_addons" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "billing_addons_addon_slug_idx" ON "app"."billing_addons" USING btree ("addon_slug");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_business_id_idx" ON "app"."billing_subscriptions" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_provider_subscription_id_idx" ON "app"."billing_subscriptions" USING btree ("provider_subscription_id");--> statement-breakpoint
CREATE INDEX "unit_economics_events_business_id_idx" ON "app"."unit_economics_events" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "unit_economics_events_occurred_at_idx" ON "app"."unit_economics_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "usage_records_business_id_idx" ON "app"."usage_records" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "usage_records_recorded_at_idx" ON "app"."usage_records" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "usage_records_usage_kind_idx" ON "app"."usage_records" USING btree ("usage_kind");--> statement-breakpoint
CREATE INDEX "data_retention_policies_business_id_idx" ON "app"."data_retention_policies" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "sms_compliance_profiles_business_id_idx" ON "app"."sms_compliance_profiles" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "sms_consent_events_consent_state_id_idx" ON "app"."sms_consent_events" USING btree ("consent_state_id");--> statement-breakpoint
CREATE INDEX "sms_consent_events_business_id_idx" ON "app"."sms_consent_events" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "sms_consent_states_business_id_idx" ON "app"."sms_consent_states" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "sms_consent_states_phone_e164_idx" ON "app"."sms_consent_states" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "affiliate_commissions_partner_id_idx" ON "app"."affiliate_commissions" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "affiliate_commissions_referral_id_idx" ON "app"."affiliate_commissions" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX "affiliate_partners_code_idx" ON "app"."affiliate_partners" USING btree ("code");--> statement-breakpoint
CREATE INDEX "affiliate_referrals_partner_id_idx" ON "app"."affiliate_referrals" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "affiliate_referrals_business_id_idx" ON "app"."affiliate_referrals" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "affiliate_referrals_referral_code_idx" ON "app"."affiliate_referrals" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "audit_logs_business_id_idx" ON "app"."audit_logs" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "app"."audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_business_scope_key_idx" ON "app"."idempotency_keys" USING btree ("business_id","scope","key");--> statement-breakpoint
CREATE INDEX "outbox_messages_status_available_at_idx" ON "app"."outbox_messages" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_messages_business_id_idx" ON "app"."outbox_messages" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_messages_dedupe_key_idx" ON "app"."outbox_messages" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_objects_bucket_object_key_idx" ON "app"."storage_objects" USING btree ("bucket","object_key");--> statement-breakpoint
CREATE INDEX "storage_objects_business_id_idx" ON "app"."storage_objects" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "workflow_jobs_business_id_idx" ON "app"."workflow_jobs" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "workflow_jobs_status_scheduled_at_idx" ON "app"."workflow_jobs" USING btree ("status","scheduled_at");