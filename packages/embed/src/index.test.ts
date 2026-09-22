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
  // The session is issued on script load so existing embeds keep working and
  // the token is ready before the visitor opens the chat.
  expect(fetch).toHaveBeenCalled();
  // Only the chat iframe is deferred: no src until the visitor opens.
  expect(frame.hasAttribute("src")).toBe(false);
  window.LobbyStack!.open();
  expect(frame.getAttribute("src")).toBe("https://admin.example.test/embed/fixture-key");
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  // Flush the session request and its json/state continuations. A couple of
  // microtasks is not enough under CI load, which let the first "ready" race
  // the request and post only the visitor message.
  for (let index = 0; index < 50; index += 1) await Promise.resolve();
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

it("delivers the session to a lazily opened iframe that reports ready before the session resolves", async () => {
  vi.useFakeTimers();
  const script = document.createElement("script");
  script.setAttribute("data-widget-key", "fixture-key");
  script.setAttribute("data-base-url", "https://admin.example.test");
  vi.spyOn(document, "currentScript", "get").mockReturnValue(script);
  let resolveFetch!: (response: Response) => void;
  const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  expect(initWidget()).toBe(true);
  const frame = document.querySelector("iframe")!;
  expect(fetchMock).toHaveBeenCalled();
  window.LobbyStack!.open();
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  window.dispatchEvent(new MessageEvent("message", { origin: "https://admin.example.test", source: frame.contentWindow, data: { type: "ready" } }));
  expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ type: "session" }), "https://admin.example.test");
  resolveFetch(Response.json({ token: "late-session", expiresAt: "2099-01-01T00:00:00Z" }));
  for (let index = 0; index < 50; index += 1) await Promise.resolve();
  expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "session", token: "late-session", visitorId: expect.any(String) }), "https://admin.example.test");
});
it("keeps the sandbox and supports external links without exposing unsupported APIs", async () => {
  const { frame } = await start(Response.json({ token: "fixture-session" }));
  expect(frame.getAttribute("sandbox")?.split(" ")).toEqual(expect.arrayContaining(["allow-scripts", "allow-same-origin", "allow-popups", "allow-popups-to-escape-sandbox"]));
  expect(frame.getAttribute("sandbox")).not.toContain("allow-top-navigation");
  expect(Object.keys(window.LobbyStack!)).toEqual(["open", "close", "toggle"]);
  window.LobbyStack!.close();
  expect((frame.parentElement as HTMLElement).inert).toBe(true);
});
