import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { businessMemberships, businesses, createDatabaseClient, feedbackSubmissions, outboxMessages, users } from "@lobbystack/db";
import { markFeedbackEmailFailed, markFeedbackEmailSent, submitFeedback } from "@lobbystack/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const migrator = createDatabaseClient("lobbystack_migrator");
  const app = createDatabaseClient("lobbystack_app");
  const worker = createDatabaseClient("lobbystack_worker");
  const userId = randomUUID();
  const businessId = randomUUID();
  const foreignBusinessId = randomUUID();
  const previousRecipient = process.env.FEEDBACK_TO_EMAIL;
  try {
    await migrator.db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid`, name: "Feedback certifier" });
    await migrator.db.insert(businesses).values([{ id: businessId, slug: `feedback-${businessId}`, name: "Feedback certification", timezone: "UTC", businessType: "test" }, { id: foreignBusinessId, slug: `feedback-${foreignBusinessId}`, name: "Foreign feedback certification", timezone: "UTC", businessType: "test" }]);
    await migrator.db.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });

    process.env.FEEDBACK_TO_EMAIL = "feedback@example.invalid";
    const submissionId = await submitFeedback({ db: app.db }, { userId, businessId, message: "Certification feedback", pagePath: "/settings", userAgent: "certifier" });
    const persisted = (await migrator.db.select().from(feedbackSubmissions).where(eq(feedbackSubmissions.id, submissionId)).limit(1))[0];
    const delivery = (await migrator.db.select().from(outboxMessages).where(and(eq(outboxMessages.aggregateType, "feedback_submission"), eq(outboxMessages.aggregateId, submissionId))).limit(1))[0];
    assert(persisted?.emailStatus === "pending_email" && persisted.businessName === "Feedback certification", "Feedback snapshots or pending delivery state were not persisted.");
    assert(delivery?.dedupeKey === `feedback:${submissionId}:email` && delivery.payload.feedbackSubmissionId === submissionId, "Feedback email was not queued idempotently.");

    await markFeedbackEmailFailed({ db: worker.db }, { businessId, feedbackSubmissionId: submissionId, error: "provider unavailable" });
    await markFeedbackEmailSent({ db: worker.db }, { businessId, feedbackSubmissionId: submissionId, providerMessageId: "email-certification" });
    await markFeedbackEmailSent({ db: worker.db }, { businessId, feedbackSubmissionId: submissionId, providerMessageId: "email-certification" });
    const delivered = (await migrator.db.select().from(feedbackSubmissions).where(eq(feedbackSubmissions.id, submissionId)).limit(1))[0];
    assert(delivered?.emailStatus === "email_sent" && delivered.providerMessageId === "email-certification", "Feedback retry did not converge on delivered state.");

    let crossTenantDenied = false;
    try { await submitFeedback({ db: app.db }, { userId, businessId: foreignBusinessId, message: "Must fail" }); } catch { crossTenantDenied = true; }
    assert(crossTenantDenied, "Cross-tenant feedback submission was accepted.");
    let oversizedDenied = false;
    try { await submitFeedback({ db: app.db }, { userId, businessId, message: "x".repeat(2_001) }); } catch { oversizedDenied = true; }
    assert(oversizedDenied, "Oversized feedback was accepted.");

    delete process.env.FEEDBACK_TO_EMAIL;
    const undeliverableId = await submitFeedback({ db: app.db }, { userId, businessId, message: "Recipient missing" });
    const undeliverable = (await migrator.db.select().from(feedbackSubmissions).where(eq(feedbackSubmissions.id, undeliverableId)).limit(1))[0];
    assert(undeliverable?.emailStatus === "email_failed" && undeliverable.emailError?.includes("FEEDBACK_TO_EMAIL"), "Missing feedback recipient was not persisted safely.");
    console.log(JSON.stringify({ authenticatedDomainFlow: true, crossTenantDenied, limitsEnforced: oversizedDenied, durableOutbox: true, retriesIdempotent: true, missingRecipientRecorded: true }));
  } finally {
    if (previousRecipient === undefined) delete process.env.FEEDBACK_TO_EMAIL; else process.env.FEEDBACK_TO_EMAIL = previousRecipient;
    await migrator.db.delete(businesses).where(eq(businesses.id, businessId)).catch(() => undefined);
    await migrator.db.delete(businesses).where(eq(businesses.id, foreignBusinessId)).catch(() => undefined);
    await migrator.db.delete(users).where(eq(users.id, userId)).catch(() => undefined);
    await Promise.all([migrator.pool.end(), app.pool.end(), worker.pool.end()]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
