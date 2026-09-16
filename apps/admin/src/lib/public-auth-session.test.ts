import { afterEach, expect, it, vi } from "vitest";
import { readPublicAuthSession } from "./public-auth-session";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each(["retry-after", "x-retry-after"])("honors %s before recovering the signed-in session", async header => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429, headers: { [header]: "2" } })).mockResolvedValueOnce(Response.json({ user: { id: "operator" } }));
  vi.stubGlobal("fetch", fetcher);
  const result = readPublicAuthSession(new AbortController().signal);
  await vi.advanceTimersByTimeAsync(2000); expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  await expect(result).resolves.toEqual({ user: { id: "operator" } });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("preserves an explicitly anonymous successful response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(null)));
  await expect(readPublicAuthSession(new AbortController().signal)).resolves.toBeNull();
});
it("cancels a pending retry when the page unmounts", async () => {
  vi.useFakeTimers(); const controller = new AbortController();
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { "retry-after": "60" } }));
  vi.stubGlobal("fetch", fetcher);
  const result = readPublicAuthSession(controller.signal);
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(1); controller.abort(); await rejected;
  await vi.runAllTimersAsync(); expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not turn a server failure into an anonymous session", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(readPublicAuthSession(new AbortController().signal)).rejects.toThrow("Unable to read authentication session.");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
