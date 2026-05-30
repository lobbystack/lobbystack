import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { normalizeAuthEmail } from "../../packages/shared/src/auth";

type PasswordAccount = Doc<"authAccounts">;

function isPasswordAccountWithEmail(
  account: Doc<"authAccounts">,
): account is PasswordAccount & { providerAccountId: string } {
  return account.provider === "password" && typeof account.providerAccountId === "string";
}

function getNormalizedDuplicateGroupCount(
  accounts: Array<PasswordAccount & { providerAccountId: string }>,
) {
  const byNormalizedEmail = new Map<
    string,
    Array<PasswordAccount & { providerAccountId: string }>
  >();
  for (const account of accounts) {
    const normalizedEmail = normalizeAuthEmail(account.providerAccountId);
    byNormalizedEmail.set(normalizedEmail, [
      ...(byNormalizedEmail.get(normalizedEmail) ?? []),
      account,
    ]);
  }

  return Array.from(byNormalizedEmail.values()).filter((group) => group.length > 1).length;
}

export const normalizeLegacyPasswordEmails = internalMutation({
  args: {
    dryRun: v.boolean(),
    expectedMixedAccounts: v.number(),
    expectedNonNormalizedUserEmails: v.number(),
    expectedNormalizedDuplicateGroups: v.number(),
    expectedPasswordAccounts: v.number(),
  },
  handler: async (ctx, args) => {
    const allAccounts = await ctx.db.query("authAccounts").collect();
    const passwordAccounts = allAccounts.filter(isPasswordAccountWithEmail);
    const mixedAccounts = passwordAccounts.filter(
      (account) => account.providerAccountId !== normalizeAuthEmail(account.providerAccountId),
    );
    const normalizedDuplicateGroups = getNormalizedDuplicateGroupCount(passwordAccounts);
    const users = await ctx.db.query("users").collect();
    const usersWithNonNormalizedEmail = users.filter(
      (user) =>
        typeof user.email === "string" && user.email !== normalizeAuthEmail(user.email),
    );

    const stats = {
      passwordAccounts: passwordAccounts.length,
      mixedAccounts: mixedAccounts.length,
      nonNormalizedUserEmails: usersWithNonNormalizedEmail.length,
      normalizedDuplicateGroups,
    };

    if (
      stats.passwordAccounts !== args.expectedPasswordAccounts ||
      stats.mixedAccounts !== args.expectedMixedAccounts ||
      stats.nonNormalizedUserEmails !== args.expectedNonNormalizedUserEmails ||
      stats.normalizedDuplicateGroups !== args.expectedNormalizedDuplicateGroups
    ) {
      throw new Error("Auth email normalization audit counts changed; aborting migration.");
    }

    if (stats.normalizedDuplicateGroups !== 0) {
      throw new Error("Normalized password account duplicates exist; aborting migration.");
    }

    let migratedAccounts = 0;
    let migratedUsers = 0;
    let migratedEmailVerified = 0;

    for (const account of mixedAccounts) {
      const normalizedEmail = normalizeAuthEmail(account.providerAccountId);
      const lowercaseSibling = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", normalizedEmail),
        )
        .unique();
      if (lowercaseSibling && lowercaseSibling._id !== account._id) {
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

        if (account.emailVerified === account.providerAccountId) {
          migratedEmailVerified += 1;
        }
      }
    }

    return {
      dryRun: args.dryRun,
      ...stats,
      migratableAccounts: mixedAccounts.length,
      migratedAccounts,
      migratedUsers,
      migratedEmailVerified,
    };
  },
});
