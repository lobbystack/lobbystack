import type { BillingPlanSlug, Entitlement } from "@lobbystack/shared";
import type { AnalyticsChannelCounts } from "./analytics-channels";

export type WorkspaceViewModel = {
  businessId: string;
  name: string;
  slug?: string;
  role: string;
  active: boolean;
  timezone?: string;
  businessType?: string;
};

export type AnalyticsMetricViewModel = {
  current: number;
  previous: number;
};

export type AnalyticsViewModel = {
  periodDays: number;
  from: string;
  to: string;
  granularity: "hour" | "day" | "week" | "month" | "year";
  calls: AnalyticsMetricViewModel;
  appointments: AnalyticsMetricViewModel;
  messages: AnalyticsMetricViewModel;
  averageCallDurationSeconds: number;
  agentResponseSeconds: AnalyticsMetricViewModel;
  series: Array<{
    bucket: string;
    agentResponseSeconds: number;
    calls: number;
    appointments: number;
    messages: number;
  }>;
  channels: AnalyticsChannelCounts;
  outcomes: Array<{ outcome: string; count: number }>;
  /** In the business currency's smallest unit. */
  bookedValue: AnalyticsMetricViewModel & { currency: string };
  timeSavedSeconds: AnalyticsMetricViewModel;
  /** Null when no calls count yet. */
  callsWithoutTransferPercent: { current: number | null; previous: number | null };
};

export type CalendarOptionViewModel = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole?: string;
  selected: boolean;
};

export type CalendarConnectionViewModel = {
  id: string;
  provider: string;
  externalAccountId: string | null;
  status: string;
  staffId: string | null;
  selectedCalendarId: string | null;
  selectedCalendarSummary?: string | null;
  lastSyncedAt?: string | null;
  lastSyncError: string | null;
};

/** What the dashboard warns about the Cal.com event type an operator picked. `days` are 0 for Sunday. */
export type CalcomEventTypeWarningViewModel =
  | { code: "missing_lengths"; lengths: number[] }
  | { code: "sms_reminders" }
  | { code: "video_location" }
  | { code: "narrower_availability"; days: number[] };

/** What the dashboard says about a Calendly event type. `required_questions` means it can't be booked. */
export type CalendlyEventTypeWarningViewModel =
  | { code: "required_questions"; questions: string[] }
  | { code: "missing_lengths"; lengths: number[] }
  | { code: "no_details_question" }
  | { code: "video_location" };

export type IntegrationsViewModel = {
  calendarConnections: CalendarConnectionViewModel[];
  staff: Array<{ id: string; name: string }>;
  /** The Google connection's calendars. */
  calendarOptions: CalendarOptionViewModel[];
  discoveryError: string | null;
  /** The Cal.com connection's event types, and whether this deployment has Cal.com set up. */
  calcom?: { configured: boolean; options: CalendarOptionViewModel[]; discoveryError: string | null; warnings: CalcomEventTypeWarningViewModel[] };
  /** The Calendly connection's event types, whether this deployment has Calendly set up, and whether the account's plan can book. Null when unknown. */
  calendly?: { configured: boolean; options: CalendarOptionViewModel[]; discoveryError: string | null; warnings: CalendlyEventTypeWarningViewModel[]; paidPlan: boolean | null };
};

export type TeamMemberViewModel = {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  joinedAt: string;
};

export type TeamInvitationViewModel = {
  invitationId: string;
  email: string;
  role: string;
  status: string;
  /** A claim link: accepting it hands the business over to the invitee. */
  transfersOwnership?: boolean;
  expiresAt: string;
  invitedAt: string;
};

export type PhoneNumberViewModel = {
  id: string;
  e164: string;
  voiceEnabled: boolean;
  smsEnabled: boolean;
  status: string;
  reclaimScheduledAt: string | null;
  reclaimReason: string | null;
};

export type BillingUsageViewModel = {
  knowledgeStorageBytesUsed: number;
  effectivePlan: BillingPlanSlug;
  // What the business may use now, as the server enforces it.
  entitlement: Entitlement;
  account: {
    plan: string | null;
    billingInterval: string | null;
    subscriptionState: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    overageSpendingCapCents: number | null;
  } | null;
  usage: Array<{
    periodKey: string;
    usageKind: string;
    quantity: number;
    isFinal: boolean;
    syncStatus: string;
  }>;
  usageStatus: {
    voiceSecondsUsed: number;
    alertSmsSegmentsUsed: number;
    outboundCallAttemptsUsed: number;
    voiceBlocked: boolean;
    alertSmsBlocked: boolean;
    outboundCallAttemptsBlocked: boolean;
    overageSpendCents: number;
    overageSpendingCapCents: number | null;
    overageSpendingCapReached: boolean;
    usageComplete: boolean;
  } | null;
};
