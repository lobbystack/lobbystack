import { v } from "convex/values";
import {
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
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
import {
  getPasswordAccountForUser,
  resolveUserForPasswordCredentials,
} from "../lib/accountCredentials";
import { getCurrentUser, requireMembership } from "../lib/auth";
import {
  EMAIL_CHANGE_MAX_AGE_SECONDS,
  generateEmailChangeToken,
  sendEmailChangeConfirmation,
} from "../lib/emailChange";
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
import {
  buildTwilioSmsInboundWebhookUrl,
  buildTwilioVoiceInboundWebhookUrl,
} from "../lib/twilioUrls";
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
  voiceWebhookStatus: string;
  voiceWebhookLastError?: string;
  smsWebhookStatus: string;
  smsWebhookLastError?: string;
};

type PhoneNumberUpsertInternalResult = PhoneNumberSaveResult & {
  shouldSyncWebhooks: boolean;
};

type PhoneNumberWebhookSyncInput = {
  twilioPhoneSid: string | undefined;
  voiceEnabled: boolean;
  smsEnabled: boolean;
  status: string;
};

type CredentialsWriterCtx = Pick<MutationCtx, "db">;

function shouldSyncSmsWebhook(input: PhoneNumberWebhookSyncInput): boolean {
  return Boolean(input.twilioPhoneSid && input.smsEnabled && input.status === "active");
}

function shouldSyncVoiceWebhook(input: PhoneNumberWebhookSyncInput): boolean {
  return Boolean(input.twilioPhoneSid && input.voiceEnabled && input.status === "active");
}

function buildPhoneNumberWithWebhookState(
  current: Omit<Doc<"phone_numbers">, "_id" | "_creationTime">,
  webhookState: {
    voiceWebhookStatus: string;
    voiceWebhookTargetUrl?: string;
    voiceWebhookLastSyncedAt?: string;
    voiceWebhookLastError?: string;
    smsWebhookStatus: string;
    smsWebhookTargetUrl?: string;
    smsWebhookLastSyncedAt?: string;
    smsWebhookLastError?: string;
  },
): Omit<Doc<"phone_numbers">, "_id" | "_creationTime"> {
  const next: Omit<Doc<"phone_numbers">, "_id" | "_creationTime"> = {
    ...current,
    ...(webhookState.voiceWebhookStatus
      ? { voiceWebhookStatus: webhookState.voiceWebhookStatus }
      : {}),
    ...(webhookState.smsWebhookStatus ? { smsWebhookStatus: webhookState.smsWebhookStatus } : {}),
  };

  if (webhookState.voiceWebhookTargetUrl !== undefined) {
    next.voiceWebhookTargetUrl = webhookState.voiceWebhookTargetUrl;
  }
  if (webhookState.voiceWebhookLastSyncedAt !== undefined) {
    next.voiceWebhookLastSyncedAt = webhookState.voiceWebhookLastSyncedAt;
  }
  if (webhookState.voiceWebhookLastError !== undefined) {
    next.voiceWebhookLastError = webhookState.voiceWebhookLastError;
  }
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

function buildPhoneNumberWebhookPendingState(
  input: PhoneNumberWebhookSyncInput,
): {
  voiceWebhookStatus: string;
  smsWebhookStatus: string;
} {
  return {
    voiceWebhookStatus: shouldSyncVoiceWebhook(input) ? "pending" : "not_configured",
    smsWebhookStatus: shouldSyncSmsWebhook(input) ? "pending" : "not_configured",
  };
}

async function assertPasswordEmailAvailable(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
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

async function clearPendingEmailChangesForAccount(
  ctx: CredentialsWriterCtx,
  accountId: Id<"authAccounts">,
): Promise<void> {
  const existingRequests = await ctx.db
    .query("pending_email_changes")
    .withIndex("by_account_id", (q) => q.eq("accountId", accountId))
    .collect();

  for (const existingRequest of existingRequests) {
    await ctx.db.delete(existingRequest._id);
  }
}

async function clearVerificationCodesForAccount(
  ctx: CredentialsWriterCtx,
  accountId: Id<"authAccounts">,
): Promise<void> {
  const verificationCodes = await ctx.db
    .query("authVerificationCodes")
    .withIndex("accountId", (q) => q.eq("accountId", accountId))
    .collect();

  for (const verificationCode of verificationCodes) {
    await ctx.db.delete(verificationCode._id);
  }
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
    const { user, passwordAccount } = await resolveUserForPasswordCredentials(ctx, args);

    if (!user) {
      throw new Error("User profile not initialized.");
    }

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

    try {
      await assertPasswordEmailAvailable(ctx, {
        newEmail: args.newEmail,
        userId: args.userId,
        currentAccountId: passwordAccount._id,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("already exists")) {
        return false;
      }
      throw error;
    }
  },
});

export const createPendingEmailChange = internalMutation({
  args: {
    accountId: v.id("authAccounts"),
    codeHash: v.string(),
    email: v.string(),
    expirationTime: v.number(),
  },
  handler: async (ctx, args) => {
    await clearPendingEmailChangesForAccount(ctx, args.accountId);

    await ctx.db.insert("pending_email_changes", {
      accountId: args.accountId,
      codeHash: args.codeHash,
      expirationTime: args.expirationTime,
      email: args.email,
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
    const pendingEmailChange = await ctx.db
      .query("pending_email_changes")
      .withIndex("by_code_hash", (q) => q.eq("codeHash", args.codeHash))
      .unique();

    if (!pendingEmailChange) {
      throw new Error("Invalid or expired email confirmation link.");
    }

    if (pendingEmailChange.expirationTime < Date.now()) {
      await ctx.db.delete(pendingEmailChange._id);
      throw new Error("Invalid or expired email confirmation link.");
    }

    const nextEmail = pendingEmailChange.email.trim().toLowerCase();
    if (!nextEmail || nextEmail !== args.email) {
      throw new Error("Invalid or expired email confirmation link.");
    }

    const account = await ctx.db.get(pendingEmailChange.accountId);
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

    await clearVerificationCodesForAccount(ctx, account._id);
    await ctx.db.patch(account._id, {
      providerAccountId: nextEmail,
      emailVerified: nextEmail,
    });
    await ctx.db.patch(user._id, {
      email: nextEmail,
      emailVerificationTime: Date.now(),
    });
    await ctx.db.delete(pendingEmailChange._id);

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

    const canSendConfirmation: boolean = await ctx.runQuery(
      internal.businesses.catalog.assertPendingEmailChangeTarget,
      {
        newEmail: nextEmail,
        userId: user.userId,
      },
    );
    if (!canSendConfirmation) {
      const clearPendingEmailChangesResult: null = await ctx.runMutation(
        (internal as any).businesses.catalog.clearPendingEmailChanges,
        {
          accountId: user.passwordAccountId,
        },
      );
      void clearPendingEmailChangesResult;
      return {
        email: nextEmail,
      };
    }
    const confirmationToken = generateEmailChangeToken();
    const createPendingEmailChangeResult: null = await ctx.runMutation(
      (internal as any).businesses.catalog.createPendingEmailChange,
      {
        accountId: user.passwordAccountId,
        codeHash: await hashVerificationCode(confirmationToken),
        email: nextEmail,
        expirationTime: Date.now() + EMAIL_CHANGE_MAX_AGE_SECONDS * 1000,
      },
    );
    await sendEmailChangeConfirmation(
      ctx as unknown as Pick<ActionCtx, "runMutation">,
      {
        email: nextEmail,
        token: confirmationToken,
      },
    );
    void createPendingEmailChangeResult;

    return {
      email: nextEmail,
    };
  },
});

export const clearPendingEmailChanges = internalMutation({
  args: {
    accountId: v.id("authAccounts"),
  },
  handler: async (ctx, args) => {
    await clearPendingEmailChangesForAccount(ctx, args.accountId);
    return null;
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
    const authCtx = ctx as unknown as Parameters<typeof invalidateSessions>[0];
    const sessionId = await getAuthSessionId(authCtx);
    await invalidateSessions(authCtx, {
      userId: result.userId,
      ...(sessionId ? { except: [sessionId] } : {}),
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
    authUserId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    userId: Id<"users">;
  }> => {
    const currentUser = await getCurrentUser(ctx);
    const fallbackUserId: Id<"users"> | null =
      currentUser?._id ??
      (await ctx.runQuery(internal.users.resolveAuthenticatedUserForBusiness, {
        businessId: args.businessId,
        authSubject: args.authSubject,
        ...(args.authUserId ? { authUserId: args.authUserId } : {}),
      }));
    const user = currentUser ?? (fallbackUserId ? await ctx.db.get(fallbackUserId) : null);
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
    const authUserId = await getAuthUserId(ctx);

    await ctx.runQuery(internal.businesses.catalog.assertCatalogWriteAccess, {
      businessId: args.businessId,
      authSubject: identity.subject,
      ...(authUserId ? { authUserId: String(authUserId) } : {}),
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
        buildPhoneNumberWebhookPendingState({
          twilioPhoneSid: nextTwilioPhoneSid,
          voiceEnabled: args.voiceEnabled,
          smsEnabled: args.smsEnabled,
          status: args.status,
        }),
      );

      await ctx.db.replace(args.phoneNumberId, nextRecord);
      await scheduleSnapshotRefresh(ctx, args.businessId);
      return {
        phoneNumberId: args.phoneNumberId,
        voiceWebhookStatus: nextRecord.voiceWebhookStatus ?? "not_configured",
        smsWebhookStatus: nextRecord.smsWebhookStatus ?? "not_configured",
        shouldSyncWebhooks:
          shouldSyncVoiceWebhook({
            twilioPhoneSid: nextTwilioPhoneSid,
            voiceEnabled: args.voiceEnabled,
            smsEnabled: args.smsEnabled,
            status: args.status,
          }) ||
          shouldSyncSmsWebhook({
          twilioPhoneSid: nextTwilioPhoneSid,
          voiceEnabled: args.voiceEnabled,
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
      buildPhoneNumberWebhookPendingState({
        twilioPhoneSid: nextTwilioPhoneSid,
        voiceEnabled: args.voiceEnabled,
        smsEnabled: args.smsEnabled,
        status: args.status,
      }),
    );

    const phoneNumberId = await ctx.db.insert("phone_numbers", nextRecord);
    await scheduleSnapshotRefresh(ctx, args.businessId);
    return {
      phoneNumberId,
      voiceWebhookStatus: nextRecord.voiceWebhookStatus ?? "not_configured",
      smsWebhookStatus: nextRecord.smsWebhookStatus ?? "not_configured",
      shouldSyncWebhooks:
        shouldSyncVoiceWebhook({
          twilioPhoneSid: nextTwilioPhoneSid,
          voiceEnabled: args.voiceEnabled,
          smsEnabled: args.smsEnabled,
          status: args.status,
        }) ||
        shouldSyncSmsWebhook({
        twilioPhoneSid: nextTwilioPhoneSid,
        voiceEnabled: args.voiceEnabled,
        smsEnabled: args.smsEnabled,
        status: args.status,
        }),
    } satisfies PhoneNumberUpsertInternalResult;
  },
});

export const recordPhoneNumberWebhookSync = internalMutation({
  args: {
    phoneNumberId: v.id("phone_numbers"),
    voiceWebhookStatus: v.string(),
    voiceWebhookTargetUrl: v.optional(v.string()),
    voiceWebhookLastSyncedAt: v.optional(v.string()),
    voiceWebhookLastError: v.optional(v.string()),
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
        voiceWebhookStatus: args.voiceWebhookStatus,
        ...(args.voiceWebhookTargetUrl !== undefined
          ? { voiceWebhookTargetUrl: args.voiceWebhookTargetUrl }
          : {}),
        ...(args.voiceWebhookLastSyncedAt !== undefined
          ? { voiceWebhookLastSyncedAt: args.voiceWebhookLastSyncedAt }
          : {}),
        ...(args.voiceWebhookLastError !== undefined
          ? { voiceWebhookLastError: args.voiceWebhookLastError }
          : {}),
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
      voiceWebhookStatus: nextPhoneNumber.voiceWebhookStatus ?? "not_configured",
      ...(nextPhoneNumber.voiceWebhookLastError !== undefined
        ? { voiceWebhookLastError: nextPhoneNumber.voiceWebhookLastError }
        : {}),
      smsWebhookStatus: nextPhoneNumber.smsWebhookStatus ?? "not_configured",
      ...(nextPhoneNumber.smsWebhookLastError !== undefined
        ? { smsWebhookLastError: nextPhoneNumber.smsWebhookLastError }
        : {}),
    };
  },
});

export const syncPhoneNumberWebhooks = internalAction({
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
      voiceEnabled: phoneNumber.voiceEnabled,
      smsEnabled: phoneNumber.smsEnabled,
      status: phoneNumber.status,
    }) &&
      !shouldSyncVoiceWebhook({
        twilioPhoneSid: phoneNumber.twilioPhoneSid,
        voiceEnabled: phoneNumber.voiceEnabled,
        smsEnabled: phoneNumber.smsEnabled,
        status: phoneNumber.status,
      })) {
      return await ctx.runMutation(internal.businesses.catalog.recordPhoneNumberWebhookSync, {
        phoneNumberId: args.phoneNumberId,
        voiceWebhookStatus: "not_configured",
        smsWebhookStatus: "not_configured",
      });
    }

    const smsWebhookUrl = buildTwilioSmsInboundWebhookUrl();
    const voiceWebhookUrl = buildTwilioVoiceInboundWebhookUrl();
    const shouldSyncVoice = shouldSyncVoiceWebhook({
      twilioPhoneSid: phoneNumber.twilioPhoneSid,
      voiceEnabled: phoneNumber.voiceEnabled,
      smsEnabled: phoneNumber.smsEnabled,
      status: phoneNumber.status,
    });
    const shouldSyncSms = shouldSyncSmsWebhook({
      twilioPhoneSid: phoneNumber.twilioPhoneSid,
      voiceEnabled: phoneNumber.voiceEnabled,
      smsEnabled: phoneNumber.smsEnabled,
      status: phoneNumber.status,
    });

    try {
      const result = await ctx.runAction(internal.integrations.twilioSms.registerIncomingWebhook, {
        phoneNumberSid: phoneNumber.twilioPhoneSid!,
        ...(shouldSyncSms ? { smsWebhookUrl } : {}),
        ...(shouldSyncVoice ? { voiceWebhookUrl } : {}),
      });

      return await ctx.runMutation(internal.businesses.catalog.recordPhoneNumberWebhookSync, {
        phoneNumberId: args.phoneNumberId,
        voiceWebhookStatus: shouldSyncVoice ? "synced" : "not_configured",
        ...(shouldSyncVoice
          ? {
              voiceWebhookTargetUrl: result.voiceWebhookTargetUrl ?? voiceWebhookUrl,
              voiceWebhookLastSyncedAt: new Date().toISOString(),
            }
          : {}),
        smsWebhookStatus: shouldSyncSms ? "synced" : "not_configured",
        ...(shouldSyncSms
          ? {
              smsWebhookTargetUrl: result.smsWebhookTargetUrl ?? smsWebhookUrl,
              smsWebhookLastSyncedAt: new Date().toISOString(),
            }
          : {}),
      });
    } catch (error) {
      return await ctx.runMutation(internal.businesses.catalog.recordPhoneNumberWebhookSync, {
        phoneNumberId: args.phoneNumberId,
        voiceWebhookStatus: shouldSyncVoice ? "failed" : "not_configured",
        ...(shouldSyncVoice
          ? {
              voiceWebhookTargetUrl: voiceWebhookUrl,
              voiceWebhookLastSyncedAt: new Date().toISOString(),
              voiceWebhookLastError:
                error instanceof Error ? error.message : "Twilio voice webhook sync failed.",
            }
          : {}),
        smsWebhookStatus: shouldSyncSms ? "failed" : "not_configured",
        ...(shouldSyncSms
          ? {
              smsWebhookTargetUrl: smsWebhookUrl,
              smsWebhookLastSyncedAt: new Date().toISOString(),
              smsWebhookLastError:
                error instanceof Error ? error.message : "Twilio SMS webhook sync failed.",
            }
          : {}),
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
    const authUserId = await getAuthUserId(ctx);

    await ctx.runQuery(internal.businesses.catalog.assertCatalogWriteAccess, {
      businessId: args.businessId,
      authSubject: identity.subject,
      ...(authUserId ? { authUserId: String(authUserId) } : {}),
    });

    const result = await ctx.runMutation(internal.businesses.catalog.upsertPhoneNumberInternal, args);
    if (!result.shouldSyncWebhooks) {
      return {
        phoneNumberId: result.phoneNumberId,
        voiceWebhookStatus: result.voiceWebhookStatus,
        smsWebhookStatus: result.smsWebhookStatus,
      };
    }

    return await ctx.runAction(internal.businesses.catalog.syncPhoneNumberWebhooks, {
      phoneNumberId: result.phoneNumberId,
    });
  },
});
