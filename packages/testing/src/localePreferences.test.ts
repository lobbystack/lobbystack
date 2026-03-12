import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../../../convex/_generated/api";
import schema from "../../../convex/schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const convexModules = import.meta.glob("../../../convex/**/*.ts");

describe("Locale preferences", () => {
  it("lets an authenticated user read and update their preferred locale", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "locale-owner";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        authSubject: subject,
      });
    });

    const asLocaleOwner = t.withIdentity({ subject });

    expect(await asLocaleOwner.query(api.users.preferences.getPreferredLocale, {})).toBeNull();

    await asLocaleOwner.mutation(api.users.preferences.updatePreferredLocale, {
      locale: "fr",
    });

    expect(await asLocaleOwner.query(api.users.preferences.getPreferredLocale, {})).toBe("fr");
  });

  it("rejects unsupported locale values", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "locale-validation-user";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        authSubject: subject,
      });
    });

    const asLocaleOwner = t.withIdentity({ subject });

    await expect(
      asLocaleOwner.mutation(api.users.preferences.updatePreferredLocale, {
        locale: "es" as never,
      }),
    ).rejects.toThrow();
  });

  it("updates only the authenticated user's locale", async () => {
    const t = convexTest(schema, convexModules);
    const firstSubject = "locale-user-one";
    const secondSubject = "locale-user-two";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        authSubject: firstSubject,
        preferredLocale: "en",
      });
      await ctx.db.insert("users", {
        authSubject: secondSubject,
        preferredLocale: "en",
      });
    });

    const asFirstUser = t.withIdentity({ subject: firstSubject });
    const asSecondUser = t.withIdentity({ subject: secondSubject });

    await asFirstUser.mutation(api.users.preferences.updatePreferredLocale, {
      locale: "fr",
    });

    expect(await asFirstUser.query(api.users.preferences.getPreferredLocale, {})).toBe("fr");
    expect(await asSecondUser.query(api.users.preferences.getPreferredLocale, {})).toBe("en");
  });
});
