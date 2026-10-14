// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingVerifyPhoneSurface } from "./onboarding-verify-phone-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const navigation = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));

const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); navigation.push.mockReset(); Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null }); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} }); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup(suggestedCountry: string, verifyPhone = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/businesses") return Response.json({ businesses: [{ businessId: "business", active: true }] });
    if (url.startsWith("/api/onboarding/numbers") && !init?.method) return Response.json({ countries: ["US", "CA"], trialCountries: ["US", "CA"], suggestedCountry, verifyPhone });
    if (url.startsWith("/api/onboarding/phone-verification/check")) return Response.json({ approved: true, status: "approved" });
    if (url.startsWith("/api/onboarding/phone-verification")) return Response.json({ attemptId: "attempt-1", phoneE164: "+14165550123" }, { status: 202 });
    return Response.json({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingVerifyPhoneSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("onboarding phone verification", () => {
  it("texts a code to the owner's mobile, checks it, and moves on to the number step", async () => {
    const fetchMock = setup("CA");
    await userEvent.type(await screen.findByLabelText("verifyPhone.fields.mobileNumber"), "4165550123");
    await userEvent.click(screen.getByRole("button", { name: "verifyPhone.sendCode" }));
    const start = fetchMock.mock.calls.find(([url, init]) => String(url).startsWith("/api/onboarding/phone-verification?") && init?.method === "POST");
    expect(JSON.parse(String(start?.[1]?.body))).toMatchObject({ countryCode: "CA" });
    await userEvent.type(await screen.findByRole("textbox"), "123456");
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding/number"));
    telemetryRef.current!.expectEvent("web.onboarding.phone_verified", { businessId: "business", countryCode: "CA" });
  });

  it("offers the waitlist where we don't sell numbers, and moves on without one", async () => {
    const fetchMock = setup("FR");
    await userEvent.click(await screen.findByRole("button", { name: "verifyPhone.unavailable.notify" }));
    await screen.findByText("verifyPhone.unavailable.joined");
    const joined = fetchMock.mock.calls.find(([url, init]) => String(url).startsWith("/api/onboarding/numbers") && init?.method === "POST");
    expect(JSON.parse(String(joined?.[1]?.body))).toEqual({ countryCode: "FR" });
    telemetryRef.current!.expectEvent("web.onboarding.number_waitlist_joined", { businessId: "business", countryCode: "FR" });
    await userEvent.click(screen.getByRole("button", { name: "verifyPhone.unavailable.continue" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding/attribution"));
  });

  it("sends a self-hosted install straight to the number step, since it has no free trial to guard", async () => {
    const fetchMock = setup("CA", false);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding/number"));
    const stage = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/onboarding/stage?"));
    expect(JSON.parse(String(stage?.[1]?.body))).toEqual({ to: "phone_number" });
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/onboarding/phone-verification"))).toBe(false);
  });
});
