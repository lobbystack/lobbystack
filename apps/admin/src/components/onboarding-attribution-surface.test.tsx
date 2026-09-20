// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingAttributionSurface } from "./onboarding-attribution-surface";
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
  route.router.refresh.mockReset();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  const fetchMock = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingAttributionSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("onboarding attribution telemetry", () => {
  it("records the selected attribution source", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "attribution.options.google" }));
    await userEvent.click(screen.getByRole("button", { name: "attribution.finish" }));
    await waitFor(() => expect(route.router.push).toHaveBeenCalledWith("/"));
    telemetryRef.current!.expectEvent("web.onboarding.attribution_submitted", { businessId: "business", source: "google" });
  });

  it("does not emit attribution_submitted when the operator skips", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "attribution.skip" }));
    await waitFor(() => expect(route.router.push).toHaveBeenCalledWith("/"));
    expect(telemetryRef.current!.events.some(event => event.name === "web.onboarding.attribution_submitted")).toBe(false);
  });
});
