import { updateVoiceCallPresence } from "../backend/runtimeClient";

const HEARTBEAT_INTERVAL_MS = 10_000;

/** A live media session owns its presence. Billing reservations do not. */
export async function beginVoicePresence(
  input: { businessId: string; callId: string },
  onError: (error: unknown) => void,
): Promise<() => Promise<void>> {
  let stopped = false;
  let pending = Promise.resolve();
  const send = (active: boolean) => {
    pending = pending.then(async () => {
      try {
        await updateVoiceCallPresence({ ...input, active });
      } catch (error) {
        onError(error);
      }
    });
    return pending;
  };
  await send(true);
  const interval = setInterval(() => {
    if (!stopped) void send(true);
  }, HEARTBEAT_INTERVAL_MS);
  interval.unref?.();
  return async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    await send(false);
  };
}
