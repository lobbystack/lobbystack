/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as affiliates from "../affiliates.js";
import type * as ai_agents_runtime from "../ai/agents/runtime.js";
import type * as ai_context_knowledge from "../ai/context/knowledge.js";
import type * as ai_context_knowledgeUploads from "../ai/context/knowledgeUploads.js";
import type * as ai_context_rules from "../ai/context/rules.js";
import type * as ai_context_snapshots from "../ai/context/snapshots.js";
import type * as ai_context_websiteIngestion from "../ai/context/websiteIngestion.js";
import type * as ai_context_websiteIngestionActions from "../ai/context/websiteIngestionActions.js";
import type * as ai_preview_stream from "../ai/preview/stream.js";
import type * as ai_workflows_runtime from "../ai/workflows/runtime.js";
import type * as appointments_booking from "../appointments/booking.js";
import type * as appointments_changeOtp from "../appointments/changeOtp.js";
import type * as appointments_changes from "../appointments/changes.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as businesses_admin from "../businesses/admin.js";
import type * as businesses_catalog from "../businesses/catalog.js";
import type * as businesses_members from "../businesses/members.js";
import type * as businesses_setupGuide from "../businesses/setupGuide.js";
import type * as conversations_sessions from "../conversations/sessions.js";
import type * as conversations_webhooks from "../conversations/webhooks.js";
import type * as crons from "../crons.js";
import type * as dashboard_contacts from "../dashboard/contacts.js";
import type * as dashboard_messages from "../dashboard/messages.js";
import type * as dashboard_outcomes from "../dashboard/outcomes.js";
import type * as dashboard_overview from "../dashboard/overview.js";
import type * as demos from "../demos.js";
import type * as feedback from "../feedback.js";
import type * as http from "../http.js";
import type * as integrations_calendar from "../integrations/calendar.js";
import type * as integrations_googleCalendar from "../integrations/googleCalendar.js";
import type * as integrations_messageMedia from "../integrations/messageMedia.js";
import type * as integrations_twilioA2p from "../integrations/twilioA2p.js";
import type * as integrations_twilioMessageStatus from "../integrations/twilioMessageStatus.js";
import type * as integrations_twilioSms from "../integrations/twilioSms.js";
import type * as integrations_twilioSmsDebug from "../integrations/twilioSmsDebug.js";
import type * as integrations_twilioVoice from "../integrations/twilioVoice.js";
import type * as lib_accountCredentials from "../lib/accountCredentials.js";
import type * as lib_appointmentChangePolicy from "../lib/appointmentChangePolicy.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authEmailClaims from "../lib/authEmailClaims.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_billing from "../lib/billing.js";
import type * as lib_billingAccess from "../lib/billingAccess.js";
import type * as lib_components from "../lib/components.js";
import type * as lib_contactBlocking from "../lib/contactBlocking.js";
import type * as lib_defaultStaff from "../lib/defaultStaff.js";
import type * as lib_emailChange from "../lib/emailChange.js";
import type * as lib_indexedQueries from "../lib/indexedQueries.js";
import type * as lib_knowledgeDocuments from "../lib/knowledgeDocuments.js";
import type * as lib_knowledgeSections from "../lib/knowledgeSections.js";
import type * as lib_messageAttachmentUrls from "../lib/messageAttachmentUrls.js";
import type * as lib_messageAttachments from "../lib/messageAttachments.js";
import type * as lib_node_imagePreviews from "../lib/node/imagePreviews.js";
import type * as lib_node_knowledgeExtraction from "../lib/node/knowledgeExtraction.js";
import type * as lib_node_tessdataEng from "../lib/node/tessdataEng.js";
import type * as lib_node_tessdataFra from "../lib/node/tessdataFra.js";
import type * as lib_node_tesseractInProcessWorker from "../lib/node/tesseractInProcessWorker.js";
import type * as lib_node_twilioClient from "../lib/node/twilioClient.js";
import type * as lib_onboardingLocation from "../lib/onboardingLocation.js";
import type * as lib_onboardingPhoneNumbers from "../lib/onboardingPhoneNumbers.js";
import type * as lib_onboardingStage from "../lib/onboardingStage.js";
import type * as lib_operatorNotificationPreferences from "../lib/operatorNotificationPreferences.js";
import type * as lib_passwordPolicy from "../lib/passwordPolicy.js";
import type * as lib_passwordReset from "../lib/passwordReset.js";
import type * as lib_passwordWithTurnstile from "../lib/passwordWithTurnstile.js";
import type * as lib_prospectDemo from "../lib/prospectDemo.js";
import type * as lib_providers_email from "../lib/providers/email.js";
import type * as lib_providers_embeddings from "../lib/providers/embeddings.js";
import type * as lib_providers_nonRealtimeText from "../lib/providers/nonRealtimeText.js";
import type * as lib_receptionistProfileDefaults from "../lib/receptionistProfileDefaults.js";
import type * as lib_runtimeLocale from "../lib/runtimeLocale.js";
import type * as lib_serviceNameGeneration from "../lib/serviceNameGeneration.js";
import type * as lib_serviceNames from "../lib/serviceNames.js";
import type * as lib_smsCompliance from "../lib/smsCompliance.js";
import type * as lib_smsConsent from "../lib/smsConsent.js";
import type * as lib_smsConsentState from "../lib/smsConsentState.js";
import type * as lib_smsPhoneNumbers from "../lib/smsPhoneNumbers.js";
import type * as lib_snapshot from "../lib/snapshot.js";
import type * as lib_teamInvitation from "../lib/teamInvitation.js";
import type * as lib_turnstile from "../lib/turnstile.js";
import type * as lib_twilioMessageStatus from "../lib/twilioMessageStatus.js";
import type * as lib_twilioSecurity from "../lib/twilioSecurity.js";
import type * as lib_twilioUrls from "../lib/twilioUrls.js";
import type * as lib_voiceCallStatus from "../lib/voiceCallStatus.js";
import type * as lib_websiteIngestion from "../lib/websiteIngestion.js";
import type * as lib_websiteIngestionStorage from "../lib/websiteIngestionStorage.js";
import type * as migrations_authEmailNormalization from "../migrations/authEmailNormalization.js";
import type * as notifications_reminders from "../notifications/reminders.js";
import type * as onboarding_abuse from "../onboarding/abuse.js";
import type * as onboarding_attribution from "../onboarding/attribution.js";
import type * as onboarding_greeting from "../onboarding/greeting.js";
import type * as onboarding_knowledge from "../onboarding/knowledge.js";
import type * as onboarding_phoneNumbers from "../onboarding/phoneNumbers.js";
import type * as onboarding_phoneNumbersSkip from "../onboarding/phoneNumbersSkip.js";
import type * as onboarding_phoneVerification from "../onboarding/phoneVerification.js";
import type * as onboarding_phoneVerificationLookup from "../onboarding/phoneVerificationLookup.js";
import type * as onboarding_phoneVerificationState from "../onboarding/phoneVerificationState.js";
import type * as onboarding_plan from "../onboarding/plan.js";
import type * as onboarding_websites from "../onboarding/websites.js";
import type * as operatorNotifications from "../operatorNotifications.js";
import type * as privacy_retention from "../privacy/retention.js";
import type * as services_localizedNames from "../services/localizedNames.js";
import type * as settings_phoneNumberReclaim from "../settings/phoneNumberReclaim.js";
import type * as settings_phoneNumberReclaimActions from "../settings/phoneNumberReclaimActions.js";
import type * as settings_phoneNumbers from "../settings/phoneNumbers.js";
import type * as smsCompliance from "../smsCompliance.js";
import type * as telemetry_ai from "../telemetry/ai.js";
import type * as telemetry_observedFunctions from "../telemetry/observedFunctions.js";
import type * as telemetry_posthog from "../telemetry/posthog.js";
import type * as telemetry_shared from "../telemetry/shared.js";
import type * as unitEconomics from "../unitEconomics.js";
import type * as users from "../users.js";
import type * as users_preferences from "../users/preferences.js";
import type * as voice_runtime from "../voice/runtime.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  affiliates: typeof affiliates;
  "ai/agents/runtime": typeof ai_agents_runtime;
  "ai/context/knowledge": typeof ai_context_knowledge;
  "ai/context/knowledgeUploads": typeof ai_context_knowledgeUploads;
  "ai/context/rules": typeof ai_context_rules;
  "ai/context/snapshots": typeof ai_context_snapshots;
  "ai/context/websiteIngestion": typeof ai_context_websiteIngestion;
  "ai/context/websiteIngestionActions": typeof ai_context_websiteIngestionActions;
  "ai/preview/stream": typeof ai_preview_stream;
  "ai/workflows/runtime": typeof ai_workflows_runtime;
  "appointments/booking": typeof appointments_booking;
  "appointments/changeOtp": typeof appointments_changeOtp;
  "appointments/changes": typeof appointments_changes;
  auth: typeof auth;
  billing: typeof billing;
  "businesses/admin": typeof businesses_admin;
  "businesses/catalog": typeof businesses_catalog;
  "businesses/members": typeof businesses_members;
  "businesses/setupGuide": typeof businesses_setupGuide;
  "conversations/sessions": typeof conversations_sessions;
  "conversations/webhooks": typeof conversations_webhooks;
  crons: typeof crons;
  "dashboard/contacts": typeof dashboard_contacts;
  "dashboard/messages": typeof dashboard_messages;
  "dashboard/outcomes": typeof dashboard_outcomes;
  "dashboard/overview": typeof dashboard_overview;
  demos: typeof demos;
  feedback: typeof feedback;
  http: typeof http;
  "integrations/calendar": typeof integrations_calendar;
  "integrations/googleCalendar": typeof integrations_googleCalendar;
  "integrations/messageMedia": typeof integrations_messageMedia;
  "integrations/twilioA2p": typeof integrations_twilioA2p;
  "integrations/twilioMessageStatus": typeof integrations_twilioMessageStatus;
  "integrations/twilioSms": typeof integrations_twilioSms;
  "integrations/twilioSmsDebug": typeof integrations_twilioSmsDebug;
  "integrations/twilioVoice": typeof integrations_twilioVoice;
  "lib/accountCredentials": typeof lib_accountCredentials;
  "lib/appointmentChangePolicy": typeof lib_appointmentChangePolicy;
  "lib/auth": typeof lib_auth;
  "lib/authEmailClaims": typeof lib_authEmailClaims;
  "lib/availability": typeof lib_availability;
  "lib/billing": typeof lib_billing;
  "lib/billingAccess": typeof lib_billingAccess;
  "lib/components": typeof lib_components;
  "lib/contactBlocking": typeof lib_contactBlocking;
  "lib/defaultStaff": typeof lib_defaultStaff;
  "lib/emailChange": typeof lib_emailChange;
  "lib/indexedQueries": typeof lib_indexedQueries;
  "lib/knowledgeDocuments": typeof lib_knowledgeDocuments;
  "lib/knowledgeSections": typeof lib_knowledgeSections;
  "lib/messageAttachmentUrls": typeof lib_messageAttachmentUrls;
  "lib/messageAttachments": typeof lib_messageAttachments;
  "lib/node/imagePreviews": typeof lib_node_imagePreviews;
  "lib/node/knowledgeExtraction": typeof lib_node_knowledgeExtraction;
  "lib/node/tessdataEng": typeof lib_node_tessdataEng;
  "lib/node/tessdataFra": typeof lib_node_tessdataFra;
  "lib/node/tesseractInProcessWorker": typeof lib_node_tesseractInProcessWorker;
  "lib/node/twilioClient": typeof lib_node_twilioClient;
  "lib/onboardingLocation": typeof lib_onboardingLocation;
  "lib/onboardingPhoneNumbers": typeof lib_onboardingPhoneNumbers;
  "lib/onboardingStage": typeof lib_onboardingStage;
  "lib/operatorNotificationPreferences": typeof lib_operatorNotificationPreferences;
  "lib/passwordPolicy": typeof lib_passwordPolicy;
  "lib/passwordReset": typeof lib_passwordReset;
  "lib/passwordWithTurnstile": typeof lib_passwordWithTurnstile;
  "lib/prospectDemo": typeof lib_prospectDemo;
  "lib/providers/email": typeof lib_providers_email;
  "lib/providers/embeddings": typeof lib_providers_embeddings;
  "lib/providers/nonRealtimeText": typeof lib_providers_nonRealtimeText;
  "lib/receptionistProfileDefaults": typeof lib_receptionistProfileDefaults;
  "lib/runtimeLocale": typeof lib_runtimeLocale;
  "lib/serviceNameGeneration": typeof lib_serviceNameGeneration;
  "lib/serviceNames": typeof lib_serviceNames;
  "lib/smsCompliance": typeof lib_smsCompliance;
  "lib/smsConsent": typeof lib_smsConsent;
  "lib/smsConsentState": typeof lib_smsConsentState;
  "lib/smsPhoneNumbers": typeof lib_smsPhoneNumbers;
  "lib/snapshot": typeof lib_snapshot;
  "lib/teamInvitation": typeof lib_teamInvitation;
  "lib/turnstile": typeof lib_turnstile;
  "lib/twilioMessageStatus": typeof lib_twilioMessageStatus;
  "lib/twilioSecurity": typeof lib_twilioSecurity;
  "lib/twilioUrls": typeof lib_twilioUrls;
  "lib/voiceCallStatus": typeof lib_voiceCallStatus;
  "lib/websiteIngestion": typeof lib_websiteIngestion;
  "lib/websiteIngestionStorage": typeof lib_websiteIngestionStorage;
  "migrations/authEmailNormalization": typeof migrations_authEmailNormalization;
  "notifications/reminders": typeof notifications_reminders;
  "onboarding/abuse": typeof onboarding_abuse;
  "onboarding/attribution": typeof onboarding_attribution;
  "onboarding/greeting": typeof onboarding_greeting;
  "onboarding/knowledge": typeof onboarding_knowledge;
  "onboarding/phoneNumbers": typeof onboarding_phoneNumbers;
  "onboarding/phoneNumbersSkip": typeof onboarding_phoneNumbersSkip;
  "onboarding/phoneVerification": typeof onboarding_phoneVerification;
  "onboarding/phoneVerificationLookup": typeof onboarding_phoneVerificationLookup;
  "onboarding/phoneVerificationState": typeof onboarding_phoneVerificationState;
  "onboarding/plan": typeof onboarding_plan;
  "onboarding/websites": typeof onboarding_websites;
  operatorNotifications: typeof operatorNotifications;
  "privacy/retention": typeof privacy_retention;
  "services/localizedNames": typeof services_localizedNames;
  "settings/phoneNumberReclaim": typeof settings_phoneNumberReclaim;
  "settings/phoneNumberReclaimActions": typeof settings_phoneNumberReclaimActions;
  "settings/phoneNumbers": typeof settings_phoneNumbers;
  smsCompliance: typeof smsCompliance;
  "telemetry/ai": typeof telemetry_ai;
  "telemetry/observedFunctions": typeof telemetry_observedFunctions;
  "telemetry/posthog": typeof telemetry_posthog;
  "telemetry/shared": typeof telemetry_shared;
  unitEconomics: typeof unitEconomics;
  users: typeof users;
  "users/preferences": typeof users_preferences;
  "voice/runtime": typeof voice_runtime;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rag: import("@convex-dev/rag/_generated/component.js").ComponentApi<"rag">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  persistentTextStreaming: import("@convex-dev/persistent-text-streaming/_generated/component.js").ComponentApi<"persistentTextStreaming">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  highPriorityWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"highPriorityWorkpool">;
  bulkWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"bulkWorkpool">;
  actionRetrier: import("@convex-dev/action-retrier/_generated/component.js").ComponentApi<"actionRetrier">;
  crons: import("@convex-dev/crons/_generated/component.js").ComponentApi<"crons">;
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
  firecrawlScrape: import("convex-firecrawl-scrape/_generated/component.js").ComponentApi<"firecrawlScrape">;
};
