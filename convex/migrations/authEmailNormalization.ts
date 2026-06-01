import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { observedInternalMutation as internalMutation } from "../telemetry/observedFunctions";
import { normalizeAuthEmail } from "../../packages/shared/src/auth";
import {
  AUTH_EMAIL_CLAIMS_BACKFILL_STATE_KEY,
  assertAuthEmailClaimAvailable,
  replaceAuthEmailClaimsForAccount,
} from "../lib/authEmailClaims";

type PasswordAccount = Doc<"authAccounts">;

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 250;

function isPasswordAccountWithEmail(
  account: Doc<"authAccounts">,
): account is PasswordAccount & { providerAccountId: string } {
  return account.provider === "password" && typeof account.providerAccountId === "string";
}

function getBatchSize(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_BATCH_SIZE;
  }
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(value)));
}

async function hasLowercasePasswordAccountSibling(
  ctx: MutationCtx,
  account: PasswordAccount & { providerAccountId: string },
  normalizedEmail: string,
): Promise<boolean> {
  const lowercaseSibling = await ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q) =>
      q.eq("provider", "password").eq("providerAccountId", normalizedEmail),
    )
    .unique();

  return Boolean(lowercaseSibling && lowercaseSibling._id !== account._id);
}

async function markAuthEmailClaimsBackfillComplete(ctx: MutationCtx): Promise<void> {
  const completedAt = Date.now();
  const existingState = await ctx.db
    .query("auth_email_claim_backfill_state")
    .withIndex("by_key", (q) =>
      q.eq("key", AUTH_EMAIL_CLAIMS_BACKFILL_STATE_KEY),
    )
    .unique();

  if (existingState) {
    await ctx.db.patch(existingState._id, { completedAt });
    return;
  }

  await ctx.db.insert("auth_email_claim_backfill_state", {
    key: AUTH_EMAIL_CLAIMS_BACKFILL_STATE_KEY,
    completedAt,
  });
}

export const auditLegacyPasswordEmailsPage = internalMutation({
  args: {
    accountsCursor: v.union(v.string(), v.null()),
    usersCursor: v.union(v.string(), v.null()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = getBatchSize(args.numItems);
    const [accountsPage, usersPage] = await Promise.all([
      ctx.db.query("authAccounts").paginate({
        cursor: args.accountsCursor,
        numItems,
      }),
      ctx.db.query("users").paginate({
        cursor: args.usersCursor,
        numItems,
      }),
    ]);

    let passwordAccounts = 0;
    let mixedAccounts = 0;
    let lowercaseSiblingCollisions = 0;

    for (const account of accountsPage.page) {
      if (!isPasswordAccountWithEmail(account)) {
        continue;
      }

      passwordAccounts += 1;
      const normalizedEmail = normalizeAuthEmail(account.providerAccountId);
      if (account.providerAccountId === normalizedEmail) {
        continue;
      }

      mixedAccounts += 1;
      if (await hasLowercasePasswordAccountSibling(ctx, account, normalizedEmail)) {
        lowercaseSiblingCollisions += 1;
      }
    }

    let nonNormalizedUserEmails = 0;
    for (const user of usersPage.page) {
      if (typeof user.email === "string" && user.email !== normalizeAuthEmail(user.email)) {
        nonNormalizedUserEmails += 1;
      }
    }

    return {
      accounts: {
        continueCursor: accountsPage.continueCursor,
        isDone: accountsPage.isDone,
        passwordAccounts,
        mixedAccounts,
        lowercaseSiblingCollisions,
      },
      users: {
        continueCursor: usersPage.continueCursor,
        isDone: usersPage.isDone,
        nonNormalizedUserEmails,
      },
    };
  },
});

export const normalizeLegacyPasswordEmails = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    dryRun: v.boolean(),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("authAccounts").paginate({
      cursor: args.cursor,
      numItems: getBatchSize(args.numItems),
    });

    let scannedAccounts = 0;
    let scannedPasswordAccounts = 0;
    let mixedAccounts = 0;
    let migratedAccounts = 0;
    let migratedUsers = 0;
    let migratedEmailVerified = 0;

    for (const account of page.page) {
      scannedAccounts += 1;
      if (!isPasswordAccountWithEmail(account)) {
        continue;
      }

      scannedPasswordAccounts += 1;
      const normalizedEmail = normalizeAuthEmail(account.providerAccountId);
      if (account.providerAccountId === normalizedEmail) {
        continue;
      }

      mixedAccounts += 1;
      if (await hasLowercasePasswordAccountSibling(ctx, account, normalizedEmail)) {
        throw new Error("Lowercase password account sibling exists; aborting migration.");
      }

      const user = await ctx.db.get(account.userId);
      if (!user) {
        throw new Error("Linked user is missing; aborting migration.");
      }
      if (
        typeof user.email === "string" &&
        normalizeAuthEmail(user.email) !== normalizedEmail
      ) {
        throw new Error(
          "Linked user email does not normalize to account email; aborting migration.",
        );
      }

      if (!args.dryRun) {
        await assertAuthEmailClaimAvailable(ctx, {
          provider: "password",
          normalizedEmail,
          currentAccountId: account._id,
          currentUserId: user._id,
        });
        await ctx.db.patch(account._id, {
          providerAccountId: normalizedEmail,
          ...(account.emailVerified === account.providerAccountId
            ? { emailVerified: normalizedEmail }
            : {}),
        });
        migratedAccounts += 1;

        if (typeof user.email === "string" && user.email !== normalizedEmail) {
          await ctx.db.patch(user._id, { email: normalizedEmail });
          migratedUsers += 1;
        }
        await replaceAuthEmailClaimsForAccount(ctx, {
          provider: "password",
          normalizedEmail,
          accountId: account._id,
          userId: user._id,
        });

        if (account.emailVerified === account.providerAccountId) {
          migratedEmailVerified += 1;
        }
      }
    }

    return {
      dryRun: args.dryRun,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      scannedAccounts,
      scannedPasswordAccounts,
      mixedAccounts,
      migratableAccounts: mixedAccounts,
      migratedAccounts,
      migratedUsers,
      migratedEmailVerified,
    };
  },
});

export const backfillAuthEmailClaimsPage = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    dryRun: v.boolean(),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("authAccounts").paginate({
      cursor: args.cursor,
      numItems: getBatchSize(args.numItems),
    });

    let scannedAccounts = 0;
    let passwordAccounts = 0;
    let claimableAccounts = 0;
    let backfilledClaims = 0;

    for (const account of page.page) {
      scannedAccounts += 1;
      if (!isPasswordAccountWithEmail(account)) {
        continue;
      }

      passwordAccounts += 1;
      const normalizedEmail = normalizeAuthEmail(account.providerAccountId);
      if (!normalizedEmail) {
        continue;
      }

      const user = await ctx.db.get(account.userId);
      if (!user) {
        throw new Error("Linked user is missing; aborting claim backfill.");
      }

      claimableAccounts += 1;
      await assertAuthEmailClaimAvailable(ctx, {
        provider: "password",
        normalizedEmail,
        currentAccountId: account._id,
        currentUserId: user._id,
      });

      if (!args.dryRun) {
        await replaceAuthEmailClaimsForAccount(ctx, {
          provider: "password",
          normalizedEmail,
          accountId: account._id,
          userId: user._id,
        });
        backfilledClaims += 1;
      }
    }

    if (!args.dryRun && page.isDone) {
      await markAuthEmailClaimsBackfillComplete(ctx);
    }

    return {
      dryRun: args.dryRun,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      scannedAccounts,
      passwordAccounts,
      claimableAccounts,
      backfilledClaims,
    };
  },
});
