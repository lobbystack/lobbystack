import type { APIResponse, Response } from "@playwright/test";

/** Shared localhost tests obey the same rate limits as users. Retry only a rejected request. */
export async function respectingAuthRateLimit<T extends APIResponse | Response>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await request();
    if (response.status() !== 429 || attempt >= 2) return response;
    const seconds = Number(response.headers()["retry-after"] ?? 60);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60) throw new Error("Unexpected authentication Retry-After period.");
    await new Promise(resolve => setTimeout(resolve, (seconds + 0.25) * 1000));
  }
}
