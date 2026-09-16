import { sql } from "drizzle-orm";

export type ActorType = "operator" | "worker" | "dispatcher" | "system";

export type RlsContext = {
  userId?: string | undefined;
  businessId?: string | undefined;
  actorType: ActorType;
};

export const EMPTY_RLS_CONTEXT: RlsContext = {
  actorType: "system",
};

export function contextValue(value: string | undefined): string {
  return value ?? "";
}

export function rlsContextStatements(context: RlsContext) {
  return [
    sql`select set_config('app.user_id', ${contextValue(context.userId)}, true)`,
    sql`select set_config('app.business_id', ${contextValue(context.businessId)}, true)`,
    sql`select set_config('app.actor_type', ${context.actorType}, true)`,
  ];
}
