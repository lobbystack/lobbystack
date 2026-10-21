import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businessMemberships, businesses, conversations, conversationSessions, createDatabaseClient, messages, operatorNotificationDeliveries, outboxMessages, productEvents, users, widgetVisitors, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { appendMessage, findCurrentWidgetConversationId, findWidgetConversationId, getOrCreateWidgetConversation, setAutomationState, WIDGET_CHAT_IDLE_CLOSE_MS } from "./conversations";
import { expireTeamRequest, loadWidgetChatView, requestTeamForWidgetChat, returnQuietTeamChat, TEAM_CHAT_QUIET_MS, TEAM_REQUEST_WAIT_MS } from "./widgetLiveChat";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Website chat integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

type Chat = Awaited<ReturnType<typeof seedChat>>;

/** Runs a test in one transaction and rolls it back, so other suites never see its rows. */
async function rollbackTest(run: (chat: Chat) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      await run(await seedChat(tx));
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

/** Runs one step under the login production uses for it: the worker for the widget, the app for Messages. */
async function as<T>(tx: DatabaseTransaction, login: "worker" | "app", run: (db: Database) => Promise<T>): Promise<T> {
  await tx.execute(login === "worker" ? sql`set local session authorization lobbystack_worker` : sql`set local session authorization lobbystack_app`);
  try {
    return await run(tx as unknown as Database);
  } finally {
    await tx.execute(sql`reset session authorization`);
  }
}

/** A business with a team member, and a visitor whose website chat the AI is answering. */
async function seedChat(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  const userId = randomUUID();
  const visitorId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Javor", timezone: "UTC", businessType: "test", telemetryEnabled: true, deploymentMode: "self_hosted_standard" });
  await tx.insert(users).values({ id: userId, name: "Yuri Maksymenko", email: `${userId}@example.invalid`, normalizedEmail: `${userId}@example.invalid` });
  await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner" });
  await tx.insert(widgetVisitors).values({ id: visitorId, businessId });
  const { conversationId } = await as(tx, "worker", (db) => getOrCreateWidgetConversation({ db }, { businessId, widgetVisitorId: visitorId }));
  const write = (login: "worker" | "app", message: Omit<Parameters<typeof appendMessage>[1], "businessId" | "conversationId" | "channel">) =>
    as(tx, login, (db) => appendMessage({ db }, { ...message, businessId, conversationId, channel: "web_chat" }));
  return {
    businessId,
    userId,
    conversationId,
    visitorWrites: (body: string) => write("worker", { body, direction: "inbound" }),
    aiReplies: (body: string) => write("worker", { body, direction: "outbound", aiGenerated: true }),
    teamReplies: (body: string) => write("app", { body, direction: "outbound", userId }),
    /** The visitor asks the receptionist for a person, as its requestTeamMember tool does. */
    asksForPerson: (now?: Date) => as(tx, "worker", (db) => requestTeamForWidgetChat({ db }, { businessId, conversationId, locale: "fr", reason: "Questions about\nan invoice", ...(now ? { now } : {}) })),
    /** The worker's job, once the wait is over. */
    expire: (requestedAt: Date) => as(tx, "worker", (db) => expireTeamRequest({ db }, { businessId, conversationId, requestedAt, locale: "fr" })),
    /** A team member presses Join (Take over) or Resume AI in Messages. */
    teamSets: (state: "ai_active" | "human_handoff") => as(tx, "app", (db) => setAutomationState({ db }, { userId, businessId, conversationId, state })),
    /** What the widget shows, as its history route reads it for a key with live chat on unless told otherwise. */
    view: (now?: Date, liveChatOn = true) => as(tx, "worker", (db) => loadWidgetChatView({ db }, { businessId, conversationId, liveChatOn, ...(now ? { now } : {}) })),
    /** The visitor writes again, as the widget's chat route checks first. */
    returnQuiet: (now: Date) => as(tx, "worker", (db) => returnQuietTeamChat({ db }, { businessId, conversationId, now })),
    /** The visitor sends a message, as the widget's chat route looks up or starts their chat. */
    openChat: (now: Date) => as(tx, "worker", (db) => getOrCreateWidgetConversation({ db }, { businessId, widgetVisitorId: visitorId, now })),
    /** The widget opens, as its history route looks up the chat to show. */
    shownChat: (widgetVisitorId: string, now?: Date) => as(tx, "worker", (db) => findCurrentWidgetConversationId({ db }, { businessId, widgetVisitorId, ...(now ? { now } : {}) })),
    /** Moves a message in time, as if it was written then. */
    async writtenAt(messageId: string, at: Date) {
      await tx.update(messages).set({ createdAt: at }).where(eq(messages.id, messageId));
    },
    async chats() {
      return await tx.select({ id: conversations.id, status: conversations.status, state: conversations.automationState }).from(conversations).where(eq(conversations.businessId, businessId));
    },
    async sessions(id: string) {
      return await tx.select({ status: conversationSessions.status, closedAt: conversationSessions.closedAt }).from(conversationSessions).where(eq(conversationSessions.conversationId, id));
    },
    async automation() {
      const [row] = await tx.select({ state: conversations.automationState, pausedBy: conversations.automationPausedByUserId, pausedAt: conversations.automationPausedAt, teamRequestedAt: conversations.teamRequestedAt, teamJoinedAt: conversations.teamJoinedAt }).from(conversations).where(eq(conversations.id, conversationId));
      return row!;
    },
    /** What the dashboard and the widget's live updates would hear. Rows from one transaction share a time, so in no set order. */
    async realtime() {
      const rows = await tx.select({ payload: outboxMessages.payload }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "realtime.publish")));
      return rows.map((row) => row.payload);
    },
    async expiryJobs() {
      return await tx.select({ payload: outboxMessages.payload, availableAt: outboxMessages.availableAt }).from(outboxMessages).where(and(eq(outboxMessages.businessId, businessId), eq(outboxMessages.topic, "conversation.expireTeamRequest")));
    },
    async alerts() {
      return await tx.select({ eventKind: operatorNotificationDeliveries.eventKind, channel: operatorNotificationDeliveries.channel, destination: operatorNotificationDeliveries.destination, subject: operatorNotificationDeliveries.subject, body: operatorNotificationDeliveries.body }).from(operatorNotificationDeliveries).where(eq(operatorNotificationDeliveries.businessId, businessId));
    },
    async events() {
      return (await tx.select({ name: productEvents.name }).from(productEvents).where(eq(productEvents.businessId, businessId))).map((row) => row.name).sort();
    },
    async messageRows() {
      return await tx.select({ body: messages.body, aiGenerated: messages.aiGenerated, sentByUserId: messages.sentByUserId }).from(messages).where(eq(messages.conversationId, conversationId));
    },
    visitorId,
    findChat: (widgetVisitorId: string) => as(tx, "worker", (db) => findWidgetConversationId({ db }, { businessId, widgetVisitorId })),
    async addVisitor() {
      const id = randomUUID();
      await tx.insert(widgetVisitors).values({ id, businessId });
      return id;
    },
    async chatCount() {
      return (await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.businessId, businessId))).length;
    },
  };
}

describe.skipIf(!testUrl)("website chat take-over against PostgreSQL under production logins", () => {
  it("lets a team member's reply take the chat from the AI and tells the widget who wrote what", async () => {
    await rollbackTest(async (chat) => {
      const asked = await chat.visitorWrites("Can I talk to someone?");
      const answered = await chat.aiReplies("Let me see who's around.");
      expect(await chat.automation()).toMatchObject({ state: "ai_active", pausedBy: null });

      const joined = await chat.teamReplies("Hi, this is Yuri. How can I help?");
      const takenOver = await chat.automation();
      // Nobody asked for the team, so this is no live chat that goes back to the receptionist.
      expect(takenOver).toMatchObject({ state: "human_handoff", pausedBy: chat.userId, teamRequestedAt: null, teamJoinedAt: null });
      expect(takenOver.pausedAt).toBeInstanceOf(Date);

      // A second reply keeps the take-over as it was and doesn't announce it again.
      await chat.teamReplies("Are you still there?");
      expect(await chat.automation()).toEqual(takenOver);

      const events = await chat.realtime();
      const messageEvents = events.filter((event) => event.type === "message.upserted");
      expect(messageEvents).toHaveLength(4);
      expect(messageEvents).toEqual(expect.arrayContaining([
        { type: "message.upserted", entityId: asked, conversationId: chat.conversationId, direction: "inbound", aiGenerated: false },
        { type: "message.upserted", entityId: answered, conversationId: chat.conversationId, direction: "outbound", aiGenerated: true },
        { type: "message.upserted", entityId: joined, conversationId: chat.conversationId, direction: "outbound", aiGenerated: false },
      ]));
      expect(events.filter((event) => event.type === "conversation.updated")).toEqual([{ type: "conversation.updated", entityId: chat.conversationId }]);
      expect(await chat.events()).toEqual(["conversation.automation_paused"]);
    });
  });

  it("finds a visitor's open chat for the widget's live updates without ever creating one", async () => {
    await rollbackTest(async (chat) => {
      expect(await chat.findChat(chat.visitorId)).toBe(chat.conversationId);
      const newcomer = await chat.addVisitor();
      expect(await chat.findChat(newcomer)).toBeNull();
      expect(await chat.chatCount()).toBe(1);
    });
  });
});

describe.skipIf(!testUrl)("live chat with the team against PostgreSQL under production logins", () => {
  it("hands the chat to the team when a visitor asks for a person, until a team member's reply joins it", async () => {
    await rollbackTest(async (chat) => {
      await chat.visitorWrites("Je voudrais parler à quelqu'un.");
      const requestedAt = new Date(Date.now() - 1_000);
      expect(await chat.asksForPerson(requestedAt)).toEqual({ ok: true, waitMinutes: 3 });
      expect(await chat.automation()).toMatchObject({ state: "human_handoff", pausedBy: null, teamRequestedAt: requestedAt, teamJoinedAt: null });

      // The team member gets an alert, and the worker gets a job for when the wait is over.
      expect(await chat.alerts()).toEqual([{ eventKind: "liveChatRequest", channel: "email", destination: `${chat.userId}@example.invalid`, subject: "A website visitor is asking for a person", body: expect.stringContaining("What they need: Questions about an invoice") }]);
      expect(await chat.expiryJobs()).toEqual([{ payload: { conversationId: chat.conversationId, requestedAt: requestedAt.toISOString(), locale: "fr" }, availableAt: new Date(requestedAt.getTime() + TEAM_REQUEST_WAIT_MS) }]);
      expect(await chat.view()).toMatchObject({ automationState: "human_handoff", waitingForTeam: true, teamMemberName: null });
      // Asking again while waiting changes nothing.
      expect(await chat.asksForPerson()).toEqual({ ok: false, reason: "team_has_chat" });
      expect(await chat.alerts()).toHaveLength(1);

      const reply = await chat.teamReplies("Bonjour, c'est Yuri.");
      const joined = await chat.automation();
      expect(joined).toMatchObject({ state: "human_handoff", pausedBy: chat.userId, teamRequestedAt: null, teamJoinedAt: joined.pausedAt });
      expect(joined.teamJoinedAt).toBeInstanceOf(Date);
      const view = await chat.view();
      expect(view).toMatchObject({ automationState: "human_handoff", waitingForTeam: false, teamMemberName: "Yuri" });
      // Rows from one transaction share a time, so in no set order.
      expect(view.messages).toHaveLength(2);
      expect(view.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ direction: "inbound", fromTeam: false, teamMemberName: null }),
        expect.objectContaining({ id: reply, direction: "outbound", fromTeam: true, teamMemberName: "Yuri" }),
      ]));

      // The job finds the request answered and leaves the chat with Yuri.
      expect(await chat.expire(requestedAt)).toEqual({ expired: false });
      expect(await chat.automation()).toMatchObject({ state: "human_handoff", pausedBy: chat.userId });
      expect(await chat.events()).toEqual(["conversation.team_joined", "conversation.team_requested"]);
    });
  });

  it("gives the chat back to the receptionist with an offer to take a message when nobody joins in time", async () => {
    await rollbackTest(async (chat) => {
      await chat.visitorWrites("Je voudrais parler à quelqu'un.");
      const requestedAt = new Date(Date.now() - TEAM_REQUEST_WAIT_MS);
      await chat.asksForPerson(requestedAt);
      // A job from an earlier request doesn't touch this one.
      expect(await chat.expire(new Date(requestedAt.getTime() - 60_000))).toEqual({ expired: false });
      expect(await chat.automation()).toMatchObject({ state: "human_handoff", teamRequestedAt: requestedAt });

      expect(await chat.expire(requestedAt)).toEqual({ expired: true });
      expect(await chat.automation()).toMatchObject({ state: "ai_active", pausedBy: null, pausedAt: null, teamRequestedAt: null, teamJoinedAt: null });
      const view = await chat.view();
      expect(view).toMatchObject({ automationState: "ai_active", waitingForTeam: false, teamMemberName: null });
      expect(view.messages.filter((message) => message.direction === "outbound")).toEqual([expect.objectContaining({ fromTeam: false, teamMemberName: null, body: expect.stringContaining("personne de l'équipe n'est disponible") })]);
      expect((await chat.messageRows()).filter((row) => row.aiGenerated)).toEqual([{ body: expect.stringContaining("laissez votre nom"), aiGenerated: true, sentByUserId: null }]);
      expect((await chat.realtime()).filter((event) => event.type === "conversation.updated")).toHaveLength(2);

      // The job runs once; a retry finds nothing left to do.
      expect(await chat.expire(requestedAt)).toEqual({ expired: false });
      expect(await chat.events()).toEqual(["conversation.team_request_expired", "conversation.team_requested"]);
    });
  });

  it("lets a team member join with the button, or hand the waiting visitor back to the receptionist", async () => {
    await rollbackTest(async (chat) => {
      const firstRequest = new Date(Date.now() - 2_000);
      await chat.asksForPerson(firstRequest);
      await chat.teamSets("human_handoff");
      expect(await chat.automation()).toMatchObject({ state: "human_handoff", pausedBy: chat.userId, teamRequestedAt: null, teamJoinedAt: expect.any(Date) });
      expect(await chat.view()).toMatchObject({ waitingForTeam: false, teamMemberName: "Yuri" });
      expect(await chat.expire(firstRequest)).toEqual({ expired: false });

      await chat.teamSets("ai_active");
      expect(await chat.automation()).toMatchObject({ state: "ai_active", teamJoinedAt: null });
      const secondRequest = new Date(Date.now() - 1_000);
      expect(await chat.asksForPerson(secondRequest)).toEqual({ ok: true, waitMinutes: 3 });
      await chat.teamSets("ai_active");
      expect(await chat.automation()).toMatchObject({ state: "ai_active", pausedBy: null, teamRequestedAt: null });
      expect(await chat.expire(secondRequest)).toEqual({ expired: false });
      expect((await chat.messageRows()).filter((row) => row.aiGenerated)).toEqual([]);
      expect(await chat.events()).toEqual(["conversation.team_joined", "conversation.team_requested", "conversation.team_requested"]);
    });
  });
});

describe.skipIf(!testUrl)("a website chat the team went quiet in, against PostgreSQL under production logins", () => {
  it("goes back to the receptionist when the visitor writes after the team joined them and left it quiet", async () => {
    await rollbackTest(async (chat) => {
      await chat.visitorWrites("Can I talk to someone?");
      await chat.asksForPerson();
      await chat.teamReplies("Hi, this is Yuri. How can I help?");
      const joined = Date.now();
      const stillThere = new Date(joined + TEAM_CHAT_QUIET_MS - 60_000);
      const quiet = new Date(joined + TEAM_CHAT_QUIET_MS + 60_000);

      expect(await chat.returnQuiet(stillThere)).toBe("human_handoff");
      expect(await chat.view(stillThere)).toMatchObject({ automationState: "human_handoff", waitingForTeam: false, teamMemberName: "Yuri" });

      // The widget shows the receptionist again, and reading the chat changes nothing.
      expect(await chat.view(quiet)).toMatchObject({ automationState: "ai_active", waitingForTeam: false, teamMemberName: null });
      expect(await chat.automation()).toMatchObject({ state: "human_handoff", pausedBy: chat.userId, teamJoinedAt: expect.any(Date) });

      expect(await chat.returnQuiet(quiet)).toBe("ai_active");
      expect(await chat.automation()).toMatchObject({ state: "ai_active", pausedBy: null, pausedAt: null, teamRequestedAt: null, teamJoinedAt: null });
      // Messages hears about the request, the join and the hand-back.
      expect((await chat.realtime()).filter((event) => event.type === "conversation.updated")).toHaveLength(3);
      expect(await chat.returnQuiet(quiet)).toBe("ai_active");
    });
  });

  it("counts from the team's last message, not from when they joined", async () => {
    await rollbackTest(async (chat) => {
      await chat.asksForPerson();
      await chat.teamSets("human_handoff");
      const joined = Date.now();
      const reply = await chat.teamReplies("Still checking, one moment.");
      await chat.writtenAt(reply, new Date(joined + 20 * 60_000));

      expect(await chat.returnQuiet(new Date(joined + 20 * 60_000 + TEAM_CHAT_QUIET_MS - 60_000))).toBe("human_handoff");
      expect(await chat.returnQuiet(new Date(joined + 20 * 60_000 + TEAM_CHAT_QUIET_MS + 60_000))).toBe("ai_active");
    });
  });

  it("keeps a chat the team took over on its own with the team past the quiet spell, on a widget with live chat on", async () => {
    await rollbackTest(async (chat) => {
      await chat.visitorWrites("You're useless.");
      // Take over from Messages, with nobody asking for the team.
      await chat.teamSets("human_handoff");
      expect(await chat.automation()).toMatchObject({ state: "human_handoff", pausedBy: chat.userId, teamJoinedAt: null });
      const quiet = new Date(Date.now() + TEAM_CHAT_QUIET_MS + 60_000);
      expect(await chat.returnQuiet(quiet)).toBe("human_handoff");
      expect(await chat.view(quiet)).toMatchObject({ automationState: "human_handoff", waitingForTeam: false, teamMemberName: "Yuri" });
      expect(await chat.automation()).toMatchObject({ state: "human_handoff", pausedBy: chat.userId });

      // Taking it over with a reply is the same.
      await chat.teamSets("ai_active");
      await chat.teamReplies("I'll take it from here.");
      expect(await chat.automation()).toMatchObject({ state: "human_handoff", teamJoinedAt: null });
      const stillQuiet = new Date(Date.now() + 24 * 60 * 60_000);
      expect(await chat.returnQuiet(stillQuiet)).toBe("human_handoff");
      expect(await chat.view(stillQuiet)).toMatchObject({ automationState: "human_handoff" });
    });
  });

  it("shows a quiet team still in a chat it joined when the widget's live chat is off, as the chat route then keeps it with them", async () => {
    await rollbackTest(async (chat) => {
      await chat.asksForPerson();
      await chat.teamReplies("Hi, this is Yuri.");
      const quiet = new Date(Date.now() + TEAM_CHAT_QUIET_MS + 60_000);
      expect(await chat.view(quiet, false)).toMatchObject({ automationState: "human_handoff", waitingForTeam: false, teamMemberName: "Yuri" });
    });
  });

  it("leaves a visitor waiting for someone to join to that request's own timer", async () => {
    await rollbackTest(async (chat) => {
      await chat.asksForPerson();
      expect(await chat.returnQuiet(new Date(Date.now() + 60 * 60_000))).toBe("human_handoff");
      expect(await chat.automation()).toMatchObject({ state: "human_handoff", teamRequestedAt: expect.any(Date) });
    });
  });
});

describe.skipIf(!testUrl)("a website chat after a day without messages, against PostgreSQL under production logins", () => {
  it("is closed when the visitor next writes, and their message starts a new chat the receptionist answers", async () => {
    await rollbackTest(async (chat) => {
      await chat.visitorWrites("Can I talk to someone?");
      await chat.teamReplies("Hi, this is Yuri.");
      const lastMessage = Date.now();

      expect(await chat.openChat(new Date(lastMessage + WIDGET_CHAT_IDLE_CLOSE_MS - 60_000))).toEqual({ conversationId: chat.conversationId, automationState: "human_handoff" });

      const nextDay = new Date(lastMessage + WIDGET_CHAT_IDLE_CLOSE_MS + 60_000);
      const next = await chat.openChat(nextDay);
      expect(next.conversationId).not.toBe(chat.conversationId);
      expect(next.automationState).toBe("ai_active");
      expect(await chat.chats()).toEqual(expect.arrayContaining([
        { id: chat.conversationId, status: "closed", state: "human_handoff" },
        { id: next.conversationId, status: "open", state: "ai_active" },
      ]));
      expect(await chat.sessions(chat.conversationId)).toEqual([{ status: "closed", closedAt: nextDay }]);
      expect(await chat.findChat(chat.visitorId)).toBe(next.conversationId);

      // The new chat has no messages yet, so it stays the visitor's chat however long they take.
      expect(await chat.openChat(new Date(nextDay.getTime() + 3 * WIDGET_CHAT_IDLE_CLOSE_MS))).toEqual(next);
      expect(await chat.chats()).toHaveLength(2);
    });
  });
});

describe.skipIf(!testUrl)("the chat a visitor's widget shows, against PostgreSQL under production logins", () => {
  it("is none for a new visitor, and looking starts nothing", async () => {
    await rollbackTest(async (chat) => {
      const newcomer = await chat.addVisitor();
      expect(await chat.shownChat(newcomer)).toBeNull();
      expect(await chat.chatCount()).toBe(1);
    });
  });

  it("is empty once a day passed without messages, and the old chat stays open until the visitor writes", async () => {
    await rollbackTest(async (chat) => {
      // A chat without messages yet is the one shown, however old.
      expect(await chat.shownChat(chat.visitorId, new Date(Date.now() + 3 * WIDGET_CHAT_IDLE_CLOSE_MS))).toBe(chat.conversationId);
      await chat.visitorWrites("Do you open on Sundays?");
      const lastMessage = Date.now();
      expect(await chat.shownChat(chat.visitorId, new Date(lastMessage + WIDGET_CHAT_IDLE_CLOSE_MS - 60_000))).toBe(chat.conversationId);

      const nextDay = new Date(lastMessage + WIDGET_CHAT_IDLE_CLOSE_MS + 60_000);
      expect(await chat.shownChat(chat.visitorId, nextDay)).toBeNull();
      // Looking closes nothing, so the live updates still follow the old chat for a team member's late reply.
      expect(await chat.chats()).toEqual([{ id: chat.conversationId, status: "open", state: "ai_active" }]);
      expect(await chat.findChat(chat.visitorId)).toBe(chat.conversationId);

      // The visitor's next message closes it and starts the chat shown from then on.
      const next = await chat.openChat(nextDay);
      expect(next.conversationId).not.toBe(chat.conversationId);
      expect(await chat.shownChat(chat.visitorId, nextDay)).toBe(next.conversationId);
    });
  });
});
