import { and, desc, eq, isNotNull } from "drizzle-orm";

import { conversations, enqueueOutbox, messages, users, withBusinessTransaction } from "@lobbystack/db";
import type { RuntimeLocale } from "@lobbystack/shared";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";

import type { DomainContext } from "./context";
import { insertMessageInTransaction } from "./conversations";
import { queueOperatorAlertInTransaction } from "./notifications";
import { recordProductEventBestEffort } from "./productEvents";

// Live chat with the team in the website widget. A visitor who asks for a
// person hands the chat to the team, which gets an alert, and waits. The first
// team member to reply or press Join in Messages has the chat. If nobody does
// in time, the receptionist takes it back and offers to take a message. A team
// that goes quiet in a chat it joined this way gives it back the same way, the
// next time the visitor writes. A chat the team took over on its own stays with
// the team until someone resumes the AI.

/** How long a visitor waits for someone from the team before the receptionist takes the chat back. */
export const TEAM_REQUEST_WAIT_MS = 3 * 60_000;

/** How long the team can leave a chat it joined without a word before the receptionist answers the visitor again. */
export const TEAM_CHAT_QUIET_MS = 10 * 60_000;

/**
 * Whether the team has gone quiet in a chat it joined after the visitor asked
 * for a person: nobody from the team wrote in it in TEAM_CHAT_QUIET_MS since a
 * team member joined. A chat the team took over on its own never goes quiet,
 * and a visitor still waiting for someone to join is left to that request's
 * own timer.
 */
export function teamChatWentQuiet(chat: { teamRequestedAt: Date | null; teamJoinedAt: Date | null; automationPausedAt: Date | null; lastTeamMessageAt: Date | null }, now: Date): boolean {
  if (chat.teamRequestedAt || !chat.teamJoinedAt) return false;
  const lastActiveAt = Math.max(chat.teamJoinedAt.getTime(), chat.automationPausedAt?.getTime() ?? 0, chat.lastTeamMessageAt?.getTime() ?? 0);
  return now.getTime() - lastActiveAt >= TEAM_CHAT_QUIET_MS;
}

/** What the receptionist says when nobody from the team joined in time. */
const NOBODY_JOINED: Record<RuntimeLocale, string> = {
  en: "Sorry, nobody from the team is free to join right now. If you'd like, leave your name and the best number to reach you, and someone will get back to you.",
  fr: "Désolé, personne de l'équipe n'est disponible pour le moment. Si vous le souhaitez, laissez votre nom et le meilleur numéro pour vous joindre, et quelqu'un vous recontactera.",
  es: "Lo siento, ahora mismo no hay nadie del equipo disponible para unirse al chat. Si lo desea, deje su nombre y el mejor número para contactarle, y alguien le devolverá la llamada.",
  sr: "Izvinite, trenutno niko iz tima nije slobodan da se uključi u razgovor. Ako želite, ostavite ime i broj telefona na kom ste dostupni, i neko će vam se javiti.",
  de: "Leider ist gerade niemand aus dem Team frei. Wenn Sie möchten, hinterlassen Sie Ihren Namen und eine Telefonnummer, unter der Sie gut erreichbar sind, und wir melden uns bei Ihnen.",
  pt: "Desculpe, ninguém da equipe está disponível para entrar na conversa agora. Se quiser, deixe seu nome e o melhor número para falarmos com você, e alguém vai retornar o contato.",
  it: "Ci dispiace, al momento nessuno del team è libero di unirsi alla chat. Se vuole, lasci il suo nome e il numero migliore per contattarla e qualcuno la richiamerà.",
  nl: "Sorry, er is nu niemand van het team vrij om mee te praten. Als u wilt, laat dan uw naam en het beste nummer achter waarop we u kunnen bereiken, dan neemt iemand contact met u op.",
};

export type TeamRequestOutcome =
  | { ok: true; waitMinutes: number }
  /** The team already has the chat, or a visitor is already waiting for them. */
  | { ok: false; reason: "team_has_chat" | "not_found" };

/**
 * A website visitor asked for a person: the AI stops answering, the team is
 * alerted, and the chat waits for someone to join. `reason` is what the
 * visitor needs, for the alert.
 */
export async function requestTeamForWidgetChat(
  context: DomainContext,
  input: { businessId: string; conversationId: string; locale: RuntimeLocale; reason?: string; now?: Date },
): Promise<TeamRequestOutcome> {
  const requestedAt = input.now ?? new Date();
  const reason = input.reason?.replace(/\s+/g, " ").trim().slice(0, 200);
  const outcome = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx): Promise<TeamRequestOutcome> => {
    const [current] = await tx.select({ channel: conversations.channel, automationState: conversations.automationState }).from(conversations).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId))).limit(1).for("update");
    if (!current || current.channel !== "web_chat") return { ok: false, reason: "not_found" };
    if (current.automationState !== "ai_active") return { ok: false, reason: "team_has_chat" };
    await tx.update(conversations).set({ automationState: "human_handoff", automationPausedAt: requestedAt, automationPausedByUserId: null, teamRequestedAt: requestedAt, teamJoinedAt: null, updatedAt: requestedAt }).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)));
    await queueOperatorAlertInTransaction(tx, {
      businessId: input.businessId,
      eventKind: "liveChatRequest",
      eventKey: `liveChatRequest:${input.conversationId}:${requestedAt.getTime()}`,
      subject: "A website visitor is asking for a person",
      body: [
        `Someone chatting on your website asked to talk with a person. Reply from Messages within ${TEAM_REQUEST_WAIT_MS / 60_000} minutes to take over the chat. After that, the receptionist offers to take a message.`,
        reason ? `What they need: ${reason}` : "",
      ].filter(Boolean).join(" "),
    });
    // The worker hands the chat back to the receptionist if this request is still open then.
    await enqueueOutbox(tx, {
      topic: "conversation.expireTeamRequest",
      businessId: input.businessId,
      aggregateType: "conversation",
      aggregateId: input.conversationId,
      dedupeKey: `conversation:${input.conversationId}:team-request:${requestedAt.getTime()}`,
      availableAt: new Date(requestedAt.getTime() + TEAM_REQUEST_WAIT_MS),
      payload: { conversationId: input.conversationId, requestedAt: requestedAt.toISOString(), locale: input.locale },
    });
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "conversation",
      aggregateId: input.conversationId,
      dedupeKey: `conversation:${input.conversationId}:team-requested:${requestedAt.getTime()}`,
      payload: { type: "conversation.updated", entityId: input.conversationId },
    });
    return { ok: true, waitMinutes: TEAM_REQUEST_WAIT_MS / 60_000 };
  });
  if (outcome.ok) await recordTeamEvent(context, "conversation.team_requested", input);
  return outcome;
}

/**
 * Nobody from the team joined in time: the receptionist takes the chat back
 * and offers to take a message. Does nothing when the request was answered,
 * the team handed the chat back, or the visitor asked again since.
 */
export async function expireTeamRequest(
  context: DomainContext,
  input: { businessId: string; conversationId: string; requestedAt: Date; locale: RuntimeLocale },
): Promise<{ expired: boolean }> {
  const expired = await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [current] = await tx.select({ automationState: conversations.automationState, teamRequestedAt: conversations.teamRequestedAt }).from(conversations).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId))).limit(1).for("update");
    if (current?.automationState !== "human_handoff" || current.teamRequestedAt?.getTime() !== input.requestedAt.getTime()) return false;
    const now = new Date();
    await tx.update(conversations).set({ automationState: "ai_active", automationPausedAt: null, automationPausedByUserId: null, teamRequestedAt: null, teamJoinedAt: null, updatedAt: now }).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)));
    await insertMessageInTransaction(tx, { businessId: input.businessId, conversationId: input.conversationId, body: NOBODY_JOINED[input.locale], direction: "outbound", channel: "web_chat", aiGenerated: true });
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "conversation",
      aggregateId: input.conversationId,
      dedupeKey: `conversation:${input.conversationId}:team-request:${input.requestedAt.getTime()}:expired`,
      payload: { type: "conversation.updated", entityId: input.conversationId },
    });
    return true;
  });
  if (expired) await recordTeamEvent(context, "conversation.team_request_expired", input);
  return { expired };
}

/**
 * A visitor wrote in a chat the team has. When the team joined it after the
 * visitor asked for a person and has gone quiet in it since, the receptionist
 * takes the chat back and answers, so a visitor who returns later isn't left
 * waiting for someone who left. Only a widget with live chat on asks. Returns
 * who answers now.
 */
export async function returnQuietTeamChat(
  context: DomainContext,
  input: { businessId: string; conversationId: string; now?: Date },
): Promise<"ai_active" | "human_handoff"> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [current] = await tx.select({ automationState: conversations.automationState, automationPausedAt: conversations.automationPausedAt, teamRequestedAt: conversations.teamRequestedAt, teamJoinedAt: conversations.teamJoinedAt }).from(conversations).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId))).limit(1).for("update");
    if (current?.automationState !== "human_handoff") return "ai_active";
    const [lastTeamMessage] = await tx.select({ createdAt: messages.createdAt }).from(messages).where(and(eq(messages.businessId, input.businessId), eq(messages.conversationId, input.conversationId), isNotNull(messages.sentByUserId))).orderBy(desc(messages.createdAt)).limit(1);
    if (!teamChatWentQuiet({ ...current, lastTeamMessageAt: lastTeamMessage?.createdAt ?? null }, now)) return "human_handoff";
    await tx.update(conversations).set({ automationState: "ai_active", automationPausedAt: null, automationPausedByUserId: null, teamJoinedAt: null, updatedAt: now }).where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)));
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "conversation",
      aggregateId: input.conversationId,
      dedupeKey: `conversation:${input.conversationId}:team-quiet:${now.getTime()}`,
      payload: { type: "conversation.updated", entityId: input.conversationId },
    });
    return "ai_active";
  });
}

/**
 * Tells the visitor's open widgets to reload the chat for a receptionist reply
 * saved after the visitor left the page that asked for it: a widget opened on
 * the next page may have loaded the chat before the reply was there.
 */
export async function announceLateWidgetReply(context: DomainContext, input: { businessId: string; conversationId: string; messageId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "conversation",
      aggregateId: input.conversationId,
      dedupeKey: `conversation:${input.conversationId}:late-reply:${input.messageId}`,
      payload: { type: "conversation.updated", entityId: input.conversationId },
    });
  });
}

// Both run on the worker login (the widget's chat and the worker's job), which reads the business only as the worker.
async function recordTeamEvent(context: DomainContext, name: "conversation.team_requested" | "conversation.team_request_expired", input: { businessId: string; conversationId: string }): Promise<void> {
  await recordProductEventBestEffort(context, {
    name,
    businessId: input.businessId,
    distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
    actorType: "worker",
    properties: { conversationId: input.conversationId, channel: "web_chat" },
  });
}

/**
 * All a website visitor sees of a team member's name: its first word. Null
 * when there's nothing to show, or the name is an email address.
 */
export function teamMemberFirstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
  return first && !first.includes("@") ? first : null;
}

export type WidgetChatView = {
  automationState: "ai_active" | "human_handoff";
  /** The visitor asked for a person and nobody has joined yet. */
  waitingForTeam: boolean;
  /** The first name of the team member who has the chat, when one does and has a name. */
  teamMemberName: string | null;
  /** The newest 200 messages, oldest first. A team member's message carries their first name. */
  messages: Array<{ id: string; direction: "inbound" | "outbound"; body: string; createdAt: Date; fromTeam: boolean; teamMemberName: string | null }>;
};

/**
 * What the visitor's widget shows of their chat: its messages and who from the
 * team is in it. `liveChatOn` is whether the widget has live chat on, as the
 * chat route only hands a quiet team's chat back then.
 */
export async function loadWidgetChatView(context: DomainContext, input: { businessId: string; conversationId: string; liveChatOn: boolean; now?: Date }): Promise<WidgetChatView> {
  const now = input.now ?? new Date();
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [conversation] = await tx.select({ automationState: conversations.automationState, automationPausedAt: conversations.automationPausedAt, teamRequestedAt: conversations.teamRequestedAt, teamJoinedAt: conversations.teamJoinedAt, pausedByName: users.name })
      .from(conversations)
      .leftJoin(users, eq(users.id, conversations.automationPausedByUserId))
      .where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)))
      .limit(1);
    const rows = await tx.select({ id: messages.id, direction: messages.direction, body: messages.body, createdAt: messages.createdAt, sentByUserId: messages.sentByUserId, senderName: users.name })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.sentByUserId))
      .where(and(eq(messages.businessId, input.businessId), eq(messages.conversationId, input.conversationId)))
      .orderBy(desc(messages.createdAt))
      .limit(200);
    const handoff = conversation?.automationState === "human_handoff";
    const waitingForTeam = handoff && Boolean(conversation.teamRequestedAt);
    // A team that went quiet in a chat it joined no longer has it: the receptionist answers the visitor's next message.
    const lastTeamMessageAt = rows.find((row) => row.direction !== "inbound" && row.sentByUserId !== null)?.createdAt ?? null;
    const teamHasChat = handoff && !waitingForTeam && !(input.liveChatOn && teamChatWentQuiet({ teamRequestedAt: null, teamJoinedAt: conversation.teamJoinedAt, automationPausedAt: conversation.automationPausedAt, lastTeamMessageAt }, now));
    return {
      automationState: waitingForTeam || teamHasChat ? "human_handoff" : "ai_active",
      waitingForTeam,
      teamMemberName: teamHasChat ? teamMemberFirstName(conversation.pausedByName) : null,
      messages: rows.reverse().map((row) => ({
        id: row.id,
        direction: row.direction === "inbound" ? "inbound" : "outbound",
        body: row.body,
        createdAt: row.createdAt,
        fromTeam: row.direction !== "inbound" && row.sentByUserId !== null,
        teamMemberName: row.sentByUserId ? teamMemberFirstName(row.senderName) : null,
      })),
    };
  });
}
