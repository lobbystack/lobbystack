// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); navigation.push.mockReset(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", slug: "biz", active: true }] });
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => url === "/api/businesses" ? Response.json({ businesses: [{ businessId: "business", slug: "biz", active: true }] }) : Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingTestCallSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("onboarding test call", () => {
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
