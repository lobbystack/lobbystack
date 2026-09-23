import { sql } from "drizzle-orm";
import { inboxItems } from "@lobbystack/db";

export const FOLLOW_UP_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
export const EXPIRED_FOLLOW_UP_TITLE = "Expired voice message";
// The stored placeholder is kept stable for migration reconciliation. Shown text
// stays plan-agnostic because free content now expires at 30 days.
export const EXPIRED_FOLLOW_UP_BODY = "[Expired by 365-day retention policy]";
const EXPIRED_FOLLOW_UP_DISPLAY_BODY = "[Expired by the retention policy]";
const expired = sql`${inboxItems.contentRetentionStatus} = 'scrubbed' or ${inboxItems.contentExpiresAt} <= current_timestamp`;
export const visibleFollowUpTitle = sql<string>`case when ${expired} then ${EXPIRED_FOLLOW_UP_TITLE} else ${inboxItems.title} end`.as("title");
export const visibleFollowUpBody = sql<string>`case when ${expired} then ${EXPIRED_FOLLOW_UP_DISPLAY_BODY} else ${inboxItems.body} end`.as("body");
