export type ActiveBusiness = { businessId: string; active?: boolean };

/** Keeps every client surface aligned with the server-selected active workspace. */
export function selectActiveBusiness<T extends ActiveBusiness>(businesses: T[] | undefined): T | undefined {
  return businesses?.find((business) => business.active) ?? businesses?.[0];
}
