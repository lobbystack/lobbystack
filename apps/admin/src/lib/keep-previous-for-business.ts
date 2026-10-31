/**
 * `placeholderData` for a query keyed `[name, businessId, ...]`: keep the previous page, search or range on
 * screen while the next one loads, but never another business's data after the active business changes.
 */
export function keepPreviousForBusiness<TData>(businessId: string | undefined) {
  return (previousData: TData | undefined, previousQuery: { queryKey: readonly unknown[] } | undefined): TData | undefined =>
    previousQuery?.queryKey[1] === businessId ? previousData : undefined;
}
