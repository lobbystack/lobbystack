import Redis from "ioredis";
import type { RealtimeEvent } from "@lobbystack/contracts";

import { parseRealtimeMessage } from "./realtime";

export type RealtimeListener = {
  event(event: RealtimeEvent): void;
  /** The Redis connection dropped. Pub/Sub keeps no backlog, so the listener may have missed events. */
  reset(): void;
};

type Channel = { businessId: string; listeners: Set<RealtimeListener>; subscribed: Promise<unknown> };

/**
 * One Redis subscriber shared by every website chat stream in this process, so
 * an open chat costs a listener instead of a Redis connection. Visitors can open
 * as many chats as they like; Redis connections are shared with the job queue.
 */
class RealtimeHub {
  private readonly subscriber: Redis;
  private readonly connected: Promise<void>;
  private readonly channels = new Map<string, Channel>();
  private closed = false;

  constructor(redisUrl: string, private readonly prefix: string, private readonly onClose: (hub: RealtimeHub) => void) {
    this.subscriber = new Redis(redisUrl, { protocol: 2, maxRetriesPerRequest: 1, lazyConnect: true, connectionName: "lobbystack:widget-sse" });
    this.subscriber.on("message", (name: string, rawMessage: string) => this.dispatch(name, rawMessage));
    // A drop ends this hub: its listeners reset and the next one connects afresh.
    this.subscriber.once("close", () => this.close());
    // Errors also close the connection, which resets the listeners.
    this.subscriber.on("error", () => undefined);
    this.connected = this.subscriber.connect();
    this.connected.catch(() => this.close());
  }

  async listen(businessId: string, listener: RealtimeListener): Promise<() => void> {
    if (this.closed) throw new Error("The realtime connection is closed.");
    const name = `${this.prefix}:realtime:${businessId}`;
    let channel = this.channels.get(name);
    if (!channel) {
      channel = { businessId, listeners: new Set(), subscribed: this.connected.then(() => this.subscriber.subscribe(name)) };
      this.channels.set(name, channel);
    }
    const current = channel;
    current.listeners.add(listener);
    const stop = () => this.remove(name, current, listener);
    try {
      await current.subscribed;
    } catch (error) {
      stop();
      throw error;
    }
    if (this.closed) {
      stop();
      throw new Error("The realtime connection is closed.");
    }
    return stop;
  }

  private remove(name: string, channel: Channel, listener: RealtimeListener): void {
    if (!channel.listeners.delete(listener) || channel.listeners.size > 0 || this.channels.get(name) !== channel) return;
    this.channels.delete(name);
    if (!this.closed) void this.subscriber.unsubscribe(name).catch(() => undefined);
  }

  private dispatch(name: string, rawMessage: string): void {
    const channel = this.channels.get(name);
    if (!channel) return;
    const event = parseRealtimeMessage(rawMessage, channel.businessId);
    if (!event) return;
    for (const listener of [...channel.listeners]) listener.event(event);
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose(this);
    this.subscriber.disconnect(false);
    const listeners = [...this.channels.values()].flatMap((channel) => [...channel.listeners]);
    this.channels.clear();
    for (const listener of listeners) listener.reset();
  }
}

let hub: RealtimeHub | undefined;

/** Whether this process can listen for realtime events at all. */
export function realtimeConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/**
 * Listens to one business's realtime events. Resolves once the subscription is
 * live; call the returned function to stop. Rejects when Redis is unreachable.
 */
export async function listenToBusinessRealtime(businessId: string, listener: RealtimeListener): Promise<() => void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("Realtime is not configured.");
  hub ??= new RealtimeHub(redisUrl, process.env.REDIS_PREFIX ?? "lobbystack", (closed) => {
    if (hub === closed) hub = undefined;
  });
  return await hub.listen(businessId, listener);
}
