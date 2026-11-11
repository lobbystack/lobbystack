// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import { OnboardingMeetSurface } from "./onboarding-meet-surface";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
vi.mock("@/components/test-window", () => ({ TestPanel: ({ businessId }: { businessId: string }) => <p>test panel for {businessId}</p> }));
vi.mock("@/components/live-upgrade-plan-provider", () => ({ LiveUpgradePlanProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/upgrade-plan-dialog-context", () => ({
  useUpgradePlanDialogOpener: () => vi.fn(),
}));

function setup(business: Record<string, unknown> = {}, nextStage = "complete") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", slug: "acme", active: true, onboardingStage: "meet", partnerAccessLevel: null, ...business }] });
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/agent") return Response.json({ business: { defaultLocale: "fr" }, profile: { name: "Agent par défaut", greeting: "Bonjour", voice: "marin" } });
    if (url.startsWith("/api/knowledge")) return Response.json({ documents: [] });
    if (url.startsWith("/api/onboarding/stage")) return Response.json({ ok: true, stage: nextStage });
    return Response.json({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingMeetSurface /></QueryClientProvider>);
  return fetchMock;
}

beforeEach(() => {
  router.push.mockReset();
  telemetryRef.current = createRecordedBrowserTelemetry();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Meet your agent", () => {
  it("shows the panel beside the agent's settings", async () => {
    setup();
    expect(screen.getByText("test panel for business")).toBeTruthy();
    expect(((await screen.findByLabelText("meet.name")) as HTMLInputElement).value).toBe("Agent par défaut");
    expect((screen.getByLabelText("meet.greeting") as HTMLTextAreaElement).value).toBe("Bonjour");
  });

  it("saves a name as soon as the operator leaves the field", async () => {
    const fetchMock = setup();
    const name = await screen.findByLabelText("meet.name");
    fireEvent.change(name, { target: { value: "Maya" } });
    fireEvent.blur(name);
    await waitFor(() => {
      const save = fetchMock.mock.calls.find(([url, init]) => url === "/api/agent" && init?.method === "PATCH");
      expect(JSON.parse(String(save?.[1]?.body))).toEqual({ name: "Maya" });
    });
  });

  it("finishes onboarding from its one button, saving what's still typed", async () => {
    const fetchMock = setup();
    fireEvent.change(await screen.findByLabelText("meet.greeting"), { target: { value: "Salut" } });
    await userEvent.click(screen.getByRole("button", { name: "meet.finish" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));

    const save = fetchMock.mock.calls.find(([url, init]) => url === "/api/agent" && init?.method === "PATCH");
    expect(JSON.parse(String(save?.[1]?.body))).toEqual({ greeting: "Salut" });
    const stage = fetchMock.mock.calls.find(([url]) => url.startsWith("/api/onboarding/stage?"));
    expect(JSON.parse(String(stage?.[1]?.body))).toEqual({ to: "complete" });
    telemetryRef.current!.expectEvent("web.onboarding.meet_completed", { businessId: "business" });
  });

  it("opens the plans screen as the last step when the server says a trial waits on a plan", async () => {
    setup({}, "choose_plan");
    await screen.findByLabelText("meet.name");
    await userEvent.click(screen.getByRole("button", { name: "meet.finish" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/onboarding/plan"));
    expect(router.push).not.toHaveBeenCalledWith("/");
  });
});
