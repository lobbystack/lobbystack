import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import type { PasswordConfig } from "@convex-dev/auth/providers/Password";
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

import { verifyTurnstileForSignUp } from "./turnstile";

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
  const email = getStringParam(params, "email")?.trim();
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

export function PasswordWithTurnstile<DataModel extends GenericDataModel>(
  config: PasswordConfig<DataModel> = {},
) {
  const provider = config.id ?? "password";

  return ConvexCredentials<DataModel>({
    id: "password",
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

      const profile = config.profile?.(params, ctx) ?? defaultProfile<DataModel>(params);
      const { email } = profile;
      const secret = getStringParam(params, "password");
      let account;
      let user;

      if (flow === "signUp") {
        if (secret === undefined) {
          throw new Error("Missing `password` param for `signUp` flow");
        }

        await verifyTurnstileForSignUp(params);

        try {
          await retrieveAccount(ctx, {
            provider,
            account: { id: email },
          });
          throw new Error("Account already exists");
        } catch (error) {
          if (!isMissingAccountError(error)) {
            throw error;
          }
        }

        const created = await createAccount(ctx, {
          provider,
          account: { id: email, secret },
          profile,
          shouldLinkViaEmail: config.verify !== undefined,
          shouldLinkViaPhone: false,
        });
        ({ account, user } = created);
      } else if (flow === "signIn") {
        if (secret === undefined) {
          throw new Error("Missing `password` param for `signIn` flow");
        }

        const retrieved = await retrieveAccount(ctx, {
          provider,
          account: { id: email, secret },
        });
        if (retrieved === null) {
          throw new Error("Invalid credentials");
        }
        ({ account, user } = retrieved);
      } else if (flow === "reset") {
        if (!config.reset) {
          throw new Error(`Password reset is not enabled for ${provider}`);
        }

        const retrieved = await retrieveAccount(ctx, {
          provider,
          account: { id: email },
        });
        if (retrieved === null) {
          return null;
        }

        return await signInViaProvider(ctx, config.reset, {
          accountId: retrieved.account._id,
          params,
        });
      } else if (flow === "reset-verification") {
        if (!config.reset) {
          throw new Error(`Password reset is not enabled for ${provider}`);
        }

        const newPassword = getStringParam(params, "newPassword");
        if (newPassword === undefined) {
          throw new Error("Missing `newPassword` param for `reset-verification` flow");
        }

        const retrieved = await retrieveAccount(ctx, {
          provider,
          account: { id: email },
        });
        if (retrieved === null) {
          throw new Error("Invalid code");
        }

        const result = await signInViaProvider(ctx, config.reset, { params });
        if (result === null) {
          throw new Error("Invalid code");
        }

        const { userId, sessionId } = result;
        if (retrieved.account.userId !== userId) {
          throw new Error("Invalid code");
        }

        await modifyAccountCredentials(ctx, {
          provider,
          account: { id: email, secret: newPassword },
        });
        await invalidateSessions(ctx, { userId, except: [sessionId] });
        return { userId, sessionId };
      } else if (flow === "email-verification") {
        if (!config.verify) {
          throw new Error(`Email verification is not enabled for ${provider}`);
        }

        const retrieved = await retrieveAccount(ctx, {
          provider,
          account: { id: email },
        });
        if (retrieved === null) {
          return null;
        }

        return await signInViaProvider(ctx, config.verify, {
          accountId: retrieved.account._id,
          params,
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
          params,
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
