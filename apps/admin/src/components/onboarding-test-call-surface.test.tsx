// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMPORT_WAIT_LIMIT_MS } from "./onboarding-import-wait";
import { OnboardingTestCallSurface } from "./onboarding-test-call-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const navigation = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
const voice = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("@/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
// The orb runs the real browser call; here only what the page hands it matters.
vi.mock("@/components/web-voice/AuraVoiceDemo", () => ({ AuraVoiceDemo: (props: Record<string, unknown>) => { voice.props = props; return null; } }));

const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); navigation.push.mockReset(); voice.props = null; });
afterEach(() => { vi.useRealTimers(); cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

const websiteUrl = "https://resend.com";
const importIn = (status: string) => ({ documents: [{ id: "site", createdAt: "2026-11-01T10:00:00.000Z", websiteImport: { status, websiteUrl, importedCount: 3, indexedCount: 1 } }] });

function setup(knowledge: () => Response = () => Response.json({ documents: [] })) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", slug: "biz", active: true, websiteUrl }] });
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => url === "/api/businesses" ? Response.json({ businesses: [{ businessId: "business", slug: "biz", active: true, websiteUrl }] }) : url.startsWith("/api/knowledge") ? knowledge() : Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingTestCallSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("onboarding test call", () => {
  it("embeds the test panel, with the chat beside the call", async () => {
    setup();
    await waitFor(() => expect(voice.props).not.toBeNull());
    expect(screen.getByRole("textbox", { name: "testWindow.message" })).toBeTruthy();
  });

  it("calls the receptionist as the dashboard test call, then moves on to phone verification and records that the owner heard the agent", async () => {
    const fetchMock = setup();
    await waitFor(() => expect(voice.props).toMatchObject({ auraTone: "dark", businessSlug: "biz", endpoint: "/api/voice/live/session?businessId=business", widgetId: "lobbystack-dashboard-test-call" }));
    act(() => (voice.props!.onCallEnded as () => void)());
    await userEvent.click(await screen.findByRole("button", { name: "testCall.continue" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding/verify-phone"));
    const stageCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/onboarding/stage?"));
    expect(JSON.parse(String(stageCall?.[1]?.body))).toEqual({ to: "verify_phone" });
    telemetryRef.current!.expectEvent("web.onboarding.test_call_continued", { businessId: "business", heard: true });
  });

  it("lets the owner skip the call", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "testCall.skip" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding/verify-phone"));
    telemetryRef.current!.expectEvent("web.onboarding.test_call_continued", { businessId: "business", heard: false });
  });
});

describe("waiting for the website import before the test call", () => {
  const slide = "testCall.wait.slides.answers.title";
  // Only timers are faked, so the import's polling runs on demand and promises still settle.
  const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const loaded = () => advance(50);
  const nextPoll = () => advance(2_100);

  it("goes straight to the call when there is no import", async () => {
    setup();
    await waitFor(() => expect(voice.props).not.toBeNull());
    expect(screen.queryByText(slide)).toBeNull();
    expect(screen.queryByText("websiteImport.runningTitle")).toBeNull();
    expect(screen.getByRole("button", { name: "testCall.skip" })).toBeTruthy();
  });

  it("goes straight to the call, without a card, when the import ended before the operator got here", async () => {
    setup(() => Response.json(importIn("completed")));
    await waitFor(() => expect(voice.props).not.toBeNull());
    expect(screen.queryByText(slide)).toBeNull();
    expect(screen.queryByText("websiteImport.doneTitle")).toBeNull();
  });

  it("goes straight to the call when it can't tell whether an import is running", async () => {
    setup(() => Response.json({ error: "nope" }, { status: 403 }));
    await waitFor(() => expect(voice.props).not.toBeNull());
    expect(screen.queryByText(slide)).toBeNull();
  });

  it("holds the call back while the import runs, with progress and slides", async () => {
    setup(() => Response.json(importIn("crawling")));
    expect(await screen.findByText(slide)).toBeTruthy();
    expect(screen.getByText("websiteImport.runningTitle")).toBeTruthy();
    expect(voice.props).toBeNull();
    expect(screen.queryByRole("button", { name: "testCall.skip" })).toBeNull();
  });

  it("moves through the slides, and fades them only when the operator allows motion", async () => {
    fakeTimers();
    setup(() => Response.json(importIn("crawling")));
    await loaded();
    const answers = screen.getByText(slide);
    expect(answers.closest(".motion-safe\\:animate-in")).toBeTruthy();
    expect(answers.closest(".animate-in")).toBeNull();
    await advance(7_000);
    expect(screen.queryByText(slide)).toBeNull();
    expect(screen.getByText("testCall.wait.slides.booking.title")).toBeTruthy();
  });

  it("moves on by itself when the import finishes during the wait", async () => {
    fakeTimers();
    let status = "indexing";
    setup(() => Response.json(importIn(status)));
    await loaded();
    expect(screen.getByText(slide)).toBeTruthy();
    status = "completed";
    await nextPoll();
    expect(voice.props).not.toBeNull();
    expect(screen.queryByText(slide)).toBeNull();
    expect(screen.getByText("websiteImport.doneTitle")).toBeTruthy();
    expect(screen.queryByText("testCall.wait.stillReading")).toBeNull();
    expect(screen.getByRole("button", { name: "testCall.skip" })).toBeTruthy();
  });

  it("moves on by itself at the limit, says the agent keeps reading, and keeps polling", async () => {
    fakeTimers();
    let status = "crawling";
    setup(() => Response.json(importIn(status)));
    await advance(IMPORT_WAIT_LIMIT_MS - 1);
    expect(voice.props).toBeNull();
    await advance(1);
    expect(voice.props).not.toBeNull();
    expect(screen.queryByText(slide)).toBeNull();
    expect(screen.getByText("websiteImport.runningTitle")).toBeTruthy();
    expect(screen.getByText("testCall.wait.stillReading")).toBeTruthy();
    status = "completed";
    await nextPoll();
    expect(screen.getByText("websiteImport.doneTitle")).toBeTruthy();
    expect(screen.queryByText("testCall.wait.stillReading")).toBeNull();
  });

  it("moves on by itself when the import fails during the wait", async () => {
    fakeTimers();
    let status = "crawling";
    setup(() => Response.json(importIn(status)));
    await loaded();
    status = "failed";
    await nextPoll();
    expect(voice.props).not.toBeNull();
    expect(screen.queryByText(slide)).toBeNull();
    expect(screen.getByText("websiteImport.failedTitle")).toBeTruthy();
  });

  it("reaches the call at the limit when the check itself hangs", async () => {
    fakeTimers();
    setup(() => new Promise<Response>(() => undefined) as unknown as Response);
    await loaded();
    expect(voice.props).toBeNull();
    expect(screen.getByRole("button", { name: "testCall.skip" })).toBeTruthy();
    await advance(IMPORT_WAIT_LIMIT_MS);
    expect(voice.props).not.toBeNull();
  });

  it("lets the operator stop waiting at any time", async () => {
    setup(() => Response.json(importIn("queued")));
    await userEvent.click(await screen.findByRole("button", { name: "testCall.wait.skip" }));
    expect(voice.props).not.toBeNull();
    expect(screen.queryByText(slide)).toBeNull();
    expect(screen.getByRole("button", { name: "testCall.skip" })).toBeTruthy();
  });

  it("doesn't take the call away when a new import starts after the wait", async () => {
    fakeTimers();
    let status = "crawling";
    setup(() => Response.json(importIn(status)));
    await loaded();
    status = "completed";
    await nextPoll();
    expect(voice.props).not.toBeNull();
    status = "crawling";
    await advance(IMPORT_WAIT_LIMIT_MS);
    expect(screen.queryByText(slide)).toBeNull();
  });
});
