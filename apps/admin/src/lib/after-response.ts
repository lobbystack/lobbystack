import { after } from "next/server";

/** Runs work after the response is sent, or right away outside a Next request (tests, scripts). */
export function runAfterResponse(task: () => Promise<unknown> | unknown): void {
  try {
    after(task);
  } catch {
    void Promise.resolve().then(task).catch(() => undefined);
  }
}
