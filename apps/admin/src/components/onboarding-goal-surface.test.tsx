// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingGoalSurface } from "./onboarding-goal-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const route = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn() } }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("next/navigation", () => ({ useRouter: () => route.router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const clients: QueryClient[] = [];
beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  route.router.push.mockReset();
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup(business: Record<string, unknown> = {}, instagramConfigured = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, onboardingStage: "goal", onboardingGoal: null, ...business }] });
  const fetchMock = vi.fn(async (url: string) => Response.json(url.includes("/api/integrations/instagram") ? { configured: instagramConfigured, account: null } : { ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingGoalSurface /></QueryClientProvider>);
  const posts = () => fetchMock.mock.calls.filter(([url]) => url.includes("/api/onboarding/goal"));
  return { posts };
}

describe("onboarding goal question", () => {
  it("saves the goal, records it, and moves on to attribution", async () => {
    const { posts } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "goal.options.book_appointments" }));
    await userEvent.click(screen.getByRole("button", { name: "goal.continue" }));
    await waitFor(() => expect(route.router.push).toHaveBeenCalledWith("/onboarding/attribution"));
    expect(JSON.parse(String((posts()[0] as unknown as [string, RequestInit])[1].body))).toEqual({ goal: "book_appointments" });
    telemetryRef.current!.expectEvent("web.onboarding.goal_submitted", { businessId: "business", goal: "book_appointments" });
  });

  it("lets the operator skip without recording a goal", async () => {
    const { posts } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "goal.skip" }));
    await waitFor(() => expect(route.router.push).toHaveBeenCalledWith("/onboarding/attribution"));
    expect(JSON.parse(String((posts()[0] as unknown as [string, RequestInit])[1].body))).toEqual({ goal: null });
    expect(telemetryRef.current!.events.some(event => event.name === "web.onboarding.goal_submitted")).toBe(false);
  });

  it("shows the saved answer and goes home when revisited after onboarding", async () => {
    setup({ onboardingStage: "complete", onboardingGoal: "answer_calls" });
    const saved = await screen.findByRole("button", { name: "goal.options.answer_calls" });
    expect(saved.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "goal.continue" }));
    await waitFor(() => expect(route.router.push).toHaveBeenCalledWith("/"));
  });

  it("leaves Instagram out on a server that can't connect it", async () => {
    setup({}, false);
    await screen.findByRole("button", { name: "goal.options.answer_calls" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "goal.options.answer_instagram_messages" })).toBeNull());
  });
});
