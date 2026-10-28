import { sql } from "drizzle-orm";

export type ActorType = "operator" | "worker" | "dispatcher" | "system";

export type RlsContext = {
  userId?: string | undefined;
  businessId?: string | undefined;
  /** A partner's platform key the transaction acts for, which names no user (migration 0162). */
  platformKeyId?: string | undefined;
  actorType: ActorType;
};

// One round trip. The `true` flag keeps each setting transaction-local so it never leaks to the next pooled checkout.
export function rlsContextStatement(context: RlsContext) {
  return sql`select set_config('app.user_id', ${context.userId ?? ""}, true), set_config('app.business_id', ${context.businessId ?? ""}, true), set_config('app.actor_type', ${context.actorType}, true), set_config('app.platform_key_id', ${context.platformKeyId ?? ""}, true)`;
}
