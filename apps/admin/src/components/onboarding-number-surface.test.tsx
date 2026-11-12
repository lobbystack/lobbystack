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
function setup(stage: string, primary = false, pending = false, suggestion?: () => Response, trialRefusal: string | null = null, suggestedCountry: string | null = "CA", numberRequired = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business-1", active: true, onboardingStage: stage }] });
  client.setQueryData(["onboarding-primary-number", "business-1"], { activeClaim: pending ? { id: "claim-1", status: "provisioning" } : null, phoneNumbers: primary ? [{ id: "phone-1", e164: "+15815550102", reclaimScheduledAt: null }] : [] });
  client.setQueryData(["onboarding-number-countries", "business-1"], { countries: ["US", "CA"], trialCountries: ["US", "CA"], suggestedCountry, verifyPhone: false, trialRefusal, verifiedPhone: null, numberRequired });
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
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/onboarding/attribution"), { timeout: 2500 });
    expect(fetchMock.mock.calls.every(([url]) => url.includes("/api/phone-numbers?"))).toBe(true);
  });
  it("moves straight on to attribution once the business has a number", async () => {
    const fetchMock = setup("phone_number", true);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/onboarding/attribution"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns to attribution when revisiting with a number", async () => {
    const fetchMock = setup("attribution", true);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/onboarding/attribution"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["attribution", "meet", "complete"])("claims a number from %s", async stage => {
    const fetchMock = setup(stage);
    await userEvent.click(await screen.findByRole("button", { name: "number.select" }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith({ attribution: "/onboarding/attribution", meet: "/onboarding/meet", complete: "/" }[stage]));
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
  it("shows the paid plans before a search when the trial is already used, with no way on but a country without numbers", async () => {
    const fetchMock = setup("phone_number", false, false, undefined, "trial_already_used");
    expect(await screen.findByText("number.refusals.trialUsed")).toBeTruthy();
    expect(screen.getByText("plans")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/suggestion?"))).toBe(false);
    telemetryRef.current!.expectEvent("web.onboarding.number_unavailable", { businessId: "business-1", code: "trial_already_used" });
    expect(screen.queryByRole("button", { name: "number.skipLater" })).toBeNull();
    // The way on without a number waits for a country we sell none in.
    expect(screen.queryByRole("button", { name: "number.country.continue" })).toBeNull();
  });
  it("offers no skip to a cloud owner during onboarding", async () => {
    setup("phone_number");
    expect(await screen.findByRole("button", { name: "number.select" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "number.skipLater" })).toBeNull();
    expect(screen.queryByRole("button", { name: "number.country.continue" })).toBeNull();
  });
  it("keeps the skip at a self-hosted install, which has no trial to guard", async () => {
    const fetchMock = setup("phone_number", false, false, undefined, null, "CA", false);
    await userEvent.click(await screen.findByRole("button", { name: "number.skipLater" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("/skip?"))).toBe(true));
    expect(navigation.push).toHaveBeenCalledWith("/onboarding/attribution");
  });
  it("opens the way on without a number at the start where the time zone points to a country without numbers, with that country chosen", async () => {
    setup("phone_number", false, false, undefined, null, "RS");
    expect(await screen.findByRole("button", { name: "number.country.continue" })).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "number.country.label" }) as HTMLInputElement).value).toBe("Serbia");
    expect(screen.queryByRole("button", { name: "number.select" })).toBeNull();
    // Back to the numbers stays back: the time zone doesn't reopen the way on.
    await userEvent.click(screen.getByRole("button", { name: "number.country.back" }));
    expect(await screen.findByRole("button", { name: "number.select" })).toBeTruthy();
  });

  it("starts the plans' country on the time zone's country, or on none", async () => {
    setup("phone_number", false, false, undefined, "trial_already_used", "US");
    const field = await screen.findByRole("combobox", { name: "number.country.label" }) as HTMLInputElement;
    expect(field.value).toBe("United States");
    cleanup();
    setup("phone_number", false, false, undefined, "trial_already_used", null);
    const empty = await screen.findByRole("combobox", { name: "number.country.label" }) as HTMLInputElement;
    // No country rather than the first one we sell numbers in.
    expect(empty.value).toBe("");
    expect(empty.placeholder).toBe("number.country.placeholder");
  });

  it("filters the countries as the owner types in the field itself", async () => {
    setup("phone_number", false, false, undefined, "trial_already_used", null);
    const field = await screen.findByRole("combobox", { name: "number.country.label" });
    await userEvent.type(field, "381");
    expect(await screen.findByRole("option", { name: /Serbia/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Canada/ })).toBeNull();
    await userEvent.click(screen.getByRole("option", { name: /Serbia/ }));
    expect(await screen.findByRole("button", { name: "number.country.continue" })).toBeTruthy();
  });
  it("opens the way on without a number once the owner picks a country we sell none in, beside the paid plans", async () => {
    const fetchMock = setup("phone_number", false, false, undefined, "trial_already_used");
    const country = await screen.findByRole("combobox", { name: "number.country.label" });
    // A country we sell numbers in keeps the owner on the plans.
    await userEvent.click(country);
    await userEvent.click(await screen.findByRole("option", { name: /Canada/ }));
    expect(screen.queryByRole("button", { name: "number.country.continue" })).toBeNull();
    await userEvent.click(country);
    await userEvent.click(await screen.findByRole("option", { name: /France/ }));
    await userEvent.click(await screen.findByRole("button", { name: "number.country.notify" }));
    await screen.findByText("number.country.joined");
    const joined = fetchMock.mock.calls.find(([url]) => url.includes("/api/onboarding/numbers?"));
    expect(JSON.parse(String((joined as unknown as [string, RequestInit])[1].body))).toEqual({ countryCode: "FR" });
    telemetryRef.current!.expectEvent("web.onboarding.number_waitlist_joined", { businessId: "business-1", countryCode: "FR" });
    await userEvent.click(screen.getByRole("button", { name: "number.country.continue" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding/attribution"));
    const skipped = fetchMock.mock.calls.find(([url]) => url.includes("/skip?"));
    expect(JSON.parse(String((skipped as unknown as [string, RequestInit])[1].body))).toEqual({ countryCode: "FR" });
    telemetryRef.current!.expectEvent("web.onboarding.number_skipped", { businessId: "business-1", countryCode: "FR" });
  });
  it("lists only countries we sell no numbers in once the owner picks Other country, and goes back to the picker", async () => {
    setup("phone_number");
    await userEvent.click(await screen.findByRole("combobox", { name: "number.countryLabel" }));
    await userEvent.click(await screen.findByRole("option", { name: "number.country.other" }));
    const country = await screen.findByRole("combobox", { name: "number.country.label" });
    expect(screen.queryByRole("button", { name: "number.country.continue" })).toBeNull();
    await userEvent.click(country);
    await screen.findByRole("option", { name: /France/ });
    expect(screen.queryByRole("option", { name: /Canada/ })).toBeNull();
    await userEvent.keyboard("{Escape}");
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
