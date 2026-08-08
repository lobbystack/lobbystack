import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { drizzle } from "drizzle-orm/node-postgres";

import { pools, schema } from "@lobbystack/db";

import { verifyLegacyPassword } from "./password";

let authInstance: ReturnType<typeof createAuth> | undefined;

function createAuth() {
  const authDb = drizzle(pools.auth(), { schema });

  return betterAuth({
    database: drizzleAdapter(authDb, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verificationTokens,
      },
    }),
    emailAndPassword: {
      enabled: true,
      password: {
        async verify({ hash, password }) {
          if (hash.includes(":")) {
            return verifyLegacyPassword(password, hash);
          }
          return false;
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    secret: process.env.BETTER_AUTH_SECRET ?? "build-time-placeholder-secret",
    baseURL: process.env.APP_BASE_URL ?? "http://localhost:3000",
    trustedOrigins: [process.env.APP_BASE_URL ?? "http://localhost:3000"],
    plugins: [nextCookies()],
  });
}

export function getAuth() {
  authInstance ??= createAuth();
  return authInstance;
}

/** @deprecated Use getAuth() for lazy initialization during Next.js builds. */
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_target, property, receiver) {
    return Reflect.get(getAuth(), property, receiver);
  },
});

export type Session = ReturnType<typeof getAuth>["$Infer"]["Session"];
