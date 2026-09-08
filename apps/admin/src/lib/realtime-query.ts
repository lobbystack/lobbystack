import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { parseRealtimeMessage } from "./realtime";

type Subscription = { key: QueryKey; events: readonly string[] };
type Connection = { subscriptions: Set<Subscription>; add(subscription: Subscription): void; dispose(): void };
const clients = new WeakMap<QueryClient, Map<string, Connection>>();

/** One connection per business and browser QueryClient; never shared across requests. */
export function subscribeRealtimeQuery(client: QueryClient, businessId: string, key: QueryKey, events: readonly string[]): () => void {
  let businesses = clients.get(client);
  if (!businesses) { businesses = new Map(); clients.set(client, businesses); }
  let connection = businesses.get(businessId);
  if (!connection) {
    const source = new EventSource(`/api/realtime?businessId=${encodeURIComponent(businessId)}`);
    const subscriptions = new Set<Subscription>();
    const eventNames = new Set<string>();
    const pending = new Map<string, QueryKey>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const queue = (event: Event) => {
      if (event.type !== "ready" && !parseRealtimeMessage((event as MessageEvent<string>).data, businessId)) return;
      for (const subscription of subscriptions) {
        if (event.type === "ready" || subscription.events.includes(event.type)) pending.set(JSON.stringify(subscription.key), subscription.key);
      }
      if (!timer && pending.size) timer = setTimeout(() => {
        timer = undefined;
        for (const queryKey of pending.values()) {
          if ([...subscriptions].some(subscription => JSON.stringify(subscription.key) === JSON.stringify(queryKey))) {
            void client.invalidateQueries({ queryKey, refetchType: "active" });
          }
        }
        pending.clear();
      }, 100);
    };
    // Every server subscription emits ready, including reconnects. Refetch to
    // recover changes missed while Redis Pub/Sub or the browser was disconnected.
    source.addEventListener("ready", queue);
    connection = {
      subscriptions,
      add(subscription) {
        for (const event of subscription.events) if (!eventNames.has(event)) { eventNames.add(event); source.addEventListener(event, queue); }
        subscriptions.add(subscription);
      },
      dispose() { if (timer) clearTimeout(timer); pending.clear(); source.close(); },
    };
    businesses.set(businessId, connection);
  }
  const subscription = { key, events };
  connection.add(subscription);
  const current = connection;
  return () => {
    current.subscriptions.delete(subscription);
    if (!current.subscriptions.size) { current.dispose(); businesses!.delete(businessId); }
  };
}
