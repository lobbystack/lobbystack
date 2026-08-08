import {
  getAnalyticsOverview,
  getDailyCallVolume,
  getBillingAccount,
  getDashboardSummary,
  getNotificationPreferences,
  listCalls,
  listBusinessesForUser,
  listConversationSummaries,
  listKnowledgeDocuments,
  listTeam,
  getContactDetail,
  getProspectDemoPreview,
  claimProspectDemo,
  recordAffiliateClick,
  listAffiliateCommissions,
  getSmsComplianceState,
  listServices,
  listMemberships,
  getBusinessSettings,
  updateBusinessSettings,
  createBusiness,
  listRecentMessages,
  searchKnowledge,
  searchVoiceKnowledge,
  createKnowledgeDocument,
  getAppPool,
} from "@lobbystack/domain/server";
import { users } from "@lobbystack/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { pools, schema } from "@lobbystack/db";

import { requireBusinessAccess, requireSession } from "@/lib/authorization";

const authDb = drizzle(pools.auth(), { schema });

type RpcHandler = (args: Record<string, unknown>) => Promise<unknown>;

const handlers: Record<string, RpcHandler> = {
  "users.current": async () => {
    const session = await requireSession();
    const [user] = await authDb
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (!user) {
      return null;
    }
    return {
      _id: user.id,
      email: user.email,
      name: user.displayName,
      displayName: user.displayName,
      image: user.imageUrl,
      phone: user.phone,
      phoneVerificationTime: user.phoneVerifiedAt?.getTime(),
      activeBusinessId: user.activeBusinessId,
    };
  },
  "businesses.admin.listForCurrentUser": async () => {
    const session = await requireSession();
    const businesses = await listBusinessesForUser({ userId: session.userId });
    return businesses.map((entry) => ({
      business: {
        _id: entry.id,
        name: entry.name,
        slug: entry.slug,
        onboardingStage: "completed",
      },
      membership: { role: entry.role },
    }));
  },
  "dashboard.overview.getHomeSummary": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    const [summary, calls] = await Promise.all([
      getDashboardSummary({ businessId }),
      listCalls({ businessId }),
    ]);
    return {
      kpis: {
        calls: { total: summary.callsToday, deltaPercent: 0 },
        messages: { total: summary.openConversations, deltaPercent: 0 },
        appointments: { total: summary.appointments, deltaPercent: 0 },
        contacts: { total: summary.activeContacts, deltaPercent: 0 },
        averageDuration: { totalSeconds: 0, deltaSeconds: 0 },
      },
      liveCalls: 0,
      monthlyCalls: [],
      recentCalls: calls.slice(0, 10),
      actionRequired: [],
    };
  },
  "dashboard.overview.getAnalyticsSummary": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    const [overview, volume] = await Promise.all([
      getAnalyticsOverview({ businessId, since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }),
      getDailyCallVolume({ businessId }),
    ]);
    return { overview, volume };
  },
  "voice.runtime.listRecentCalls": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    return listCalls({ businessId });
  },
  "dashboard.contacts.listContacts": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    const contact = await getContactDetail({
      businessId,
      contactId: String(args.contactId ?? ""),
    }).catch(() => null);
    return contact ? [contact] : [];
  },
  "dashboard.contacts.getContactDetail": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    return getContactDetail({
      businessId,
      contactId: String(args.contactId ?? ""),
    });
  },
  "dashboard.messages.listConversationSummaries": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    return listConversationSummaries({ businessId });
  },
  "billing.getStatus": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    return getBillingAccount({ businessId });
  },
  "businesses.catalog.getBusinessSettingsAccount": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    return getBusinessSettings({ businessId });
  },
  "businesses.members.listTeam": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    return listTeam({ businessId });
  },
  "businesses.catalog.getBusinessConfiguration": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    const [settings, services] = await Promise.all([
      getBusinessSettings({ businessId }),
      listServices({ businessId }),
    ]);
    return { settings, services };
  },
  "ai.context.knowledge.listKnowledge": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    return listKnowledgeDocuments({ businessId });
  },
  "affiliates.getDashboardSummary": async () => ({ totalClicks: 0, totalCommissionsUsd: 0 }),
  "affiliates.listCommissions": async () => [],
  "affiliates.listPayouts": async () => [],
  "demos.previewProspectDemo": async (args) =>
    getProspectDemoPreview({ token: String(args.token ?? "") }),
  "demos.claimProspectDemo": async (args) => {
    const session = await requireSession();
    return claimProspectDemo({
      userId: session.userId,
      values: { token: String(args.token ?? "") },
    });
  },
  "affiliates.recordClick": async (args) =>
    recordAffiliateClick({
      values: {
        referralCode: String(args.referralCode ?? ""),
        ...(typeof args.visitorId === "string" ? { visitorId: args.visitorId } : {}),
        ...(typeof args.sourceUrl === "string" ? { sourceUrl: args.sourceUrl } : {}),
      },
    }),
  "affiliates.bindAttribution": async () => ({ bound: false, reason: "not_implemented" }),
  "smsCompliance.getStatus": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    return getSmsComplianceState({ businessId });
  },
  "users.preferences.getNotificationPreferences": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    return getNotificationPreferences({ businessId, userId: session.userId });
  },
  "businesses.admin.bootstrapBusiness": async (args) => {
    const session = await requireSession();
    const businessId = await createBusiness({
      userId: session.userId,
      values: {
        name: String(args.name ?? "My Business"),
        slug: String(args.slug ?? `business-${Date.now()}`),
        timezone: String(args.timezone ?? "America/New_York"),
        defaultLocale: "en",
      },
    });
    return businessId;
  },
  "businesses.catalog.updateBusinessName": async (args) => {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId, requireAdmin: true });
    await updateBusinessSettings({
      businessId,
      userId: session.userId,
      values: { name: String(args.name ?? "") },
    });
    return { ok: true };
  },
  "businesses.members.acceptInvitation": async () => ({ ok: true }),
  "businesses.members.previewInvitation": async () => ({ valid: false }),
  "onboarding.greeting.getOnboardingGreetingPrefill": async () => ({ greeting: null }),
  "onboarding.phoneVerificationLookup.getLatestPhoneVerificationAttempt": async () => null,
  "businesses.setupGuide.getProgress": async () => ({ steps: [], completedCount: 0, totalCount: 0 }),
};

export async function dispatchRpc(path: string, args: Record<string, unknown>): Promise<unknown> {
  const handler = handlers[path];
  if (handler) {
    return handler(args);
  }

  // Generic fallbacks for unmapped mutations/actions
  if (path.endsWith(".listMemberships")) {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });
    return listMemberships({ businessId });
  }

  if (path.includes("knowledge") && path.includes("search")) {
    const businessId = String(args.businessId ?? "");
    return searchVoiceKnowledge({
      businessId,
      query: String(args.query ?? ""),
      embedding: Array.isArray(args.embedding) ? (args.embedding as number[]) : [],
    });
  }

  if (path.includes("knowledge") && path.includes("create")) {
    const businessId = String(args.businessId ?? "");
    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId, requireAdmin: true });
    return createKnowledgeDocument({
      businessId,
      userId: session.userId,
      values: {
        title: String(args.title ?? "Untitled"),
        textContent: String(args.textContent ?? ""),
        sourceType: "manual",
      },
    });
  }

  if (path.includes("messages") && path.includes("listRecent")) {
    const businessId = String(args.businessId ?? "");
    return listRecentMessages({ businessId, limit: Number(args.limit ?? 20) });
  }

  console.warn(`Unhandled RPC path: ${path}`);
  return null;
}

export { getAppPool };
