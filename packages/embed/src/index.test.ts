// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { initWidget } from "./index";

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });
async function start(response: Response) {
  vi.useFakeTimers();
  const script = document.createElement("script");
  script.setAttribute("data-widget-key", "fixture-key");
  script.setAttribute("data-base-url", "https://admin.example.test");
  vi.spyOn(document, "currentScript", "get").mockReturnValue(script);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  expect(initWidget()).toBe(true);
  const frame = document.querySelector("iframe")!;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await Promise.resolve(); await Promise.resolve();
  return { frame, post };
}
it("resends the completed session when the hydrated iframe announces readiness", async () => {
  const { frame, post } = await start(Response.json({ token: "fixture-session", expiresAt: "2099-01-01T00:00:00Z" }));
  frame.dispatchEvent(new Event("load"));
  post.mockClear();
  window.dispatchEvent(new MessageEvent("message", { origin: "https://admin.example.test", source: frame.contentWindow, data: { type: "ready" } }));
  expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "session", token: "fixture-session" }), "https://admin.example.test");
  post.mockClear();
  window.dispatchEvent(new MessageEvent("message", { origin: "https://admin.example.test", source: window, data: { type: "ready" } }));
  expect(post).not.toHaveBeenCalled();
});
it("delivers session errors to the iframe instead of leaving it disabled without feedback", async () => {
  const { frame, post } = await start(Response.json({ code: "widget_origin_denied" }, { status: 403 }));
  window.dispatchEvent(new MessageEvent("message", { origin: "https://admin.example.test", source: frame.contentWindow, data: { type: "ready" } }));
  expect(post).toHaveBeenCalledWith({ type: "session-error", code: "widget_origin_denied" }, "https://admin.example.test");
});
