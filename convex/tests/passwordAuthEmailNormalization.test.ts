import { convexTest, type TestConvex } from "convex-test";
import { Scrypt } from "lucia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const TEST_JWT_PRIVATE_KEY = [
  "-----BEGIN PRIVATE KEY-----",
  "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCKtYDI9Cz2QRxR",
  "vVx4hihzK2gpApRmDcQiosAkEgBiQ3EIImYhxeZU+Kc1CTwsXO+RmVjBgxK3CfPP",
  "Zf8f066Fc88W1KvYX3hsITYftd58CRqiKAL9O3Ws66zGCwonjUc+IRGoeDXdPkcc",
  "sU3to3w06io8f5znXzXi0A6+CFmFM5iGSDWlY9AzOv+jNv63Lj6ChF7sVa0lbpQu",
  "Z+dTw5p6gxp75lSpHMiQtaOmhYDf0TCosyUJMR9H588pse8Q/HvqFYAWfreWRcnR",
  "oL1bhJ1uSS+5nIUSddy25CqAOycc6FMbZjpvS6sd1Lc08X0zh++ChxQyTzoe915W",
  "gA5jIuFhAgMBAAECggEAD/enYNqs71cc87Lk+XHWJ7XcOnZTz3Cvvp32GODinu0t",
  "DpbpI2Ok6WyrUOFkhiXXpS7eJv6X8a6pXJtc9FS5nx6u/O2T76dD1Uy4bouQ1j31",
  "DSwmdfC5keOaYrzkGRv8EsSbRAW8i6Cu7nhhpGTAuFWpcYfuL7tH2HmDbPBIn9re",
  "gXijFij06ZaNRP9Gmm0aV2gId5Id6uxC/csdKzmCAEb46MPaesYjVZ6LlIGBUG8i",
  "CBe3mwbslrEyJrUS9RoYtmUQAOc5q0LspPuIL/y2tUqiPY9j3JI0NZ4pfJq/t0Zb",
  "6eQKEnAnK8OgGv1zTZ+MoONcrM9NLjFuP1kYm9Sj7QKBgQDCBgtTUlmdkx07PcmE",
  "SrZuj17Z7wcfp6wadVADxBB7Wv5GBCJnxTRlrFJr/qUYskeuJv777EqOTM908wc0",
  "nw0csCIFYyyIHURJ3d5cBi2TnohaifCuAP/mAPtfVOx4E3gfzYib+QTsHf4VkVPP",
  "4ajFjO76+oTc6X0fwZCisSPN5QKBgQC3BDLsOQdT9Gp1+8rTKRQMXg6gnbKJfFzB",
  "XvaeZxE4DeZl+ThD6E58xj34EmPI/+hJQyXn/KeZd/nx9REH9ZXUKQSCOe85urst",
  "NZvpRv1YsFyraG/bg8d+2Q0sxM3p4nR+uqGm5SmEedxAc2L2d/mj4hmRdm6MxDAg",
  "x27bptLtzQKBgH6i4Ut96V3uwlqDRn8hIJdi3l7SI00m7C7MuO/sTXGl/2aFlksy",
  "rLNb2OQB7ZID8sMZUr3tCPB98736TY6r7Sv3Tg1EILGqoIKx3EsmASNjis3FUKDR",
  "qDRgGbGsRTdORc5EIVDkJLFUFh3Pn+uD9tsR1H1de9CQWQmcFiIKCjt9AoGAJGPS",
  "WEPyoA/eRz1ck+X8FYVyNR+GC25N5ykhsldeBh5FbItEU8RSLt8gHT5S1vmDT2Xp",
  "mJoVHR/M8/49d66uLvRE8DvixEDLzO525Mh3wXW3x2FJtIUcWq1/wCIVq2aasUQc",
  "tlmkirHMSIho6gbq/VoMqW66BoVP6ISfF0+xaxUCgYEAnJ7Q+zMO2ZxoTnhrJAJb",
  "6GEFJtqXc1CO2OtpSoJS+jNLi5LPARbRwNOmgbJG5WsOvWPe0F8Zj1kv/VV/zdWW",
  "L0XZ8eKYdfovQPpciHjArSC283qlvYGESLXinu/z314GweAX1ss8906uPFR0ZwDE",
  "+36r5R01lqAKjXxgv63EkbQ=",
  "-----END PRIVATE KEY-----",
].join(" ");

const { sendTransactionalEmailMock } = vi.hoisted(() => ({
  sendTransactionalEmailMock: vi.fn(async () => ({ messageId: "test-message" })),
}));

vi.mock("../lib/providers/email", () => ({
  sendTransactionalEmail: sendTransactionalEmailMock,
}));

const convexModules = modules;
type ConvexHarness = TestConvex<typeof schema>;

describe("password auth email normalization", () => {
  beforeEach(() => {
    vi.stubEnv("CONVEX_SITE_URL", "http://localhost:3210");
    vi.stubEnv("JWT_PRIVATE_KEY", TEST_JWT_PRIVATE_KEY);
    vi.stubEnv("SITE_URL", "http://localhost:5173");
    sendTransactionalEmailMock.mockClear();
  });

  it("signs in with an uppercase email when the password account is lowercase", async () => {
    const t = convexTest(schema, convexModules);
    const password = "CurrentPass123!";
    const userId = await seedPasswordAccount(t, {
      email: "hello@lobbystack.com",
      password,
    });

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          flow: "signIn",
          email: "HELLO@lobbystack.com",
          password,
        },
      }),
    ).resolves.toMatchObject({ tokens: expect.any(Object) });

    await t.run(async (ctx) => {
      const sessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect();

      expect(sessions).toHaveLength(1);
    });
  });

  it("signs in to an exact mixed-case legacy account before normalized fallback", async () => {
    const t = convexTest(schema, convexModules);
    const legacyPassword = "LegacyPass123!";
    const lowercasePassword = "LowercasePass123!";
    const legacyUserId = await seedPasswordAccount(t, {
      email: "Hello@lobbystack.com",
      password: legacyPassword,
    });
    const lowercaseUserId = await seedPasswordAccount(t, {
      email: "hello@lobbystack.com",
      password: lowercasePassword,
    });

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          flow: "signIn",
          email: "Hello@lobbystack.com",
          password: legacyPassword,
        },
      }),
    ).resolves.toMatchObject({ tokens: expect.any(Object) });

    await t.run(async (ctx) => {
      const legacySessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", legacyUserId))
        .collect();
      const lowercaseSessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", lowercaseUserId))
        .collect();

      expect(legacySessions).toHaveLength(1);
      expect(lowercaseSessions).toHaveLength(0);
    });
  });

  it("signs in to the lowercase account when both mixed-case and lowercase accounts exist", async () => {
    const t = convexTest(schema, convexModules);
    const legacyPassword = "LegacyPass123!";
    const lowercasePassword = "LowercasePass123!";
    const legacyUserId = await seedPasswordAccount(t, {
      email: "Hello@lobbystack.com",
      password: legacyPassword,
    });
    const lowercaseUserId = await seedPasswordAccount(t, {
      email: "hello@lobbystack.com",
      password: lowercasePassword,
    });

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          flow: "signIn",
          email: "hello@lobbystack.com",
          password: lowercasePassword,
        },
      }),
    ).resolves.toMatchObject({ tokens: expect.any(Object) });

    await t.run(async (ctx) => {
      const legacySessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", legacyUserId))
        .collect();
      const lowercaseSessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", lowercaseUserId))
        .collect();

      expect(legacySessions).toHaveLength(0);
      expect(lowercaseSessions).toHaveLength(1);
    });
  });

  it("stores signup email and password account id in lowercase", async () => {
    const t = convexTest(schema, convexModules);

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          flow: "signUp",
          email: "HELLO@lobbystack.com",
          password: "CurrentPass123!",
        },
      }),
    ).resolves.toMatchObject({ tokens: expect.any(Object) });

    await t.run(async (ctx) => {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", "hello@lobbystack.com"),
        )
        .unique();

      expect(account).not.toBeNull();
      expect(account?.providerAccountId).toBe("hello@lobbystack.com");
      expect((await ctx.db.get(account!.userId))?.email).toBe("hello@lobbystack.com");
    });
  });

  it("does not create a duplicate account for an uppercase signup variant", async () => {
    const t = convexTest(schema, convexModules);
    await seedPasswordAccount(t, {
      email: "hello@lobbystack.com",
      password: "CurrentPass123!",
    });

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          flow: "signUp",
          email: "HELLO@lobbystack.com",
          password: "CurrentPass123!",
        },
      }),
    ).rejects.toThrow("Account already exists");

    await t.run(async (ctx) => {
      const accounts = await ctx.db.query("authAccounts").collect();

      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.providerAccountId).toBe("hello@lobbystack.com");
    });
  });

  it("creates a reset code for an uppercase email variant", async () => {
    const t = convexTest(schema, convexModules);
    const userId = await seedPasswordAccount(t, {
      email: "hello@lobbystack.com",
      password: "CurrentPass123!",
    });

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          flow: "reset",
          email: "HELLO@lobbystack.com",
        },
      }),
    ).resolves.toEqual({ tokens: null });

    await t.run(async (ctx) => {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q.eq("userId", userId).eq("provider", "password"),
        )
        .unique();
      const resetCode = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account!._id))
        .unique();

      expect(resetCode).not.toBeNull();
      expect(resetCode?.provider).toBe("email");
      expect(resetCode?.emailVerified).toBe("hello@lobbystack.com");
    });
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        template: "password_reset",
        to: "hello@lobbystack.com",
      }),
    );
  });

  it("creates a reset code for an exact mixed-case legacy account before normalized fallback", async () => {
    const t = convexTest(schema, convexModules);
    const legacyUserId = await seedPasswordAccount(t, {
      email: "Hello@lobbystack.com",
      password: "LegacyPass123!",
    });
    const lowercaseUserId = await seedPasswordAccount(t, {
      email: "hello@lobbystack.com",
      password: "LowercasePass123!",
    });

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          flow: "reset",
          email: "Hello@lobbystack.com",
        },
      }),
    ).resolves.toEqual({ tokens: null });

    await t.run(async (ctx) => {
      const legacyAccount = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q.eq("userId", legacyUserId).eq("provider", "password"),
        )
        .unique();
      const lowercaseAccount = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q.eq("userId", lowercaseUserId).eq("provider", "password"),
        )
        .unique();
      const legacyResetCode = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", legacyAccount!._id))
        .unique();
      const lowercaseResetCode = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", lowercaseAccount!._id))
        .unique();

      expect(legacyResetCode).not.toBeNull();
      expect(legacyResetCode?.emailVerified).toBe("hello@lobbystack.com");
      expect(lowercaseResetCode).toBeNull();
    });
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        template: "password_reset",
        to: "hello@lobbystack.com",
      }),
    );
  });

  it("verifies a reset code with an uppercase email and updates the lowercase account", async () => {
    const t = convexTest(schema, convexModules);
    const currentPassword = "CurrentPass123!";
    const newPassword = "ChangedPass123!";
    const resetCode = "12345678";
    const userId = await seedPasswordAccount(t, {
      email: "hello@lobbystack.com",
      password: currentPassword,
    });

    await t.run(async (ctx) => {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q.eq("userId", userId).eq("provider", "password"),
        )
        .unique();

      await ctx.db.insert("authVerificationCodes", {
        accountId: account!._id,
        provider: "email",
        code: await hashCode(resetCode),
        expirationTime: Date.now() + 5 * 60 * 1000,
        emailVerified: "hello@lobbystack.com",
      });
    });

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          flow: "reset-verification",
          email: "HELLO@lobbystack.com",
          code: resetCode,
          newPassword,
        },
      }),
    ).resolves.toMatchObject({ tokens: expect.any(Object) });

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          flow: "signIn",
          email: "HELLO@lobbystack.com",
          password: newPassword,
        },
      }),
    ).resolves.toMatchObject({ tokens: expect.any(Object) });
  });
});

async function seedPasswordAccount(
  t: ConvexHarness,
  input: {
    email: string;
    password: string;
  },
): Promise<Id<"users">> {
  const secret = await new Scrypt().hash(input.password);

  return await t.run(async (ctx) => {
    const userId: Id<"users"> = await ctx.db.insert("users", {
      email: input.email,
    });

    await ctx.db.insert("authAccounts", {
      userId,
      provider: "password",
      providerAccountId: input.email,
      secret,
    });

    return userId;
  });
}

async function hashCode(code: string): Promise<string> {
  const encoded = new TextEncoder().encode(code);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
