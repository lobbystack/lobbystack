import { randomUUID } from "node:crypto";

import { getPool } from "@lobbystack/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getContactDetail, getDashboardSummary } from "./dashboard";
import { getConversationThread, listConversationSummaries } from "./messages";

const hasDatabase = Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_APP);

describe.skipIf(!hasDatabase)("message read models", () => {
  let pool: Pool;
  const businessId = randomUUID();
  const contactId = randomUUID();
  const conversationId = randomUUID();
  const firstMessageId = randomUUID();
  const secondMessageId = randomUUID();

  beforeAll(async () => {
    pool = getPool("app");
    await pool.query(
      `INSERT INTO app.businesses (id, slug, name, timezone)
       VALUES ($1, $2, $3, $4)`,
      [businessId, `messages-${businessId.slice(0, 8)}`, "Messages Test", "UTC"],
    );
    await pool.query(
      `INSERT INTO app.contacts (id, business_id, display_name, phone_e164, email)
       VALUES ($1, $2, $3, $4, $5)`,
      [contactId, businessId, "Messages Contact", "+14165550123", "contact@messages.test"],
    );
    await pool.query(
      `INSERT INTO app.conversations (id, business_id, contact_id, channel, status)
       VALUES ($1, $2, $3, 'sms', 'open')`,
      [conversationId, businessId, contactId],
    );
    await pool.query(
      `INSERT INTO app.messages (id, business_id, conversation_id, direction, sender_role, body, status, created_at)
       VALUES ($1, $2, $3, 'inbound', 'contact', 'Hello', 'delivered', '2030-01-01T10:00:00.000Z')`,
      [firstMessageId, businessId, conversationId],
    );
    await pool.query(
      `INSERT INTO app.messages (id, business_id, conversation_id, direction, sender_role, body, status, created_at)
       VALUES ($1, $2, $3, 'outbound', 'operator', 'Hi there', 'sent', '2030-01-01T10:01:00.000Z')`,
      [secondMessageId, businessId, conversationId],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM app.businesses WHERE id = $1`, [businessId]);
    await pool.end();
  });

  it("lists the latest message and count for each conversation", async () => {
    const conversations = await listConversationSummaries({ businessId, pool });
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      id: conversationId,
      contactName: "Messages Contact",
      contactPhone: "+14165550123",
      messageCount: 2,
      lastMessageBody: "Hi there",
      lastMessageDirection: "outbound",
      lastMessageStatus: "sent",
    });
  });

  it("returns a tenant-scoped thread in chronological order", async () => {
    const thread = await getConversationThread({ businessId, conversationId, pool });
    expect(thread?.contact.email).toBe("contact@messages.test");
    expect(thread?.messages.map((message) => message.id)).toEqual([
      firstMessageId,
      secondMessageId,
    ]);
    expect(thread?.messages[0]?.createdAt).toBe("2030-01-01T10:00:00.000Z");
  });

  it("builds contact activity totals and a recent timeline", async () => {
    const summary = await getDashboardSummary({ businessId, pool });
    expect(summary.activeContacts).toBeGreaterThanOrEqual(1);

    const contact = await getContactDetail({ businessId, contactId, pool });
    expect(contact).toMatchObject({
      id: contactId,
    });
  });
});
