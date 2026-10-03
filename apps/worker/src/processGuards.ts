import { redactOtelExceptionText } from "@lobbystack/telemetry/node";

type ProcessLike = Pick<NodeJS.Process, "on">;

/**
 * Logs a promise rejection nothing handled instead of exiting. Node exits on
 * one by default, and a transient Redis or network failure shouldn't take
 * down the worker and every live call it holds. BullMQ's production guide
 * recommends the same handler.
 */
export function logUnhandledRejections(target: ProcessLike = process): void {
  target.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(JSON.stringify({ event: "worker.unhandled_rejection", message: redactOtelExceptionText(message) }));
  });
}
