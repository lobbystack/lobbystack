// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingNumberSurface } from "./onboarding-number-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("./onboarding-plan-surface", () => ({ OnboardingPlanSurface: () => <div>plans</div> }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); navigation.push.mockReset(); navigation.replace.mockReset(); });
function setup(stage: string, primary = false, pending = false, suggestion?: () => Response, trialRefusal: string | null = null, suggestedCountry = "CA") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business-1", active: true, onboardingStage: stage }] });
  client.setQueryData(["onboarding-primary-number", "business-1"], { activeClaim: pending ? { id: "claim-1", status: "provisioning" } : null, phoneNumbers: primary ? [{ id: "phone-1", e164: "+15815550102", reclaimScheduledAt: null }] : [] });
  client.setQueryData(["onboarding-number-countries", "business-1"], { countries: ["US", "CA"], trialCountries: ["US", "CA"], suggestedCountry, verifyPhone: false, trialRefusal, verifiedPhone: null });
  const fetchMock = vi.fn(async (input: string) => {
    if (input.includes("/api/phone-numbers?")) return Response.json({ activeClaim: null, phoneNumbers: [{ id: "phone-1", e164: "+14165550100", reclaimScheduledAt: null }] });
    if (input.includes("/suggestion?")) return suggestion ? suggestion() : Response.json({ numbers: [{ phoneE164: "+14165550100", countryCode: "CA", claimToken: "signed-offer", capabilities: { sms: true, voice: true } }] });
    if (input.includes("/claim?")) return Response.json({ claimId: "claim-1" });
    if (input.includes("/claim/claim-1?")) return Response.json({ claim: { status: "claimed", requestedE164: "+14165550100", phoneNumberId: "phone-1" } });
    if (input.includes("/skip?")) return Response.json({ ok: true });
    if (input.includes("/api/onboarding/numbers?")) return Response.json({ joined: true });
    throw new Error(`Unexpected request: ${input}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingNumberSurface /></QueryClientProvider>);
  return fetchMock;
}
describe("onboarding number API adapter", () => {
  it("resumes a provisioning claim after reload, then moves on with the new number", async () => {
    const fetchMock = setup("phone_number", false, true);
    expect(screen.queryByRole("button", { name: "number.select" })).toBeNull();
    expect(screen.queryByRole("button", { name: "number.skipLater" })).toBeNull();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/onboarding/goal"), { timeout: 2500 });
    expect(fetchMock.mock.calls.every(([url]) => url.includes("/api/phone-numbers?"))).toBe(true);
  });
  it("moves straight on once the business has a number", async () => {
    const fetchMock = setup("phone_number", true);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/onboarding/goal"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns to attribution when revisiting with a number", async () => {
    const fetchMock = setup("attribution", true);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/onboarding/attribution"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["goal", "attribution", "meet", "complete"])("claims a number from %s", async stage => {
    const fetchMock = setup(stage);
    await userEvent.click(await screen.findByRole("button", { name: "number.select" }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith({ goal: "/onboarding/goal", attribution: "/onboarding/attribution", meet: "/onboarding/meet", complete: "/" }[stage]));
    const claimRequest = fetchMock.mock.calls.find(([url]) => url.includes("/claim?"));
    expect(claimRequest).toBeTruthy();
    const claimProperties = { businessId: "business-1", countryCode: "CA", selectionMode: "suggested", numberKind: "local" };
    telemetryRef.current!.expectEvent("web.onboarding.number_claim_started", claimProperties);
    telemetryRef.current!.expectEvent("web.onboarding.number_claim_completed", claimProperties);
  });
  it("offers a skip that returns a completed workspace to the dashboard", async () => {
    const fetchMock = setup("complete");
    await userEvent.click(await screen.findByRole("button", { name: "number.skipLater" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("/skip?"))).toBe(true));
    expect(navigation.push).toHaveBeenCalledWith("/");
  });
  it("shows the plans where a number needs one", async () => {
    setup("phone_number", false, false, () => Response.json({ error: "No trial here.", code: "dedicated_number_requires_paid_plan" }, { status: 402 }));
    expect(await screen.findByText("number.refusals.paidPlan")).toBeTruthy();
    expect(screen.getByText("plans")).toBeTruthy();
    telemetryRef.current!.expectEvent("web.onboarding.number_unavailable", { businessId: "business-1", code: "dedicated_number_requires_paid_plan" });
  });
  it("shows the plans before a search when the trial is already used, and still lets the owner continue", async () => {
    const fetchMock = setup("phone_number", false, false, undefined, "trial_already_used");
    expect(await screen.findByText("number.refusals.trialUsed")).toBeTruthy();
    expect(screen.getByText("plans")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/suggestion?"))).toBe(false);
    telemetryRef.current!.expectEvent("web.onboarding.number_unavailable", { businessId: "business-1", code: "trial_already_used" });
    await userEvent.click(screen.getByRole("button", { name: "number.skipLater" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("/skip?"))).toBe(true));
    expect(navigation.push).toHaveBeenCalledWith("/onboarding/goal");
  });
  it("opens on the country fallback where the time zone points to a country without numbers", async () => {
    const fetchMock = setup("phone_number", false, false, undefined, null, "FR");
    await userEvent.click(await screen.findByRole("button", { name: "number.country.notify" }));
    await screen.findByText("number.country.joined");
    const joined = fetchMock.mock.calls.find(([url]) => url.includes("/api/onboarding/numbers?"));
    expect(JSON.parse(String((joined as unknown as [string, RequestInit])[1].body))).toEqual({ countryCode: "FR" });
    telemetryRef.current!.expectEvent("web.onboarding.number_waitlist_joined", { businessId: "business-1", countryCode: "FR" });
    await userEvent.click(screen.getByRole("button", { name: "number.country.continue" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding/goal"));
    const skipped = fetchMock.mock.calls.find(([url]) => url.includes("/skip?"));
    expect(JSON.parse(String((skipped as unknown as [string, RequestInit])[1].body))).toEqual({ countryCode: "FR" });
    telemetryRef.current!.expectEvent("web.onboarding.number_skipped", { businessId: "business-1", countryCode: "FR" });
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/suggestion?"))).toBe(false);
  });
  it("opens the country fallback from the picker, and goes back to it", async () => {
    setup("phone_number");
    await userEvent.click(await screen.findByRole("button", { name: "number.country.notListed" }));
    expect(await screen.findByRole("button", { name: "number.country.continue" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "number.country.back" }));
    expect(await screen.findByRole("button", { name: "number.select" })).toBeTruthy();
  });
  it("names an unverified email the search refuses", async () => {
    setup("phone_number", false, false, () => Response.json({ error: "Verify your email.", code: "email_verification_required" }, { status: 409 }));
    expect(await screen.findByText("number.refusals.emailVerification")).toBeTruthy();
    telemetryRef.current!.expectEvent("web.onboarding.number_unavailable", { businessId: "business-1", code: "email_verification_required" });
  });
  it("names the network limit, and the market without a trial", async () => {
    setup("phone_number", false, false, undefined, "trial_ip_limited");
    expect(await screen.findByText("number.refusals.network")).toBeTruthy();
    cleanup();
    setup("phone_number", false, false, undefined, "dedicated_number_requires_paid_plan");
    expect(await screen.findByText("number.refusals.paidPlan")).toBeTruthy();
  });
});
