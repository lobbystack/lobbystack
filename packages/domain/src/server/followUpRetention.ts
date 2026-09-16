import { sql } from "drizzle-orm";
import { inboxItems } from "@lobbystack/db";

export const FOLLOW_UP_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
export const EXPIRED_FOLLOW_UP_TITLE = "Expired voice message";
export const EXPIRED_FOLLOW_UP_BODY = "[Expired by 365-day retention policy]";
const expired = sql`${inboxItems.contentRetentionStatus} = 'scrubbed' or ${inboxItems.contentExpiresAt} <= current_timestamp`;
export const visibleFollowUpTitle = sql<string>`case when ${expired} then ${EXPIRED_FOLLOW_UP_TITLE} else ${inboxItems.title} end`.as("title");
export const visibleFollowUpBody = sql<string>`case when ${expired} then ${EXPIRED_FOLLOW_UP_BODY} else ${inboxItems.body} end`.as("body");
