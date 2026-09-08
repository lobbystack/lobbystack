// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingNumberSurface } from "./onboarding-number-surface";
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
beforeEach(() => { navigation.push.mockReset(); navigation.replace.mockReset(); });
function setup(stage: string, primary = false, pending = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business-1", active: true, onboardingStage: stage }] });
  client.setQueryData(["onboarding-primary-number", "business-1"], { activeClaim: pending ? { id: "claim-1", status: "provisioning" } : null, phoneNumbers: primary ? [{ id: "phone-1", e164: "+15815550102", reclaimScheduledAt: null }] : [] });
  const fetchMock = vi.fn(async (input: string) => {
    if (input.includes("/api/phone-numbers?")) return Response.json({ activeClaim: null, phoneNumbers: [{ id: "phone-1", e164: "+14165550100", reclaimScheduledAt: null }] });
    if (input.includes("/suggestion?")) return Response.json({ numbers: [{ phoneE164: "+14165550100", countryCode: "CA", claimToken: "signed-offer", capabilities: { sms: true, voice: true } }] });
    if (input.includes("/claim?")) return Response.json({ claimId: "claim-1" });
    if (input.includes("/claim/claim-1?")) return Response.json({ claim: { status: "claimed", requestedE164: "+14165550100", phoneNumberId: "phone-1" } });
    if (input.includes("/skip?")) return Response.json({ ok: true });
    throw new Error(`Unexpected request: ${input}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingNumberSurface /></QueryClientProvider>);
  return fetchMock;
}
describe("onboarding number API adapter", () => {
  it("resumes a provisioning claim after reload without allowing another purchase or skip", async () => {
    const fetchMock = setup("phone_number", false, true);
    expect(screen.queryByRole("button", { name: "number.select" })).toBeNull();
    expect(screen.queryByRole("button", { name: "number.skipLater" })).toBeNull();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/onboarding/attribution"), { timeout: 2500 });
    expect(fetchMock.mock.calls.every(([url]) => url.includes("/api/phone-numbers?"))).toBe(true);
  });
  it("moves a fresh claim forward before onboarding progress catches up", async () => {
    const fetchMock = setup("phone_number", true);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/onboarding/attribution"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("shows the original selected-number review when revisiting attribution", async () => {
    const fetchMock = setup("attribution", true);
    expect(screen.getByText("(581) 555-0102")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "number.continue" }));
    expect(navigation.push).toHaveBeenCalledWith("/onboarding/attribution");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["attribution", "complete"])("claims a number from %s without exposing another skip to completed users", async stage => {
    const fetchMock = setup(stage);
    await userEvent.click(await screen.findByRole("button", { name: "number.select" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(stage === "complete" ? "/settings/phone-number" : "/onboarding/attribution"));
    const claimRequest = fetchMock.mock.calls.find(([url]) => url.includes("/claim?"));
    expect(claimRequest).toBeTruthy();
    expect(screen.queryByRole("button", { name: "number.skipLater" }) !== null).toBe(stage !== "complete");
  });
});
