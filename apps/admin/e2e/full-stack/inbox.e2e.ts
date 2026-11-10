import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { agents, calls, contacts, conversations, phoneNumbers } from "@lobbystack/db";

import inboxCopy from "../../public/locales/en/inbox.json" with { type: "json" };

import { holdNumber, migrator, randomE164, removeFixtures, setPlan, signUpOwner, twilioPhoneSid, twilioSignature, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// The Inbox with two agents: a text comes in through the signed Twilio
// webhook to the number the evening agent answers, and the front desk took a
// call. The owner narrows the list by agent and by channel, and an open item
// names the agent that handled it.

const prefix = "inbox";
let thirdParties: ThirdParties;
let database: Migrator;

test.beforeAll(async () => { thirdParties = await startThirdParties(); database = migrator(); });
test.afterAll(async () => { await thirdParties.close(); await database.pool.end(); });

async function inboundText(request: APIRequestContext, baseURL: string, input: { from: string; to: string; body: string }): Promise<void> {
  const params = { MessageSid: `SM${randomBytes(16).toString("hex")}`, From: input.from, To: input.to, Body: input.body };
  const response = await request.post("/api/webhooks/twilio/sms", { headers: { "x-twilio-signature": twilioSignature(`${baseURL}/api/webhooks/twilio/sms`, params) }, form: params });
  expect(response.ok()).toBe(true);
}

test("the Inbox filters by agent and channel, and says which agent handled the open item", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "starter");

    // The default agent is the front desk; a second agent, Evening, starts as its copy and answers the number.
    const [frontDesk] = await database.db.update(agents).set({ name: "Front desk" }).where(and(eq(agents.businessId, owner.businessId), eq(agents.isDefault, true))).returning();
    const { id: _id, isDefault: _isDefault, createdAt: _createdAt, updatedAt: _updatedAt, ...settings } = frontDesk!;
    const [evening] = await database.db.insert(agents).values({ ...settings, name: "Evening", isDefault: false }).returning({ id: agents.id });
    const number = await holdNumber(database, owner.businessId, { carrier: "twilio", providerPhoneId: twilioPhoneSid() });
    await database.db.update(phoneNumbers).set({ agentId: evening!.id }).where(eq(phoneNumbers.id, number.id));

    // The front desk's call, as a finished call leaves it.
    const [caller] = await database.db.insert(contacts).values({ businessId: owner.businessId, name: "Alex Rivera", phone: randomE164() }).returning({ id: contacts.id });
    const [callThread] = await database.db.insert(conversations).values({ businessId: owner.businessId, contactId: caller!.id, channel: "voice", agentId: frontDesk!.id }).returning({ id: conversations.id });
    const [call] = await database.db.insert(calls).values({ businessId: owner.businessId, conversationId: callThread!.id, contactId: caller!.id, providerCallId: `CA${randomBytes(16).toString("hex")}`, transport: "voice", status: "completed", startedAt: new Date(Date.now() - 60_000), agentId: frontDesk!.id }).returning({ id: calls.id });

    // The text reaches Evening, because Evening answers the number it was sent to.
    const texter = randomE164();
    await inboundText(request, baseURL!, { from: texter, to: number.e164, body: "Are you open on Saturday?" });
    await expect.poll(async () => (await database.db.select({ agentId: conversations.agentId }).from(conversations).where(and(eq(conversations.businessId, owner.businessId), eq(conversations.channel, "sms"))))).toEqual([{ agentId: evening!.id }]);

    const list = page.locator("#dashboard-main-content");
    const callRow = list.getByRole("link").filter({ hasText: "Alex Rivera" });
    const textRow = list.getByRole("link").filter({ hasText: "Are you open on Saturday?" });

    // Both show, each with the agent that handled it.
    await page.goto("/inbox");
    await expect(callRow).toBeVisible();
    await expect(callRow).toContainText("Front desk");
    await expect(textRow).toBeVisible();
    await expect(textRow).toContainText("Evening");

    // The agent picker narrows the list, and the URL keeps the choice.
    await page.getByRole("combobox", { name: inboxCopy.filters.agent, exact: true }).click();
    await page.getByRole("option", { name: "Evening", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]agent=${evening!.id}`));
    await expect(textRow).toBeVisible();
    await expect(callRow).toHaveCount(0);

    // A channel on top of it leaves nothing, and All agents brings the call back.
    await page.getByRole("button", { name: inboxCopy.filters.channels.phone_call, exact: true }).click();
    await expect(page).toHaveURL(/[?&]channel=phone_call/);
    await expect(page.getByText(inboxCopy.noMatch, { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: inboxCopy.filters.agent, exact: true }).click();
    await page.getByRole("option", { name: inboxCopy.filters.allAgents, exact: true }).click();
    await expect(callRow).toBeVisible();
    await expect(textRow).toHaveCount(0);

    // The open call names its agent, and the name opens that agent's page.
    await callRow.click();
    await expect(page).toHaveURL(new RegExp(`[?&]call=${call!.id}`));
    const handledBy = list.getByText(new RegExp(`^${inboxCopy.handledBy.replace(/<agent>\{\{name\}\}<\/agent>/u, "Front desk")}$`));
    await expect(handledBy).toBeVisible();
    await handledBy.getByRole("link", { name: "Front desk", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/agents/${frontDesk!.id}$`));

    // The SMS filter shows the text, and opening it names Evening.
    await page.goto("/inbox");
    await page.getByRole("button", { name: inboxCopy.filters.channels.sms, exact: true }).click();
    await expect(callRow).toHaveCount(0);
    await textRow.click();
    await expect(list.getByText(inboxCopy.handledBy.replace(/<agent>\{\{name\}\}<\/agent>/u, "Evening"), { exact: true })).toBeVisible();
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
