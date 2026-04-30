import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

type ConvexHarness = TestConvex<typeof schema>;

async function seedWorkspace(
  input: {
    subject: string;
    role?: "business_owner" | "business_admin" | "scheduler" | "viewer";
  },
) {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: `contact-blocking-${input.subject}`,
      name: "Contact Blocking Workspace",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "en",
      deploymentMode: "manual",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: input.subject,
      email: `${input.subject}@example.com`,
      displayName: "Operator One",
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: input.role ?? "business_owner",
      status: "active",
    });

    return { businessId, userId };
  });

  return {
    t,
    ...seeded,
    authed: t.withIdentity({ subject: input.subject }),
  };
}

async function insertUser(
  t: ConvexHarness,
  input: {
    subject: string;
    displayName?: string;
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      authSubject: input.subject,
      email: `${input.subject}@example.com`,
      displayName: input.displayName ?? "Operator",
    });
  });
}

async function insertContact(
  t: ConvexHarness,
  input: {
    businessId: Id<"businesses">;
    phone: string;
    blockedByUserId?: Id<"users">;
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("contacts", {
      businessId: input.businessId,
      phone: input.phone,
      name: "Taylor Customer",
      ...(input.blockedByUserId
        ? {
            operatorBlockedAt: "2026-04-15T14:00:00.000Z",
            operatorBlockedByUserId: input.blockedByUserId,
          }
        : {}),
    });
  });
}

describe("Contact blocking", () => {
  it("requires membership to block a contact", async () => {
    const { authed, businessId, t } = await seedWorkspace({
      subject: "contact-block-owner",
    });
    await insertUser(t, {
      subject: "contact-block-outsider",
      displayName: "Outside Operator",
    });
    const outsider = t.withIdentity({ subject: "contact-block-outsider" });
    const contactId = await insertContact(t, {
      businessId,
      phone: "+14165550191",
    });

    await authed.mutation(api.dashboard.contacts.blockContact, {
      businessId,
      contactId,
    });

    await expect(
      outsider.mutation(api.dashboard.contacts.unblockContact, {
        businessId,
        contactId,
      }),
    ).rejects.toThrow("You do not have access to this business.");
  });

  it("records the acting operator when blocking a contact and clears the metadata on unblock", async () => {
    const { authed, businessId, userId, t } = await seedWorkspace({
      subject: "contact-block-metadata",
    });
    const contactId = await insertContact(t, {
      businessId,
      phone: "+14165550192",
    });

    await authed.mutation(api.dashboard.contacts.blockContact, {
      businessId,
      contactId,
    });

    let detail = await authed.query(api.dashboard.contacts.getContactDetail, {
      businessId,
      contactId,
    });

    expect(detail?.contact).toMatchObject({
      id: contactId,
      isBlocked: true,
      blockedByName: "Operator One",
    });

    await t.run(async (ctx) => {
      const contact = await ctx.db.get(contactId);
      expect(contact).toMatchObject({
        operatorBlockedByUserId: userId,
      });
      expect(contact?.operatorBlockedAt).toBeTruthy();
    });

    await authed.mutation(api.dashboard.contacts.unblockContact, {
      businessId,
      contactId,
    });

    detail = await authed.query(api.dashboard.contacts.getContactDetail, {
      businessId,
      contactId,
    });

    expect(detail?.contact).toMatchObject({
      id: contactId,
      isBlocked: false,
      blockedAt: null,
      blockedByName: null,
    });

    await t.run(async (ctx) => {
      const contact = await ctx.db.get(contactId);
      expect(contact?.operatorBlockedAt).toBeUndefined();
      expect(contact?.operatorBlockedByUserId).toBeUndefined();
    });
  });

  it("only deletes standalone contacts", async () => {
    const { authed, businessId, t } = await seedWorkspace({
      subject: "contact-delete-guard",
    });
    const contactWithHistoryId = await insertContact(t, {
      businessId,
      phone: "+14165550196",
    });
    const standaloneContactId = await insertContact(t, {
      businessId,
      phone: "+14165550197",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("conversations", {
        businessId,
        contactId: contactWithHistoryId,
        channel: "sms",
        status: "open",
      });
      const staffId = await ctx.db.insert("staff", {
        businessId,
        name: "Jordan Lee",
        timezone: "America/Toronto",
        active: true,
      });
      const serviceId = await ctx.db.insert("services", {
        businessId,
        name: "Initial Consultation",
        slug: "initial-consultation",
        durationMinutes: 30,
        active: true,
      });

      await ctx.db.insert("appointments", {
        businessId,
        contactId: contactWithHistoryId,
        staffId,
        serviceId,
        startsAt: "2026-04-20T15:00:00.000Z",
        endsAt: "2026-04-20T15:30:00.000Z",
        timezone: "America/Toronto",
        status: "confirmed",
        sourceChannel: "dashboard",
        calendarSyncState: "pending",
      });
    });

    await expect(
      authed.mutation(api.dashboard.contacts.deleteContact, {
        businessId,
        contactId: contactWithHistoryId,
      }),
    ).rejects.toThrow(
      "This contact can't be deleted because it still has linked conversations or appointments.",
    );

    await t.run(async (ctx) => {
      expect(await ctx.db.get(contactWithHistoryId)).not.toBeNull();
    });

    await authed.mutation(api.dashboard.contacts.deleteContact, {
      businessId,
      contactId: standaloneContactId,
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(standaloneContactId)).toBeNull();
    });
  });

  it("blocks known contacts from new voice starts and preserves the blocked disposition during reconciliation", async () => {
    const { businessId, t, userId } = await seedWorkspace({
      subject: "contact-block-voice",
    });
    const contactId = await insertContact(t, {
      businessId,
      phone: "+14165550193",
      blockedByUserId: userId,
    });

    const result = await t.mutation(internal.voice.runtime.startCall, {
      businessId,
      twilioCallSid: "CA-contact-blocked",
      from: "+14165550193",
      to: "+14165550999",
      startedAt: "2026-04-15T15:00:00.000Z",
    });

    expect(result).toEqual({
      callId: result.callId,
      blocked: true,
      contactId,
    });

    await t.run(async (ctx) => {
      const call = await ctx.db
        .query("calls")
        .withIndex("by_twilio_call_sid", (q) => q.eq("twilioCallSid", "CA-contact-blocked"))
        .unique();
      const voiceConversations = await ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_contact_id", (q) =>
          q.eq("businessId", businessId).eq("contactId", contactId),
        )
        .collect();

      expect(call).toMatchObject({
        _id: result.callId,
        status: "completed",
        disposition: "contact_blocked",
        startedAt: "2026-04-15T15:00:00.000Z",
        endedAt: "2026-04-15T15:00:00.000Z",
      });
      expect(call?.conversationId).toBeUndefined();
      expect(voiceConversations.filter((conversation) => conversation.channel === "voice")).toHaveLength(0);
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(result.callId, {
        providerCostUsd: 0,
        providerPriceUnit: "usd",
      });
    });

    const reconcileResult = await t.mutation(internal.voice.runtime.reconcileTwilioCallStatus, {
      twilioCallSid: "CA-contact-blocked",
      callStatus: "completed",
      providerUpdatedAt: "2026-04-15T15:00:12.000Z",
    });

    expect(reconcileResult).toEqual({
      ignored: false,
      callId: result.callId,
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(result.callId);
      expect(call).toMatchObject({
        status: "completed",
        disposition: "contact_blocked",
        endedAt: "2026-04-15T15:00:12.000Z",
      });
    });
  });

  it("preserves an already-live call when a duplicate start arrives after the contact is blocked", async () => {
    const { businessId, t, userId } = await seedWorkspace({
      subject: "contact-block-voice-duplicate-start",
    });
    const contactId = await insertContact(t, {
      businessId,
      phone: "+14165550199",
    });

    const initialResult = await t.mutation(internal.voice.runtime.startCall, {
      businessId,
      twilioCallSid: "CA-contact-blocked-duplicate-start",
      from: "+14165550199",
      to: "+14165550999",
      startedAt: "2026-04-15T17:00:00.000Z",
    });

    expect(initialResult.blocked).toBe(false);
    expect(initialResult.conversationId).toBeDefined();

    await t.run(async (ctx) => {
      await ctx.db.patch(contactId, {
        operatorBlockedAt: "2026-04-15T17:00:05.000Z",
        operatorBlockedByUserId: userId,
      });
    });

    const duplicateStartResult = await t.mutation(internal.voice.runtime.startCall, {
      businessId,
      twilioCallSid: "CA-contact-blocked-duplicate-start",
      gatewaySessionId: "gateway-session-123",
      from: "+14165550199",
      to: "+14165550999",
      startedAt: "2026-04-15T17:00:06.000Z",
    });

    expect(duplicateStartResult).toEqual({
      callId: initialResult.callId,
      conversationId: initialResult.conversationId,
      blocked: false,
      contactId,
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(initialResult.callId);
      const voiceConversations = await ctx.db
        .query("conversations")
        .withIndex("by_business_id_and_contact_id", (q) =>
          q.eq("businessId", businessId).eq("contactId", contactId),
        )
        .collect();

      expect(call).toMatchObject({
        _id: initialResult.callId,
        conversationId: initialResult.conversationId,
        status: "in_progress",
        gatewaySessionId: "gateway-session-123",
      });
      expect(call?.disposition).toBeUndefined();
      expect(call?.endedAt).toBeUndefined();
      expect(
        voiceConversations.filter((conversation) => conversation.channel === "voice"),
      ).toHaveLength(1);
    });
  });

  it("system-blocks a voice call contact idempotently without an operator actor", async () => {
    const { businessId, t } = await seedWorkspace({
      subject: "contact-block-system-voice",
    });
    const contactId = await insertContact(t, {
      businessId,
      phone: "+14165550201",
    });

    const initialResult = await t.mutation(internal.voice.runtime.startCall, {
      businessId,
      twilioCallSid: "CA-system-block-contact",
      from: "+14165550201",
      to: "+14165550999",
      startedAt: "2026-04-15T18:00:00.000Z",
    });

    const blockResult = await t.mutation(
      internal.voice.runtime.systemBlockContactForVoiceCall,
      {
        callId: initialResult.callId,
        blockedAt: "2026-04-15T18:01:00.000Z",
      },
    );

    expect(blockResult).toEqual({
      blocked: true,
      contactId,
    });

    await t.run(async (ctx) => {
      const contact = await ctx.db.get(contactId);
      expect(contact).toMatchObject({
        operatorBlockedAt: "2026-04-15T18:01:00.000Z",
      });
      expect(contact?.operatorBlockedByUserId).toBeUndefined();
    });

    const idempotentResult = await t.mutation(
      internal.voice.runtime.systemBlockContactForVoiceCall,
      {
        callId: initialResult.callId,
        blockedAt: "2026-04-15T18:02:00.000Z",
      },
    );

    expect(idempotentResult).toEqual({
      blocked: true,
      contactId,
      reason: "already_blocked",
    });

    await t.run(async (ctx) => {
      const contact = await ctx.db.get(contactId);
      expect(contact?.operatorBlockedAt).toBe("2026-04-15T18:01:00.000Z");
    });
  });

  it("still allows unknown and unblocked contacts to start voice calls", async () => {
    const { authed, businessId, t } = await seedWorkspace({
      subject: "contact-block-voice-allowed",
    });
    const blockedContactId = await insertContact(t, {
      businessId,
      phone: "+14165550194",
    });

    const unknownResult = await t.mutation(internal.voice.runtime.startCall, {
      businessId,
      twilioCallSid: "CA-unknown-contact",
      from: "+14165550195",
      to: "+14165550999",
      startedAt: "2026-04-15T16:00:00.000Z",
    });

    expect(unknownResult.blocked).toBe(false);
    expect(unknownResult.conversationId).toBeDefined();

    await authed.mutation(api.dashboard.contacts.blockContact, {
      businessId,
      contactId: blockedContactId,
    });
    await authed.mutation(api.dashboard.contacts.unblockContact, {
      businessId,
      contactId: blockedContactId,
    });

    const unblockedResult = await t.mutation(internal.voice.runtime.startCall, {
      businessId,
      twilioCallSid: "CA-unblocked-contact",
      from: "+14165550194",
      to: "+14165550999",
      startedAt: "2026-04-15T16:05:00.000Z",
    });

    expect(unblockedResult).toMatchObject({
      blocked: false,
      contactId: blockedContactId,
    });
    expect(unblockedResult.conversationId).toBeDefined();
  });
});
