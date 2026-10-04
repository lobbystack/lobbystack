import { sql } from "drizzle-orm";

export type ActorType = "operator" | "worker" | "dispatcher" | "system";

export type RlsContext = {
  userId?: string | undefined;
  businessId?: string | undefined;
  actorType: ActorType;
};

export function rlsContextStatements(context: RlsContext) {
  return [
    sql`select set_config('app.user_id', ${context.userId ?? ""}, true)`,
    sql`select set_config('app.business_id', ${context.businessId ?? ""}, true)`,
    sql`select set_config('app.actor_type', ${context.actorType}, true)`,
  ];
}
