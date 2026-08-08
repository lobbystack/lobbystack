import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { drizzle } from "drizzle-orm/node-postgres";

import { pools, schema } from "@lobbystack/db";

import { verifyLegacyPassword } from "./password";

const authDb = drizzle(pools.auth(), { schema });

export const auth = betterAuth({
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
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.APP_BASE_URL ?? "http://localhost:3000",
  trustedOrigins: [
    process.env.APP_BASE_URL ?? "http://localhost:3000",
  ],
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
