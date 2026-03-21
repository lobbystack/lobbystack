import { convexTest } from "convex-test";
import { Scrypt } from "lucia";
import { describe, expect, it } from "vitest";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const convexModules = import.meta.glob("../../../convex/**/*.ts");

describe("account credential settings", () => {
  it("lets an authenticated user change the email on their password account", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "account-owner";
    const currentPassword = "CurrentPass123!";
    const currentEmail = "owner@example.com";
    const nextEmail = "updated@example.com";
    const nextPassword = "ChangedPass123!";
    const secret = await new Scrypt().hash(currentPassword);

    const seeded = await t.run(async (ctx) => {
      const userId: Id<"users"> = await ctx.db.insert("users", {
        authSubject: subject,
        email: currentEmail,
      });

      await ctx.db.insert("authAccounts", {
        userId,
        provider: "password",
        providerAccountId: currentEmail,
        secret,
      });

      return { userId };
    });

    const asOwner = t.withIdentity({ subject });

    await expect(
      asOwner.action(api.businesses.catalog.changeEmail, {
        currentPassword,
        newEmail: nextEmail,
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
      expect(newAccount?.secret).not.toBe(secret);
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
