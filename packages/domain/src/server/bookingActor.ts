/**
 * Who a booking's transactions run as. The dashboard books on the app role as
 * the signed-in operator; calls, chats and the API book as the worker.
 */
export function bookingActor(input: { businessId: string; operatorUserId?: string | undefined }): { businessId: string; userId?: string; actorType: "operator" | "worker" } {
  return input.operatorUserId ? { businessId: input.businessId, userId: input.operatorUserId, actorType: "operator" } : { businessId: input.businessId, actorType: "worker" };
}
