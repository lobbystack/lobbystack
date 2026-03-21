import { convexTest } from "convex-test";
import { Scrypt } from "lucia";
import { describe, expect, it } from "vitest";

import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const convexModules = import.meta.glob("../../../convex/**/*.ts");

describe("account credential settings", () => {
  it("returns the password credential email as the current email", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "account-owner";

    await t.run(async (ctx) => {
      const userId: Id<"users"> = await ctx.db.insert("users", {
        authSubject: subject,
        email: "stale@example.com",
      });

      await ctx.db.insert("authAccounts", {
        userId,
        provider: "password",
        providerAccountId: "current@example.com",
        secret: "hashed-secret",
      });
    });

    const asOwner = t.withIdentity({ subject });

    await expect(asOwner.query(api.users.current, {})).resolves.toMatchObject({
      email: "current@example.com",
    });
  });

  it("resolves credential changes from the row that owns the password account", async () => {
    const t = convexTest(schema, convexModules);

    const seeded = await t.run(async (ctx) => {
      const authUserId: Id<"users"> = await ctx.db.insert("users", {
        email: "auth-user@example.com",
      });
      const authSubject = `${String(authUserId)}|session-1`;
      const legacyUserId: Id<"users"> = await ctx.db.insert("users", {
        authSubject,
        email: "legacy-user@example.com",
      });
      const passwordAccountId: Id<"authAccounts"> = await ctx.db.insert("authAccounts", {
        userId: legacyUserId,
        provider: "password",
        providerAccountId: "legacy-user@example.com",
        secret: "hashed-secret",
      });

      return { authSubject, authUserId, legacyUserId, passwordAccountId };
    });

    await expect(
      t.query((internal as any).businesses.catalog.getCurrentUserForPasswordChange, {
        authSubject: seeded.authSubject,
        authUserId: String(seeded.authUserId),
      }),
    ).resolves.toMatchObject({
      userId: seeded.legacyUserId,
      passwordAccountId: seeded.passwordAccountId,
      passwordAccountEmail: "legacy-user@example.com",
      email: "legacy-user@example.com",
    });
  });

  it("confirms an email change link and updates the password account email", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "account-owner";
    const currentPassword = "CurrentPass123!";
    const currentEmail = "owner@example.com";
    const nextEmail = "updated@example.com";
    const nextPassword = "ChangedPass123!";
    const confirmationCode = "confirm-email-change";
    const secret = await new Scrypt().hash(currentPassword);

    const seeded = await t.run(async (ctx) => {
      const userId: Id<"users"> = await ctx.db.insert("users", {
        authSubject: subject,
        email: currentEmail,
      });

      const accountId: Id<"authAccounts"> = await ctx.db.insert("authAccounts", {
        userId,
        provider: "password",
        providerAccountId: currentEmail,
        secret,
      });

      await ctx.db.insert("pending_email_changes", {
        accountId,
        codeHash: await hashCode(confirmationCode),
        expirationTime: Date.now() + 5 * 60 * 1000,
        email: nextEmail,
      });

      return { userId };
    });

    const asOwner = t.withIdentity({ subject });

    await expect(
      t.action(api.businesses.catalog.confirmEmailChange, {
        code: confirmationCode,
        email: nextEmail,
      }),
    ).resolves.toEqual({ email: nextEmail });

    await expect(
      asOwner.action(api.businesses.catalog.changePassword, {
        currentPassword,
        newPassword: nextPassword,
      }),
    ).resolves.toBeNull();

    await t.run(async (ctx) => {
      const user = await ctx.db.get(seeded.userId);
      const oldAccount = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", currentEmail),
        )
        .unique();
      const newAccount = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", nextEmail),
        )
        .unique();

      expect(user?.email).toBe(nextEmail);
      expect(oldAccount).toBeNull();
      expect(newAccount?.userId).toBe(seeded.userId);
      expect(newAccount?.providerAccountId).toBe(nextEmail);
      expect(newAccount?.emailVerified).toBe(nextEmail);
      expect(newAccount?.secret).not.toBe(secret);
      expect(
        await ctx.db
          .query("pending_email_changes")
          .withIndex("by_account_id", (q) => q.eq("accountId", newAccount!._id))
          .unique(),
      ).toBeNull();
    });
  });

  it("stores a pending email change without updating the current user email", async () => {
    const t = convexTest(schema, convexModules);
    const currentEmail = "owner@example.com";
    const nextEmail = "updated@example.com";
    const confirmationCode = "confirm-email-change";

    const seeded = await t.run(async (ctx) => {
      const userId: Id<"users"> = await ctx.db.insert("users", {
        authSubject: "account-owner",
        email: currentEmail,
      });
      const accountId: Id<"authAccounts"> = await ctx.db.insert("authAccounts", {
        userId,
        provider: "password",
        providerAccountId: currentEmail,
        secret: "hashed-secret",
      });

      return { accountId, userId };
    });

    await t.mutation((internal as any).businesses.catalog.createPendingEmailChange, {
      accountId: seeded.accountId,
      codeHash: await hashCode(confirmationCode),
      email: nextEmail,
      expirationTime: Date.now() + 5 * 60 * 1000,
    });

    await t.run(async (ctx) => {
      const user = await ctx.db.get(seeded.userId);
      const pendingEmailChange = await ctx.db
        .query("pending_email_changes")
        .withIndex("by_account_id", (q) => q.eq("accountId", seeded.accountId))
        .unique();

      expect(user?.email).toBe(currentEmail);
      expect(pendingEmailChange?.email).toBe(nextEmail);
    });
  });

  it("keeps password reset verification codes when storing a pending email change", async () => {
    const t = convexTest(schema, convexModules);
    const currentEmail = "owner@example.com";
    const nextEmail = "updated@example.com";
    const resetCode = "12345678";
    const confirmationCode = "confirm-email-change";

    const seeded = await t.run(async (ctx) => {
      const userId: Id<"users"> = await ctx.db.insert("users", {
        authSubject: "account-owner",
        email: currentEmail,
      });
      const accountId: Id<"authAccounts"> = await ctx.db.insert("authAccounts", {
        userId,
        provider: "password",
        providerAccountId: currentEmail,
        secret: "hashed-secret",
      });
      const resetVerificationCodeId: Id<"authVerificationCodes"> = await ctx.db.insert(
        "authVerificationCodes",
        {
          accountId,
          provider: "email",
          code: await hashCode(resetCode),
          expirationTime: Date.now() + 5 * 60 * 1000,
          emailVerified: currentEmail,
        },
      );

      return { accountId, resetVerificationCodeId };
    });

    await t.mutation((internal as any).businesses.catalog.createPendingEmailChange, {
      accountId: seeded.accountId,
      codeHash: await hashCode(confirmationCode),
      email: nextEmail,
      expirationTime: Date.now() + 5 * 60 * 1000,
    });

    await t.run(async (ctx) => {
      const resetVerificationCode = await ctx.db.get(seeded.resetVerificationCodeId);
      const pendingEmailChange = await ctx.db
        .query("pending_email_changes")
        .withIndex("by_account_id", (q) => q.eq("accountId", seeded.accountId))
        .unique();

      expect(resetVerificationCode).not.toBeNull();
      expect(pendingEmailChange?.codeHash).toBe(await hashCode(confirmationCode));
    });
  });

  it("rejects changing to an email that already belongs to another password account", async () => {
    const t = convexTest(schema, convexModules);
    const currentPassword = "CurrentPass123!";
    const currentSecret = await new Scrypt().hash(currentPassword);
    const takenSecret = await new Scrypt().hash("AnotherPass123!");

    await t.run(async (ctx) => {
      const ownerId: Id<"users"> = await ctx.db.insert("users", {
        authSubject: "account-owner",
        email: "owner@example.com",
      });
      const otherId: Id<"users"> = await ctx.db.insert("users", {
        authSubject: "account-other",
        email: "taken@example.com",
      });

      await ctx.db.insert("authAccounts", {
        userId: ownerId,
        provider: "password",
        providerAccountId: "owner@example.com",
        secret: currentSecret,
      });
      await ctx.db.insert("authAccounts", {
        userId: otherId,
        provider: "password",
        providerAccountId: "taken@example.com",
        secret: takenSecret,
      });
    });

    const asOwner = t.withIdentity({ subject: "account-owner" });

    await expect(
      asOwner.action(api.businesses.catalog.changeEmail, {
        currentPassword,
        newEmail: "taken@example.com",
      }),
    ).rejects.toThrow("already exists");
  });
});

async function hashCode(code: string): Promise<string> {
  const encoded = new TextEncoder().encode(code);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
