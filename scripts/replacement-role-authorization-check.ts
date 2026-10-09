import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { businesses, businessMemberships, contacts, conversations, createDatabaseClient, users, withBusinessTransaction } from "@lobbystack/db";
import { appendMessage, completeVoiceFollowUpTasks, listContacts, setAutomationState, setContactSmsManualBlock } from "@lobbystack/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const auth = createDatabaseClient("lobbystack_auth");
  const app = createDatabaseClient("lobbystack_app");
  const worker = createDatabaseClient("lobbystack_worker");
  const businessId = randomUUID();
  const ownerId = randomUUID();
  const schedulerId = randomUUID();
  const viewerId = randomUUID();
  let contactId = "";
  let conversationId = "";

  try {
    await auth.db.insert(users).values([
      { id: ownerId, email: `${ownerId}@roles.invalid`, normalizedEmail: `${ownerId}@roles.invalid` },
      { id: schedulerId, email: `${schedulerId}@roles.invalid`, normalizedEmail: `${schedulerId}@roles.invalid` },
      { id: viewerId, email: `${viewerId}@roles.invalid`, normalizedEmail: `${viewerId}@roles.invalid` },
    ]);
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
      await tx.insert(businesses).values({ id: businessId, slug: `roles-${businessId}`, name: "Role certification", timezone: "UTC", businessType: "service_company" });
      await tx.insert(businessMemberships).values([
        { businessId, userId: ownerId, role: "business_owner", status: "active" },
        { businessId, userId: schedulerId, role: "scheduler", status: "active" },
        { businessId, userId: viewerId, role: "viewer", status: "active" },
      ]);
      contactId = (await tx.insert(contacts).values({ businessId, phone: "+14165550100", name: "Role test contact" }).returning({ id: contacts.id }))[0]?.id ?? "";
      conversationId = (await tx.insert(conversations).values({ businessId, contactId, channel: "sms", status: "open", automationState: "ai_active" }).returning({ id: conversations.id }))[0]?.id ?? "";
    });
    assert(contactId && conversationId, "Role certification contact was not created.");

    const viewerList = await listContacts({ db: app.db }, { userId: viewerId, businessId });
    assert(viewerList.contacts.length === 1, "Viewers could not read contacts.");
    assert(await setContactSmsManualBlock({ db: app.db }, { userId: ownerId, businessId, contactId, blocked: true }), "Owners could not mutate contacts.");

    for (const userId of [schedulerId, viewerId]) {
      let denied = false;
      try { await setContactSmsManualBlock({ db: app.db }, { userId, businessId, contactId, blocked: false }); } catch { denied = true; }
      assert(denied, `Role ${userId === schedulerId ? "scheduler" : "viewer"} could mutate an admin-only contact action.`);
    }

    // Viewers are read-only: no operator replies, AI pause or follow-up completion. Schedulers can.
    const operatorActions = (userId: string) => [
      () => appendMessage({ db: app.db }, { userId, businessId, conversationId, body: "Role test reply", direction: "outbound", channel: "dashboard" }),
      () => setAutomationState({ db: app.db }, { userId, businessId, conversationId, state: "human_handoff" }),
      () => completeVoiceFollowUpTasks({ db: app.db }, { userId, businessId, callId: randomUUID() }),
    ];
    for (const action of operatorActions(schedulerId)) await action();
    for (const action of operatorActions(viewerId)) {
      let denied = false;
      try { await action(); } catch (error) { denied = (error as { status?: number }).status === 403; }
      assert(denied, "A viewer could reply, pause the AI or complete a follow-up.");
    }

    console.log(JSON.stringify({ viewerRead: true, ownerMutation: true, schedulerMutationDenied: true, viewerMutationDenied: true, schedulerOperatorActions: true, viewerOperatorActionsDenied: true }));
  } finally {
    await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => tx.delete(businesses).where(eq(businesses.id, businessId))).catch(() => undefined);
    await auth.db.delete(users).where(eq(users.id, ownerId)).catch(() => undefined);
    await auth.db.delete(users).where(eq(users.id, schedulerId)).catch(() => undefined);
    await auth.db.delete(users).where(eq(users.id, viewerId)).catch(() => undefined);
    await Promise.all([auth.pool.end(), app.pool.end(), worker.pool.end()]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
