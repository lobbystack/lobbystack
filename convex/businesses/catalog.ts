import { v } from "convex/values";
import {
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
  signInViaProvider,
} from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMembership } from "../lib/auth";
import { EMAIL_CHANGE_PROVIDER_ID, emailChangeProvider } from "../lib/emailChange";
import {
  listStaffServiceAssignmentsForBusiness,
  replaceBusinessStaffServiceAssignments,
} from "../lib/indexedQueries";
import { validatePasswordRequirements } from "../lib/passwordPolicy";
import { generateMissingLocalizedServiceNames } from "../lib/serviceNameGeneration";
import {
  localizedServiceNamesValidator,
  normalizeLocalizedServiceNames,
} from "../lib/serviceNames";
import { buildTwilioSmsInboundWebhookUrl } from "../lib/twilioUrls";
import { scheduleSnapshotRefresh } from "./admin";

const phoneNumberSaveArgs = {
  businessId: v.id("businesses"),
  phoneNumberId: v.optional(v.id("phone_numbers")),
  e164: v.string(),
  twilioPhoneSid: v.optional(v.union(v.string(), v.null())),
  voiceEnabled: v.boolean(),
  smsEnabled: v.boolean(),
  status: v.string(),
} as const;

type PhoneNumberSaveArgs = {
  businessId: Id<"businesses">;
  phoneNumberId?: Id<"phone_numbers">;
  e164: string;
  twilioPhoneSid?: string | null;
  voiceEnabled: boolean;
  smsEnabled: boolean;
  status: string;
};

type PhoneNumberSaveResult = {
  phoneNumberId: Id<"phone_numbers">;
  smsWebhookStatus: string;
  smsWebhookLastError?: string;
};

type PhoneNumberUpsertInternalResult = PhoneNumberSaveResult & {
  shouldSyncSmsWebhook: boolean;
};

type PhoneNumberWebhookSyncInput = {
  twilioPhoneSid: string | undefined;
  smsEnabled: boolean;
  status: string;
};

type CredentialsDbCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

function shouldSyncSmsWebhook(input: PhoneNumberWebhookSyncInput): boolean {
  return Boolean(input.twilioPhoneSid && input.smsEnabled && input.status === "active");
}

function buildPhoneNumberWithWebhookState(
  current: Omit<Doc<"phone_numbers">, "_id" | "_creationTime">,
  webhookState: {
    smsWebhookStatus: string;
    smsWebhookTargetUrl?: string;
    smsWebhookLastSyncedAt?: string;
    smsWebhookLastError?: string;
  },
): Omit<Doc<"phone_numbers">, "_id" | "_creationTime"> {
  const next: Omit<Doc<"phone_numbers">, "_id" | "_creationTime"> = {
    ...current,
    ...(webhookState.smsWebhookStatus ? { smsWebhookStatus: webhookState.smsWebhookStatus } : {}),
  };

  if (webhookState.smsWebhookTargetUrl !== undefined) {
    next.smsWebhookTargetUrl = webhookState.smsWebhookTargetUrl;
  }
  if (webhookState.smsWebhookLastSyncedAt !== undefined) {
    next.smsWebhookLastSyncedAt = webhookState.smsWebhookLastSyncedAt;
  }
  if (webhookState.smsWebhookLastError !== undefined) {
    next.smsWebhookLastError = webhookState.smsWebhookLastError;
  }

  return next;
}

async function getPasswordAccountForUser(
  ctx: CredentialsDbCtx,
  userId: Id<"users">,
): Promise<Doc<"authAccounts"> | null> {
  return await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) =>
      q.eq("userId", userId).eq("provider", "password"),
    )
    .unique();
}

async function assertPasswordEmailAvailable(
  ctx: CredentialsDbCtx,
  input: {
    newEmail: string;
    userId: Id<"users">;
    currentAccountId?: Id<"authAccounts">;
  },
): Promise<void> {
  const duplicateAccount = await ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q) =>
      q.eq("provider", "password").eq("providerAccountId", input.newEmail),
    )
    .unique();

  if (
    duplicateAccount &&
    (!input.currentAccountId || duplicateAccount._id !== input.currentAccountId)
  ) {
    throw new Error("An account with that email already exists.");
  }

  const duplicateUser = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", input.newEmail))
    .unique();

  if (duplicateUser && duplicateUser._id !== input.userId) {
    throw new Error("An account with that email already exists.");
  }
}

async function hashVerificationCode(code: string): Promise<string> {
  const encoded = new TextEncoder().encode(code);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const resolveBusinessByPhoneNumber = internalQuery({
  args: {
    e164: v.string(),
    channel: v.union(v.literal("voice"), v.literal("sms")),
  },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("phone_numbers")
      .withIndex("by_e164", (q) => q.eq("e164", args.e164))
      .collect();
    const eligibleMatches = matches.filter((phoneNumber) => {
      if (phoneNumber.status !== "active") {
        return false;
      }

      return args.channel === "voice"
        ? phoneNumber.voiceEnabled
        : phoneNumber.smsEnabled;
    });

    if (eligibleMatches.length > 1) {
      throw new Error(
        `Multiple active ${args.channel} routes are configured for ${args.e164}.`,
      );
    }

    return eligibleMatches[0] ?? null;
  },
});

export const getBusinessConfiguration = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const [business, profile, services, staff, assignments, hours, closures, phoneNumbers] =
      await Promise.all([
        ctx.db.get(args.businessId),
        ctx.db
          .query("receptionist_profiles")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .unique(),
        ctx.db
          .query("services")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .collect(),
        ctx.db
          .query("staff")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .collect(),
        listStaffServiceAssignmentsForBusiness(ctx, args.businessId),
        ctx.db
          .query("business_hours")
          .withIndex("by_business_id_and_day_of_week", (q) =>
            q.eq("businessId", args.businessId),
          )
          .collect(),
        ctx.db
          .query("closures")
          .withIndex("by_business_id_and_starts_at", (q) =>
            q.eq("businessId", args.businessId),
          )
          .collect(),
        ctx.db
          .query("phone_numbers")
          .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
          .collect(),
      ]);

    return {
      business,
      profile,
      services,
      staff,
      assignments,
      hours,
      closures,
      phoneNumbers,
    };
  },
});

export const updateBusinessName = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    const name = args.name.trim();
    if (!name) {
      throw new Error("Business name is required.");
    }

    await ctx.db.patch(args.businessId, { name });
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return { name };
  },
});

export const getCurrentUserForPasswordChange = internalQuery({
  args: {
    authSubject: v.string(),
    authUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authUserId = args.authUserId
      ? await ctx.db.normalizeId("users", args.authUserId)
      : null;
    const authUser = authUserId ? await ctx.db.get(authUserId) : null;
    const legacyUser = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", args.authSubject))
      .unique();
    const user = authUser ?? legacyUser;

    if (!user) {
      throw new Error("User profile not initialized.");
    }

    const passwordAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", user._id).eq("provider", "password"),
      )
      .unique();

    return {
      userId: user._id,
      email: user.email ?? null,
      passwordAccountId: passwordAccount?._id ?? null,
      passwordAccountEmail: passwordAccount?.providerAccountId ?? null,
    };
  },
});

export const assertPendingEmailChangeTarget = internalQuery({
  args: {
    newEmail: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const passwordAccount = await getPasswordAccountForUser(ctx, args.userId);
    if (!passwordAccount) {
      throw new Error("Password account not found.");
    }

    await assertPasswordEmailAvailable(ctx, {
      newEmail: args.newEmail,
      userId: args.userId,
      currentAccountId: passwordAccount._id,
    });

    return null;
  },
});

export const confirmPendingEmailChange = internalMutation({
  args: {
    codeHash: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const verificationCode = await ctx.db
      .query("authVerificationCodes")
      .withIndex("code", (q) => q.eq("code", args.codeHash))
      .unique();

    if (!verificationCode || verificationCode.provider !== EMAIL_CHANGE_PROVIDER_ID) {
      throw new Error("Invalid or expired email confirmation link.");
    }

    if (verificationCode.expirationTime < Date.now()) {
      await ctx.db.delete(verificationCode._id);
      throw new Error("Invalid or expired email confirmation link.");
    }

    const nextEmail = verificationCode.emailVerified?.trim().toLowerCase();
    if (!nextEmail || nextEmail !== args.email) {
      throw new Error("Invalid or expired email confirmation link.");
    }

    const account = await ctx.db.get(verificationCode.accountId);
    if (!account || account.provider !== "password") {
      throw new Error("Password account not found.");
    }

    const user = await ctx.db.get(account.userId);
    if (!user) {
      throw new Error("User profile not initialized.");
    }

    await assertPasswordEmailAvailable(ctx, {
      newEmail: nextEmail,
      userId: user._id,
      currentAccountId: account._id,
    });

    await ctx.db.patch(account._id, {
      providerAccountId: nextEmail,
    });
    await ctx.db.patch(user._id, {
      email: nextEmail,
      emailVerificationTime: Date.now(),
    });
    await ctx.db.delete(verificationCode._id);

    return {
      email: nextEmail,
      userId: user._id,
    };
  },
});

export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required.");
    }
    const authUserId = await getAuthUserId(ctx);

    validatePasswordRequirements(args.newPassword);

    const user: {
      userId: Id<"users">;
      email: string | null;
      passwordAccountId: Id<"authAccounts"> | null;
      passwordAccountEmail: string | null;
    } = await ctx.runQuery(internal.businesses.catalog.getCurrentUserForPasswordChange, {
      authSubject: identity.subject,
      ...(authUserId ? { authUserId: String(authUserId) } : {}),
    });
    const accountEmail = user.passwordAccountEmail ?? user.email;

    if (!accountEmail) {
      throw new Error("No email is configured for this account.");
    }

    const authCtx = ctx as unknown as Parameters<typeof retrieveAccount>[0];

    await retrieveAccount(authCtx, {
      provider: "password",
      account: {
        id: accountEmail,
        secret: args.currentPassword,
      },
    });

    await modifyAccountCredentials(authCtx, {
      provider: "password",
      account: {
        id: accountEmail,
        secret: args.newPassword,
      },
    });

    const sessionId = await getAuthSessionId(authCtx);
    await invalidateSessions(authCtx, {
      userId: user.userId,
      ...(sessionId ? { except: [sessionId] } : {}),
    });

    return null;
  },
});

export const changeEmail = action({
  args: {
    currentPassword: v.string(),
    newEmail: v.string(),
  },
  handler: async (ctx, args): Promise<{ email: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required.");
    }
    const authUserId = await getAuthUserId(ctx);

    const nextEmail = args.newEmail.trim().toLowerCase();
    if (!nextEmail) {
      throw new Error("New email is required.");
    }

    const user: {
      userId: Id<"users">;
      email: string | null;
      passwordAccountId: Id<"authAccounts"> | null;
      passwordAccountEmail: string | null;
    } = await ctx.runQuery(internal.businesses.catalog.getCurrentUserForPasswordChange, {
      authSubject: identity.subject,
      ...(authUserId ? { authUserId: String(authUserId) } : {}),
    });
    const accountEmail = user.passwordAccountEmail ?? user.email;

    if (!accountEmail) {
      throw new Error("No email is configured for this account.");
    }

    if (accountEmail === nextEmail) {
      throw new Error("This email is already on your account.");
    }
    if (!user.passwordAccountId) {
      throw new Error("Password account not found.");
    }

    const authCtx = ctx as unknown as Parameters<typeof retrieveAccount>[0];

    await retrieveAccount(authCtx, {
      provider: "password",
      account: {
        id: accountEmail,
        secret: args.currentPassword,
      },
    });

    await ctx.runQuery(internal.businesses.catalog.assertPendingEmailChangeTarget, {
      newEmail: nextEmail,
      userId: user.userId,
    });
    await signInViaProvider(
      ctx as unknown as Parameters<typeof signInViaProvider>[0],
      emailChangeProvider,
      {
        accountId: user.passwordAccountId,
        params: {
          email: nextEmail,
        },
      },
    );

    return {
      email: nextEmail,
    };
  },
});

export const confirmEmailChange = action({
  args: {
    code: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args): Promise<{ email: string }> => {
    const code = args.code.trim();
    const email = args.email.trim().toLowerCase();

    if (!code || !email) {
      throw new Error("Invalid or expired email confirmation link.");
    }

    const result = await ctx.runMutation(internal.businesses.catalog.confirmPendingEmailChange, {
      codeHash: await hashVerificationCode(code),
      email,
    });

    return {
      email: result.email,
    };
  },
});

export const assertCatalogWriteAccess = internalQuery({
  args: {
    businessId: v.id("businesses"),
    authSubject: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", args.authSubject))
      .unique();
    if (!user) {
      throw new Error("User profile not initialized.");
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_user_id_and_business_id", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId),
      )
      .unique();
    if (!membership || membership.status !== "active") {
      throw new Error("You do not have access to this business.");
    }

    return { userId: user._id };
  },
});

export const upsertServiceInternal = internalMutation({
  args: {
    businessId: v.id("businesses"),
    serviceId: v.optional(v.id("services")),
    name: v.string(),
    localizedNames: v.optional(localizedServiceNamesValidator),
    slug: v.string(),
    description: v.optional(v.string()),
    durationMinutes: v.number(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const localizedNames = normalizeLocalizedServiceNames(args.localizedNames);

    if (args.serviceId) {
      await ctx.db.patch(args.serviceId, {
        name: args.name,
        ...(localizedNames !== undefined ? { localizedNames } : {}),
        slug: args.slug,
        ...(args.description !== undefined ? { description: args.description } : {}),
        durationMinutes: args.durationMinutes,
        active: args.active,
      });
      await scheduleSnapshotRefresh(ctx, args.businessId);
      return {
        serviceId: args.serviceId,
        ...(localizedNames !== undefined ? { localizedNames } : {}),
      };
    }

    const serviceId = await ctx.db.insert("services", {
      businessId: args.businessId,
      name: args.name,
      ...(localizedNames !== undefined ? { localizedNames } : {}),
      slug: args.slug,
      ...(args.description !== undefined ? { description: args.description } : {}),
      durationMinutes: args.durationMinutes,
      active: args.active,
    });
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return {
      serviceId,
      ...(localizedNames !== undefined ? { localizedNames } : {}),
    };
  },
});

export const upsertService = action({
  args: {
    businessId: v.id("businesses"),
    serviceId: v.optional(v.id("services")),
    name: v.string(),
    localizedNames: v.optional(localizedServiceNamesValidator),
    slug: v.string(),
    description: v.optional(v.string()),
    durationMinutes: v.number(),
    active: v.boolean(),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{ serviceId: Id<"services">; localizedNames?: { en?: string; fr?: string } }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required.");
    }

    await ctx.runQuery(internal.businesses.catalog.assertCatalogWriteAccess, {
      businessId: args.businessId,
      authSubject: identity.subject,
    });

    const normalizedLocalizedNames = normalizeLocalizedServiceNames(args.localizedNames);
    const localizedNames = await generateMissingLocalizedServiceNames({
      name: args.name,
      ...(normalizedLocalizedNames !== undefined
        ? { localizedNames: normalizedLocalizedNames }
        : {}),
    });

    return await ctx.runMutation(internal.businesses.catalog.upsertServiceInternal, {
      businessId: args.businessId,
      ...(args.serviceId !== undefined ? { serviceId: args.serviceId } : {}),
      name: args.name,
      localizedNames,
      slug: args.slug,
      ...(args.description !== undefined ? { description: args.description } : {}),
      durationMinutes: args.durationMinutes,
      active: args.active,
    });
  },
});

export const upsertStaff = mutation({
  args: {
    businessId: v.id("businesses"),
    staffId: v.optional(v.id("staff")),
    name: v.string(),
    timezone: v.string(),
    active: v.boolean(),
    transferNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);

    if (args.staffId) {
      await ctx.db.patch(args.staffId, {
        name: args.name,
        timezone: args.timezone,
        active: args.active,
        ...(args.transferNumber !== undefined
          ? { transferNumber: args.transferNumber }
          : {}),
      });
      await scheduleSnapshotRefresh(ctx, args.businessId);
      return { staffId: args.staffId };
    }

    const staffId = await ctx.db.insert("staff", {
      businessId: args.businessId,
      name: args.name,
      timezone: args.timezone,
      active: args.active,
      ...(args.transferNumber !== undefined
        ? { transferNumber: args.transferNumber }
        : {}),
    });
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return { staffId };
  },
});

export const replaceBusinessHours = mutation({
  args: {
    businessId: v.id("businesses"),
    hours: v.array(
      v.object({
        dayOfWeek: v.number(),
        openMinutes: v.number(),
        closeMinutes: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const existing = await ctx.db
      .query("business_hours")
      .withIndex("by_business_id_and_day_of_week", (q) =>
        q.eq("businessId", args.businessId),
      )
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const row of args.hours) {
      await ctx.db.insert("business_hours", {
        businessId: args.businessId,
        dayOfWeek: row.dayOfWeek,
        openMinutes: row.openMinutes,
        closeMinutes: row.closeMinutes,
      });
    }

    await scheduleSnapshotRefresh(ctx, args.businessId);
    return null;
  },
});

export const replaceClosures = mutation({
  args: {
    businessId: v.id("businesses"),
    closures: v.array(
      v.object({
        startsAt: v.string(),
        endsAt: v.string(),
        reason: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    const existing = await ctx.db
      .query("closures")
      .withIndex("by_business_id_and_starts_at", (q) => q.eq("businessId", args.businessId))
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const closure of args.closures) {
      await ctx.db.insert("closures", {
        businessId: args.businessId,
        startsAt: closure.startsAt,
        endsAt: closure.endsAt,
        reason: closure.reason,
      });
    }

    await scheduleSnapshotRefresh(ctx, args.businessId);
    return null;
  },
});

export const replaceStaffServiceAssignments = mutation({
  args: {
    businessId: v.id("businesses"),
    assignments: v.array(
      v.object({
        staffId: v.id("staff"),
        serviceId: v.id("services"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    await replaceBusinessStaffServiceAssignments(ctx, {
      businessId: args.businessId,
      assignments: args.assignments,
    });

    await scheduleSnapshotRefresh(ctx, args.businessId);
    return null;
  },
});

export const getPhoneNumberById = internalQuery({
  args: {
    phoneNumberId: v.id("phone_numbers"),
  },
  handler: async (ctx, args): Promise<Doc<"phone_numbers"> | null> => {
    return await ctx.db.get(args.phoneNumberId);
  },
});

export const upsertPhoneNumberInternal = internalMutation({
  args: phoneNumberSaveArgs,
  handler: async (ctx, args) => {
    const conflictingPhoneNumber = await ctx.db
      .query("phone_numbers")
      .withIndex("by_e164", (q) => q.eq("e164", args.e164))
      .collect();
    const duplicate = conflictingPhoneNumber.find(
      (phoneNumber) => phoneNumber._id !== args.phoneNumberId,
    );

    if (duplicate) {
      throw new Error(`The phone number ${args.e164} is already mapped to a business.`);
    }

    if (args.phoneNumberId) {
      const existingPhoneNumber = await ctx.db.get(args.phoneNumberId);
      if (!existingPhoneNumber || existingPhoneNumber.businessId !== args.businessId) {
        throw new Error("Phone number not found for this business.");
      }

      const nextTwilioPhoneSid =
        args.twilioPhoneSid === null
          ? undefined
          : args.twilioPhoneSid !== undefined
            ? args.twilioPhoneSid
            : existingPhoneNumber.twilioPhoneSid;
      const nextRecord = buildPhoneNumberWithWebhookState(
        {
          businessId: existingPhoneNumber.businessId,
          e164: args.e164,
          ...(nextTwilioPhoneSid !== undefined ? { twilioPhoneSid: nextTwilioPhoneSid } : {}),
          voiceEnabled: args.voiceEnabled,
          smsEnabled: args.smsEnabled,
          status: args.status,
        },
        shouldSyncSmsWebhook({
          twilioPhoneSid: nextTwilioPhoneSid,
          smsEnabled: args.smsEnabled,
          status: args.status,
        })
          ? { smsWebhookStatus: "pending" }
          : { smsWebhookStatus: "not_configured" },
      );

      await ctx.db.replace(args.phoneNumberId, nextRecord);
      await scheduleSnapshotRefresh(ctx, args.businessId);
      return {
        phoneNumberId: args.phoneNumberId,
        smsWebhookStatus: nextRecord.smsWebhookStatus ?? "not_configured",
        shouldSyncSmsWebhook: shouldSyncSmsWebhook({
          twilioPhoneSid: nextTwilioPhoneSid,
          smsEnabled: args.smsEnabled,
          status: args.status,
        }),
      } satisfies PhoneNumberUpsertInternalResult;
    }

    const nextTwilioPhoneSid = args.twilioPhoneSid ?? undefined;
    const nextRecord = buildPhoneNumberWithWebhookState(
      {
        businessId: args.businessId,
        e164: args.e164,
        ...(nextTwilioPhoneSid !== undefined
          ? { twilioPhoneSid: nextTwilioPhoneSid }
          : {}),
        voiceEnabled: args.voiceEnabled,
        smsEnabled: args.smsEnabled,
        status: args.status,
      },
      shouldSyncSmsWebhook({
        twilioPhoneSid: nextTwilioPhoneSid,
        smsEnabled: args.smsEnabled,
        status: args.status,
      })
        ? { smsWebhookStatus: "pending" }
        : { smsWebhookStatus: "not_configured" },
    );

    const phoneNumberId = await ctx.db.insert("phone_numbers", nextRecord);
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return {
      phoneNumberId,
      smsWebhookStatus: nextRecord.smsWebhookStatus ?? "not_configured",
      shouldSyncSmsWebhook: shouldSyncSmsWebhook({
        twilioPhoneSid: nextTwilioPhoneSid,
        smsEnabled: args.smsEnabled,
        status: args.status,
      }),
    } satisfies PhoneNumberUpsertInternalResult;
  },
});

export const recordPhoneNumberSmsWebhookSync = internalMutation({
  args: {
    phoneNumberId: v.id("phone_numbers"),
    smsWebhookStatus: v.string(),
    smsWebhookTargetUrl: v.optional(v.string()),
    smsWebhookLastSyncedAt: v.optional(v.string()),
    smsWebhookLastError: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PhoneNumberSaveResult> => {
    const phoneNumber = await ctx.db.get(args.phoneNumberId);
    if (!phoneNumber) {
      throw new Error("Phone number not found.");
    }

    const nextPhoneNumber = buildPhoneNumberWithWebhookState(
      {
        businessId: phoneNumber.businessId,
        e164: phoneNumber.e164,
        ...(phoneNumber.twilioPhoneSid !== undefined
          ? { twilioPhoneSid: phoneNumber.twilioPhoneSid }
          : {}),
        voiceEnabled: phoneNumber.voiceEnabled,
        smsEnabled: phoneNumber.smsEnabled,
        status: phoneNumber.status,
      },
      {
        smsWebhookStatus: args.smsWebhookStatus,
        ...(args.smsWebhookTargetUrl !== undefined
          ? { smsWebhookTargetUrl: args.smsWebhookTargetUrl }
          : {}),
        ...(args.smsWebhookLastSyncedAt !== undefined
          ? { smsWebhookLastSyncedAt: args.smsWebhookLastSyncedAt }
          : {}),
        ...(args.smsWebhookLastError !== undefined
          ? { smsWebhookLastError: args.smsWebhookLastError }
          : {}),
      },
    );

    await ctx.db.replace(args.phoneNumberId, nextPhoneNumber);

    return {
      phoneNumberId: args.phoneNumberId,
      smsWebhookStatus: nextPhoneNumber.smsWebhookStatus ?? "not_configured",
      ...(nextPhoneNumber.smsWebhookLastError !== undefined
        ? { smsWebhookLastError: nextPhoneNumber.smsWebhookLastError }
        : {}),
    };
  },
});

export const syncPhoneNumberSmsWebhook = internalAction({
  args: {
    phoneNumberId: v.id("phone_numbers"),
  },
  handler: async (ctx, args): Promise<PhoneNumberSaveResult> => {
    const phoneNumber = await ctx.runQuery(internal.businesses.catalog.getPhoneNumberById, {
      phoneNumberId: args.phoneNumberId,
    });
    if (!phoneNumber) {
      throw new Error("Phone number not found.");
    }

    if (!shouldSyncSmsWebhook({
      twilioPhoneSid: phoneNumber.twilioPhoneSid,
      smsEnabled: phoneNumber.smsEnabled,
      status: phoneNumber.status,
    })) {
      return await ctx.runMutation(internal.businesses.catalog.recordPhoneNumberSmsWebhookSync, {
        phoneNumberId: args.phoneNumberId,
        smsWebhookStatus: "not_configured",
      });
    }

    const webhookUrl = buildTwilioSmsInboundWebhookUrl();

    try {
      const result = await ctx.runAction(internal.integrations.twilioSms.registerIncomingWebhook, {
        phoneNumberSid: phoneNumber.twilioPhoneSid!,
        webhookUrl,
      });

      return await ctx.runMutation(internal.businesses.catalog.recordPhoneNumberSmsWebhookSync, {
        phoneNumberId: args.phoneNumberId,
        smsWebhookStatus: "synced",
        smsWebhookTargetUrl: result.smsWebhookTargetUrl,
        smsWebhookLastSyncedAt: new Date().toISOString(),
      });
    } catch (error) {
      return await ctx.runMutation(internal.businesses.catalog.recordPhoneNumberSmsWebhookSync, {
        phoneNumberId: args.phoneNumberId,
        smsWebhookStatus: "failed",
        smsWebhookTargetUrl: webhookUrl,
        smsWebhookLastSyncedAt: new Date().toISOString(),
        smsWebhookLastError: error instanceof Error ? error.message : "Twilio webhook sync failed.",
      });
    }
  },
});

export const savePhoneNumber = action({
  args: phoneNumberSaveArgs,
  handler: async (ctx: ActionCtx, args): Promise<PhoneNumberSaveResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required.");
    }

    await ctx.runQuery(internal.businesses.catalog.assertCatalogWriteAccess, {
      businessId: args.businessId,
      authSubject: identity.subject,
    });

    const result = await ctx.runMutation(internal.businesses.catalog.upsertPhoneNumberInternal, args);
    if (!result.shouldSyncSmsWebhook) {
      return {
        phoneNumberId: result.phoneNumberId,
        smsWebhookStatus: result.smsWebhookStatus,
      };
    }

    return await ctx.runAction(internal.businesses.catalog.syncPhoneNumberSmsWebhook, {
      phoneNumberId: result.phoneNumberId,
    });
  },
});
