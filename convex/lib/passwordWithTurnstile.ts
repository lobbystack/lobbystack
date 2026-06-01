import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import type { PasswordConfig } from "@convex-dev/auth/providers/Password";
import type { GenericActionCtxWithAuthConfig } from "@convex-dev/auth/server";
import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
  signInViaProvider,
} from "@convex-dev/auth/server";
import type { DocumentByName, GenericDataModel, WithoutSystemFields } from "convex/server";
import type { Value } from "convex/values";
import { Scrypt } from "lucia";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { normalizeAuthEmail } from "../../packages/shared/src/auth";
import { verifyTurnstileForSignUp } from "./turnstile";
import type { AuthEmailClaimAvailability } from "./authEmailClaims";

type PasswordProfile<DataModel extends GenericDataModel> =
  WithoutSystemFields<DocumentByName<DataModel, "users">> & {
    email: string;
  };

function getStringParam(
  params: Partial<Record<string, Value | undefined>>,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

function defaultProfile<DataModel extends GenericDataModel>(
  params: Partial<Record<string, Value | undefined>>,
): PasswordProfile<DataModel> {
  const email = normalizeOptionalAuthEmail(getStringParam(params, "email"));
  if (!email) {
    throw new Error("Missing `email` param");
  }

  return { email } as PasswordProfile<DataModel>;
}

function validateDefaultPasswordRequirements(password: string | undefined) {
  if (!password || password.length < 8) {
    throw new Error("Invalid password");
  }
}

function isMissingAccountError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return message.includes("InvalidAccountId");
}

function normalizeOptionalAuthEmail(value: string | undefined): string | undefined {
  return value === undefined ? undefined : normalizeAuthEmail(value);
}

async function retrievePasswordAccount<DataModel extends GenericDataModel>(
  ctx: GenericActionCtxWithAuthConfig<DataModel>,
  input: {
    provider: string;
    email: string;
    originalEmail?: string | undefined;
    secret?: string | undefined;
  },
): Promise<(Awaited<ReturnType<typeof retrieveAccount<DataModel>>> & { email: string }) | null> {
  const candidates =
    input.originalEmail && input.originalEmail !== input.email
      ? [input.originalEmail, input.email]
      : [input.email];
  let lastMissingAccountError: unknown = null;

  for (const candidate of candidates) {
    try {
      const retrieved = await retrieveAccount(ctx, {
        provider: input.provider,
        account: {
          id: candidate,
          ...(input.secret !== undefined ? { secret: input.secret } : {}),
        },
      });
      return { ...retrieved, email: candidate };
    } catch (error) {
      if (!isMissingAccountError(error)) {
        throw error;
      }
      lastMissingAccountError = error;
    }
  }

  if (lastMissingAccountError) {
    throw lastMissingAccountError;
  }

  return null;
}

async function hasPasswordAccountForNormalizedEmail<DataModel extends GenericDataModel>(
  ctx: GenericActionCtxWithAuthConfig<DataModel>,
  input: {
    provider: string;
    normalizedEmail: string;
  },
): Promise<boolean> {
  const availability: AuthEmailClaimAvailability = await ctx.runQuery(
    internal.lib.authEmailClaims.getAvailability,
    {
      provider: input.provider,
      normalizedEmail: input.normalizedEmail,
    },
  );

  return availability.authAccountClaimed || availability.userEmailClaimed;
}

async function replacePasswordAccountEmailClaim<DataModel extends GenericDataModel>(
  ctx: GenericActionCtxWithAuthConfig<DataModel>,
  input: {
    provider: string;
    normalizedEmail: string;
    accountId: Id<"authAccounts">;
    userId: Id<"users">;
  },
): Promise<void> {
  await ctx.runMutation(internal.lib.authEmailClaims.replaceForAccount, input);
}

export function PasswordWithTurnstile<DataModel extends GenericDataModel>(
  config: PasswordConfig<DataModel> = {},
) {
  const provider = config.id ?? "password";

  return ConvexCredentials<DataModel>({
    id: provider,
    authorize: async (params, ctx) => {
      const flow = getStringParam(params, "flow");
      const passwordToValidate =
        flow === "signUp"
          ? getStringParam(params, "password")
          : flow === "reset-verification"
            ? getStringParam(params, "newPassword")
            : null;

      if (passwordToValidate !== null) {
        if (passwordToValidate === undefined) {
          validateDefaultPasswordRequirements(passwordToValidate);
        } else if (config.validatePasswordRequirements !== undefined) {
          config.validatePasswordRequirements(passwordToValidate);
        } else {
          validateDefaultPasswordRequirements(passwordToValidate);
        }
      }

      const rawProfile = config.profile?.(params, ctx) ?? defaultProfile<DataModel>(params);
      const email = normalizeAuthEmail(rawProfile.email);
      const profile = { ...rawProfile, email } as PasswordProfile<DataModel>;
      const originalEmail = getStringParam(params, "email")?.trim();
      const normalizedParams = { ...params, email };
      const secret = getStringParam(params, "password");
      let account;
      let user;

      if (flow === "signUp") {
        if (secret === undefined) {
          throw new Error("Missing `password` param for `signUp` flow");
        }

        await verifyTurnstileForSignUp(params);

        try {
          await retrievePasswordAccount(ctx, {
            provider,
            email,
            originalEmail,
          });
          throw new Error("Account already exists");
        } catch (error) {
          if (!isMissingAccountError(error)) {
            throw error;
          }
        }

        if (
          await hasPasswordAccountForNormalizedEmail(ctx, {
            provider,
            normalizedEmail: email,
          })
        ) {
          throw new Error("Account already exists");
        }

        const created = await createAccount(ctx, {
          provider,
          account: { id: email, secret },
          profile,
          shouldLinkViaEmail: config.verify !== undefined,
          shouldLinkViaPhone: false,
        });
        await replacePasswordAccountEmailClaim(ctx, {
          provider,
          normalizedEmail: email,
          accountId: created.account._id as Id<"authAccounts">,
          userId: created.user._id as Id<"users">,
        });
        ({ account, user } = created);
      } else if (flow === "signIn") {
        if (secret === undefined) {
          throw new Error("Missing `password` param for `signIn` flow");
        }

        let retrieved;
        try {
          retrieved = await retrievePasswordAccount(ctx, {
            provider,
            email,
            originalEmail,
            secret,
          });
        } catch (error) {
          if (isMissingAccountError(error)) {
            throw new Error("Invalid credentials");
          }
          throw error;
        }
        if (retrieved === null) {
          throw new Error("Invalid credentials");
        }
        ({ account, user } = retrieved);
      } else if (flow === "reset") {
        if (!config.reset) {
          throw new Error(`Password reset is not enabled for ${provider}`);
        }

        let retrieved;
        try {
          retrieved = await retrievePasswordAccount(ctx, {
            provider,
            email,
            originalEmail,
          });
        } catch (error) {
          if (isMissingAccountError(error)) {
            return null;
          }
          throw error;
        }
        if (retrieved === null) {
          return null;
        }

        return await signInViaProvider(ctx, config.reset, {
          accountId: retrieved.account._id,
          params: normalizedParams,
        });
      } else if (flow === "reset-verification") {
        if (!config.reset) {
          throw new Error(`Password reset is not enabled for ${provider}`);
        }

        const newPassword = getStringParam(params, "newPassword");
        if (newPassword === undefined) {
          throw new Error("Missing `newPassword` param for `reset-verification` flow");
        }

        let retrieved;
        try {
          retrieved = await retrievePasswordAccount(ctx, {
            provider,
            email,
            originalEmail,
          });
        } catch (error) {
          if (isMissingAccountError(error)) {
            throw new Error("Invalid code");
          }
          throw error;
        }
        if (retrieved === null) {
          throw new Error("Invalid code");
        }

        const result = await signInViaProvider(ctx, config.reset, {
          params: { ...normalizedParams, email: retrieved.email },
        });
        if (result === null) {
          throw new Error("Invalid code");
        }

        const { userId, sessionId } = result;
        if (retrieved.account.userId !== userId) {
          throw new Error("Invalid code");
        }

        await modifyAccountCredentials(ctx, {
          provider,
          account: { id: retrieved.email, secret: newPassword },
        });
        await invalidateSessions(ctx, { userId, except: [sessionId] });
        return { userId, sessionId };
      } else if (flow === "email-verification") {
        if (!config.verify) {
          throw new Error(`Email verification is not enabled for ${provider}`);
        }

        let retrieved;
        try {
          retrieved = await retrievePasswordAccount(ctx, {
            provider,
            email,
            originalEmail,
          });
        } catch (error) {
          if (isMissingAccountError(error)) {
            return null;
          }
          throw error;
        }
        if (retrieved === null) {
          return null;
        }

        return await signInViaProvider(ctx, config.verify, {
          accountId: retrieved.account._id,
          params: normalizedParams,
        });
      } else {
        throw new Error(
          "Missing `flow` param, it must be one of " +
            '"signUp", "signIn", "reset", "reset-verification" or ' +
            '"email-verification"!',
        );
      }

      if (config.verify && !account.emailVerified) {
        return await signInViaProvider(ctx, config.verify, {
          accountId: account._id,
          params: normalizedParams,
        });
      }

      return { userId: user._id };
    },
    crypto: config.crypto ?? {
      async hashSecret(password) {
        return await new Scrypt().hash(password);
      },
      async verifySecret(password, hash) {
        return await new Scrypt().verify(hash, password);
      },
    },
    extraProviders: [config.reset, config.verify],
  });
}
