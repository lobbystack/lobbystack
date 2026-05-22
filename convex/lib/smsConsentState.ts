import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { PLATFORM_ALERT_SMS_SCOPE } from "./smsConsent";

type DbCtx = QueryCtx | MutationCtx;

export async function getPlatformAlertSmsConsentState(
  ctx: DbCtx,
  phone: string,
): Promise<Doc<"sms_consent_states"> | null> {
  return await ctx.db
    .query("sms_consent_states")
    .withIndex("by_scope_and_phone", (q) =>
      q.eq("scope", PLATFORM_ALERT_SMS_SCOPE).eq("phone", phone),
    )
    .unique();
}

export async function isPlatformAlertSmsOptedOut(
  ctx: DbCtx,
  phone: string,
): Promise<boolean> {
  const state = await getPlatformAlertSmsConsentState(ctx, phone);
  return state?.status === "opted_out";
}

export async function recordPlatformAlertSmsConsentState(
  ctx: MutationCtx,
  input: {
    phone: string;
    status: "subscribed" | "opted_out";
    source: string;
    createdAt: string;
  },
): Promise<void> {
  const existing = await getPlatformAlertSmsConsentState(ctx, input.phone);
  const patch = {
    status: input.status,
    source: input.source,
    updatedAt: input.createdAt,
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return;
  }

  await ctx.db.insert("sms_consent_states", {
    scope: PLATFORM_ALERT_SMS_SCOPE,
    phone: input.phone,
    ...patch,
  });
}

export async function recordSmsConsentEvent(
  ctx: MutationCtx,
  input: {
    recipientType: "contact" | "operator" | "platform_phone";
    phone: string;
    action: "granted" | "declined" | "revoked" | "opted_out" | "resubscribed";
    source: string;
    createdAt: string;
    businessId?: Id<"businesses">;
    contactId?: Id<"contacts">;
    userId?: Id<"users">;
    appointmentId?: Id<"appointments">;
    disclosureVersion?: string;
    disclosureText?: string;
  },
): Promise<Id<"sms_consent_events">> {
  return await ctx.db.insert("sms_consent_events", {
    recipientType: input.recipientType,
    phone: input.phone,
    action: input.action,
    source: input.source,
    createdAt: input.createdAt,
    ...(input.businessId !== undefined ? { businessId: input.businessId } : {}),
    ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
    ...(input.appointmentId !== undefined ? { appointmentId: input.appointmentId } : {}),
    ...(input.disclosureVersion !== undefined
      ? { disclosureVersion: input.disclosureVersion }
      : {}),
    ...(input.disclosureText !== undefined ? { disclosureText: input.disclosureText } : {}),
  });
}
