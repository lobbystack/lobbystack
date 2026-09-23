import type WebSocket from "ws";

export const MAX_REALTIME_FRAME_BYTES = 256 * 1024;
export const MAX_SOCKET_BUFFER_BYTES = 2 * 1024 * 1024;
// Allow the supported 30-minute call at 24 kHz PCM16, base64 plus JSON,
// and 20 ms telephony media/mark events. These count traffic, not retained RAM.
export const MAX_SESSION_BYTES = 256 * 1024 * 1024;
export const MAX_SESSION_FRAMES = 200_000;

export function parseRealtimeFrame(raw: WebSocket.RawData, discriminator: "type" | "event"): Record<string, unknown> {
  const size = Array.isArray(raw) ? raw.reduce((total, chunk) => total + chunk.byteLength, 0) : raw.byteLength;
  if (size > MAX_REALTIME_FRAME_BYTES) throw new Error("Voice frame exceeds payload limit.");
  const bytes = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw as Uint8Array);
  let value: unknown;
  try { value = JSON.parse(bytes.toString()); } catch { throw new Error("Invalid voice frame JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof (value as Record<string, unknown>)[discriminator] !== "string") {
    throw new Error("Invalid voice frame envelope.");
  }
  const frame = value as Record<string, unknown>;
  if (discriminator === "type") {
    for (const key of ["event_id", "call_id", "name", "arguments", "item_id", "transcript", "delta", "response_id"]) {
      if (frame[key] !== undefined && typeof frame[key] !== "string") throw new Error("Invalid provider voice field.");
    }
    for (const key of ["response", "item", "error"]) {
      const nested = frame[key];
      if (nested !== undefined && (!nested || typeof nested !== "object" || Array.isArray(nested))) throw new Error("Invalid provider voice object.");
    }
    if ((frame.type === "response.audio.delta" || frame.type === "response.output_audio.delta") &&
        (typeof frame.delta !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(frame.delta))) {
      throw new Error("Invalid provider voice audio.");
    }
  }
  return frame;
}

export function createFrameBudget(): (raw: WebSocket.RawData) => void {
  let bytes = 0;
  let frames = 0;
  return (raw) => {
    bytes += Array.isArray(raw) ? raw.reduce((total, chunk) => total + chunk.byteLength, 0) : raw.byteLength;
    if (++frames > MAX_SESSION_FRAMES || bytes > MAX_SESSION_BYTES) {
      throw new Error("Voice session exceeds frame budget.");
    }
  };
}

export function assertSocketWritable(socket: WebSocket): void {
  if (socket.bufferedAmount > MAX_SOCKET_BUFFER_BYTES) throw new Error("Voice socket exceeds send buffer limit.");
}

export function closeVoiceSocket(socket: WebSocket | null): void {
  if (!socket || socket.readyState === 3) return;
  // terminate also releases sockets still connecting or waiting for a close ACK.
  if (typeof socket.terminate === "function") socket.terminate();
  else socket.close();
}

const finalizations = new WeakMap<object, Promise<void>>();
export function finalizeVoiceOnce(session: { finalized: boolean }, action: () => Promise<void>): Promise<void> {
  const pending = finalizations.get(session);
  if (pending) return pending;
  if (session.finalized) return Promise.resolve();
  session.finalized = true;
  const task = Promise.resolve().then(action);
  finalizations.set(session, task);
  return task;
}

export async function settleVoiceTasks(tasks: Iterable<Promise<unknown>>, timeoutMs = 5_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.allSettled(tasks),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
