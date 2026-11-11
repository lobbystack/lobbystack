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

function setup(suggestedCountry: string, verifyPhone: boolean, partnerAccessLevel: "full" | "activity") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  const businesses = [{ businessId: "business", active: true, partnerAccessLevel }];
  client.setQueryData(["businesses"], { businesses });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/businesses") return Response.json({ businesses });
    if (url.startsWith("/api/onboarding/numbers") && !init?.method) return Response.json({ countries: ["US", "CA"], trialCountries: ["US", "CA"], suggestedCountry, verifyPhone });
    if (url.startsWith("/api/onboarding/phone-verification/check")) return Response.json({ approved: true, status: "approved" });
    if (url.startsWith("/api/onboarding/phone-verification")) return Response.json({ attemptId: "attempt-1", phoneE164: "+14165550123" }, { status: 202 });
    return Response.json({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingVerifyPhoneSurface /></QueryClientProvider>);
  return fetchMock;
}

// Only a partner's owner has the phone step: a direct owner goes from the website to the number.
describe("onboarding phone verification", () => {
  describe("at a partner's business", () => {
    it("goes on to Meet your agent once the phone is verified, with no number step", async () => {
      setup("CA", true, "full");
      await userEvent.type(await screen.findByLabelText("verifyPhone.fields.mobileNumber"), "4165550123");
      await userEvent.click(screen.getByRole("button", { name: "verifyPhone.sendCode" }));
      await userEvent.type(await screen.findByRole("textbox"), "123456");
      await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding/meet"));
      expect(navigation.push).not.toHaveBeenCalledWith("/onboarding/number");
    });

    it("offers no waitlist where phones can't be verified, and finishes without one", async () => {
      const fetchMock = setup("FR", true, "activity");
      await screen.findByText("verifyPhone.unavailable.partnerTitle");
      expect(screen.queryByRole("button", { name: "verifyPhone.unavailable.notify" })).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "verifyPhone.unavailable.partnerContinue" }));
      await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/"));
      const stage = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/onboarding/stage?"));
      expect(JSON.parse(String(stage?.[1]?.body))).toEqual({ to: "complete" });
    });

    it("passes straight on at a self-hosted install, which verifies no phones", async () => {
      const fetchMock = setup("CA", false, "full");
      await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding/meet"));
      const stage = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/onboarding/stage?"));
      expect(JSON.parse(String(stage?.[1]?.body))).toEqual({ to: "meet" });
    });
  });
});
