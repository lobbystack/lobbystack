import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import { conversationSessions, operatorNotificationDeliveries } from "@lobbystack/db";
import { finishLiveCall, markLiveCallMediaStarted, saveLiveCallTurn, startLivePhoneCall } from "@lobbystack/domain";

import settings from "../../public/locales/en/settings.json" with { type: "json" };

import { holdNumber, migrator, randomE164, removeFixtures, setPlan, signUpOwner, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// The call summary email, from a call that ends to the owner's inbox, against
// a real worker: it writes the summary, queues the alert and sends it through
// Mailpit. The call itself has no browser surface, so the test records it the
// way the live call handler does, as the worker's database login.

const prefix = "call-summary";
const mailpit = process.env.MAILPIT_API_URL;
const callAnswered = settings.notifications.events.callCompleted.title;
let thirdParties: ThirdParties;
let database: Migrator;

test.beforeAll(async () => { thirdParties = await startThirdParties(); database = migrator(); });
test.afterAll(async () => { await thirdParties.close(); await database.pool.end(); });

type MailpitMessage = { ID: string; Subject: string };

async function emailsTo(address: string): Promise<MailpitMessage[]> {
  const response = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await response.json()) as { messages: MailpitMessage[] }).messages;
}

async function emailHtml(id: string): Promise<string> {
  const response = await fetch(`${mailpit}/api/v1/message/${id}`);
  return ((await response.json()) as { HTML: string }).HTML;
}

/** A customer's phone call to the business that connects, where they speak, and that ends. */
async function customerCall(businessId: string, to: string): Promise<string> {
  return await database.db.transaction(async (tx) => {
    await tx.execute(sql`set local session authorization lobbystack_worker`);
    const context = { db: tx as unknown as Migrator["db"] };
    const call = await startLivePhoneCall(context, { businessId, sessionId: `rtc_${randomUUID()}`, from: randomE164(), to });
    await markLiveCallMediaStarted(context, { businessId, callId: call.callId });
    await saveLiveCallTurn(context, { businessId, callId: call.callId, sequence: 1, speaker: "caller", text: "Hi, can I get a quote for 500 business cards by Thursday?" });
    await saveLiveCallTurn(context, { businessId, callId: call.callId, sequence: 2, speaker: "assistant", text: "Sure, I can help with that." });
    await finishLiveCall(context, { businessId, callId: call.callId, seconds: 74, end: "caller_finished" });
    return call.callId;
  });
}

/** Waits for the worker to finish the call's summary step, which queues the alert when it sends one. */
async function summarized(businessId: string, callId: string): Promise<void> {
  await expect.poll(async () => (await database.db.select({ id: conversationSessions.id }).from(conversationSessions).where(and(eq(conversationSessions.businessId, businessId), eq(conversationSessions.callId, callId), isNotNull(conversationSessions.summaryGeneratedAt)))).length, { timeout: 45_000 }).toBe(1);
}

test("an owner gets an email for each call the agent answers, opens the call from it, and turns it off", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  expect(mailpit, "scripts/e2e-local.sh sets MAILPIT_API_URL").toBeTruthy();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "starter");
    const number = await holdNumber(database, owner.businessId, { carrier: "twilio" });

    // On by default.
    await page.goto("/settings/notifications");
    const emailAlert = page.getByRole("checkbox", { name: `${settings.notifications.sources.email.title} - ${callAnswered}`, exact: true });
    await expect(emailAlert).toBeChecked();

    const callId = await customerCall(owner.businessId, number.e164);
    await expect.poll(async () => (await emailsTo(owner.email)).map((email) => email.Subject), { timeout: 60_000 }).toContainEqual(expect.stringMatching(/^New call from /));
    const [email] = await emailsTo(owner.email);
    const html = await emailHtml(email!.ID);
    expect(html).toContain(`New call for ${owner.businessName}`);
    expect(html).toContain("1 min 14 sec");
    const link = /href="([^"]+\/calls\/[^"]+)"/.exec(html)?.[1];
    expect(link).toMatch(new RegExp(`/calls/${callId}$`));

    // The button opens the call.
    await page.goto(new URL(link!).pathname);
    await expect(page).toHaveURL(new RegExp(`/calls/${callId}$`));

    // Turned off, the next call sends nothing.
    await page.goto("/settings/notifications");
    const saved = page.waitForResponse((response) => response.url().includes("/api/notification-preferences") && response.request().method() === "PUT");
    await emailAlert.click();
    expect((await saved).ok()).toBe(true);
    await expect(emailAlert).not.toBeChecked();
    const quietCallId = await customerCall(owner.businessId, number.e164);
    await summarized(owner.businessId, quietCallId);
    const alerts = await database.db.select({ eventKey: operatorNotificationDeliveries.eventKey }).from(operatorNotificationDeliveries).where(and(eq(operatorNotificationDeliveries.businessId, owner.businessId), eq(operatorNotificationDeliveries.eventKind, "callCompleted")));
    expect(alerts).toEqual([{ eventKey: `callCompleted:${callId}` }]);
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
