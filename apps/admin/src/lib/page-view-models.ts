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
  series: Array<{
    bucket: string;
    calls: number;
    appointments: number;
    messages: number;
  }>;
  outcomes: Array<{ outcome: string; count: number }>;
  unitEconomics: {
    totalCostUsd: number;
    costPerVoiceCallUsd: number;
    costPerActiveUserUsd: number;
  } | null;
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

export type IntegrationsViewModel = {
  calendarConnections: CalendarConnectionViewModel[];
  staff: Array<{ id: string; name: string }>;
  calendarOptions: CalendarOptionViewModel[];
  discoveryError: string | null;
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
