// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingKnowledgeSurface } from "./onboarding-knowledge-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); navigation.push.mockReset(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Acme", active: true, role: "business_owner" }] });
  client.setQueryData(["onboarding-knowledge", "business"], { documents: [] });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/uploads" && init?.method === "POST") return Response.json({ objectId: "object", url: "https://uploads.example.invalid/object" });
    if (url === "/api/uploads" && init?.method === "PUT") return Response.json({ ok: true });
    return Response.json({ documents: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingKnowledgeSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("onboarding knowledge telemetry", () => {
  it("records a completed document upload", async () => {
    vi.stubGlobal("crypto", { subtle: { digest: async () => new ArrayBuffer(32) }, randomUUID: () => "entry" });
    const fetchMock = setup();
    fireEvent.change(document.getElementById("onboarding-knowledge-file")!, { target: { files: [new File(["hours"], "hours.txt", { type: "text/plain" })] } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/uploads" && (init as RequestInit | undefined)?.method === "POST")).toBe(true));
    telemetryRef.current!.expectEvent("web.onboarding.knowledge_uploaded", { businessId: "business" });
  });

  it("records the skip when the operator advances without knowledge", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "knowledge.skip" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding/greeting"));
    telemetryRef.current!.expectEvent("web.onboarding.knowledge_skipped", { businessId: "business" });
  });
});
