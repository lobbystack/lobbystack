// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingBusinessSurface } from "./onboarding-business-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
const router = vi.hoisted(() => ({ push: vi.fn() }));
const pendingAnalytics = vi.hoisted(() => ({ record: vi.fn() }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("@/lib/onboarding-analytics", () => ({ recordPendingOnboardingBusiness: pendingAnalytics.record }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("business creation onboarding", () => {
  it("waits for the created workspace to be refreshed before continuing", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
    client.setQueryData(["businesses"], { businesses: [] });
    let refresh: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? Response.json({ businessId: "business" }) : new Promise<Response>(resolve => { refresh = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={client}><OnboardingBusinessSurface /></QueryClientProvider>);
    await userEvent.type(screen.getByLabelText("businessName.label"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "businessName.continue" }));
    await waitFor(() => expect(refresh).toBeTypeOf("function"));
    expect(router.push).not.toHaveBeenCalled();
    refresh!(Response.json({ businesses: [{ businessId: "business", name: "Acme", active: true }] }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/onboarding/website"));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(pendingAnalytics.record).toHaveBeenCalledWith("business");
    expect(telemetryRef.current!.events).toEqual([]);
  });
});
