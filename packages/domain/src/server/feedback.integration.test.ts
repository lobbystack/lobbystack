import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createDatabaseClient, outboxMessages, users, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { submitFeedback } from "./feedback";
import { createBusiness } from "./tenancy";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Feedback integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });
afterEach(() => {
  vi.unstubAllEnvs();
});

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

describe.skipIf(!testUrl)("dashboard feedback email", () => {
  it("goes to the host's inbox under the host brand, still named LobbyStack on a renamed deployment", async () => {
    vi.stubEnv("FEEDBACK_TO_EMAIL", "feedback@desk.example.test");
    vi.stubEnv("DEPLOYMENT_MODE", "self_hosted_standard");
    vi.stubEnv("BRAND_APP_NAME", "");
    await rollbackTest(async (tx) => {
      await tx.execute(sql`delete from public.deployment_branding`);
      await tx.execute(sql`insert into public.deployment_branding (id, app_name) values (1, 'Acme Desk')`);
      const userId = randomUUID();
      await tx.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Sam Owner" });
      await tx.execute(sql`set local role lobbystack_app`);
      const context = { db: tx as unknown as Database };
      const { businessId } = await createBusiness(context, { userId, name: "Acme Dental", timezone: "UTC", businessType: "dental" });
      const submissionId = await submitFeedback(context, { userId, businessId, message: "The calendar page is slow." });
      await tx.execute(sql`reset role`);
      const [email] = await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.topic, "email.send"), eq(outboxMessages.aggregateId, submissionId)));
      expect(email?.payload).toEqual({
        template: "feedback_submission",
        feedbackSubmissionId: submissionId,
        to: "feedback@desk.example.test",
        subject: "LobbyStack feedback from Acme Dental",
        variables: { body: "The calendar page is slow." },
        brand: { kind: "host" },
        replyTo: null,
      });
    });
  });
});
