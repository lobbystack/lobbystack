// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ capabilities: ["activity", "setup", "team"] as string[] }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ businesses: { isLoading: false }, business: { businessId: "harbor", role: "business_owner" } }) }));
vi.mock("./business-capabilities-provider", () => ({ useBusinessCan: () => (capability: string) => fixture.capabilities.includes(capability) }));
vi.mock("./upgrade-plan-dialog-context", () => ({ useOpenUpgradePlanDialog: () => vi.fn() }));
vi.mock("@/lib/number-step", () => ({ useOpenNumberStep: () => vi.fn() }));
vi.mock("./phone-number-chooser", () => ({ PhoneNumberChooser: () => <p>number chooser</p>, phoneNumberChooserApi: () => ({}) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { LivePhoneNumberSettingsSurface } from "./live-phone-number-settings-surface";

beforeEach(() => { Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null }); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Serves the business's numbers, then `afterVerifying` once the phone step approved a code, and records every path the page asks for. */
function renderWith(numbers: Record<string, unknown>, afterVerifying?: Record<string, unknown>) {
  const paths: string[] = [];
  let verified = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.split("?")[0]!;
    paths.push(init?.method === "POST" ? `POST ${path}` : path);
    if (path === "/api/phone-numbers") return Response.json({ phoneNumbers: [], activeClaim: null, replacement: { usedAt: null, activeClaim: null }, ...(verified && afterVerifying ? afterVerifying : numbers) });
    if (path === "/api/onboarding/numbers") return Response.json({ countries: ["US", "CA", "AU"], trialCountries: ["US", "CA"], suggestedCountry: "CA", verifyPhone: true });
    if (path === "/api/onboarding/phone-verification") return Response.json({ attemptId: "attempt-1", phoneE164: "+14165550123" }, { status: 202 });
    if (path === "/api/onboarding/phone-verification/check") { verified = true; return Response.json({ approved: true, status: "approved" }); }
    return new Response(null, { status: 404 });
  }));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LivePhoneNumberSettingsSurface /></QueryClientProvider>);
  return paths;
}

describe("a partner's business on the phone number settings", () => {
  it("gets a number when its partner's tier allows one, without the billing it doesn't have", async () => {
    const paths = renderWith({ partnerNumbers: { available: true } });
    expect(await screen.findByText("phoneNumber.current.empty")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "phoneNumber.actions.getNumber" }).hasAttribute("disabled")).toBe(false));
    expect(paths).not.toContain("/api/billing");
  });

  it("offers its partner's 14-day trial number through the same chooser, without the host's plans", async () => {
    const paths = renderWith({ partnerNumbers: { available: true, trial: true } });
    expect(await screen.findByText("phoneNumber.freeTrial.description")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "phoneNumber.actions.getNumber" }).hasAttribute("disabled")).toBe(false));
    expect(screen.queryByRole("button", { name: "phoneNumber.requiresPaidPlan.upgradeCta" })).toBeNull();
    expect(paths).not.toContain("/api/number-trial");
  });

  it("asks someone with no verified mobile in the business to verify one before they pick the partner's trial number", async () => {
    const paths = renderWith({ partnerNumbers: { available: true, trial: true, refusal: null, phoneVerified: false } }, { partnerNumbers: { available: true, trial: true, refusal: null, phoneVerified: true } });
    await waitFor(() => expect(screen.getByRole("button", { name: "phoneNumber.actions.getNumber" }).hasAttribute("disabled")).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.actions.getNumber" }));
    expect(await screen.findByText("phoneNumber.trialPhone.title")).toBeTruthy();
    expect(screen.queryByText("number chooser")).toBeNull();
    await userEvent.type(await screen.findByLabelText("phoneNumber.trialPhone.fields.mobileNumber"), "4165550123");
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.trialPhone.sendCode" }));
    await userEvent.type(await screen.findByRole("textbox"), "123456");
    expect(await screen.findByText("number chooser")).toBeTruthy();
    expect(paths).toEqual(expect.arrayContaining(["POST /api/onboarding/phone-verification", "POST /api/onboarding/phone-verification/check"]));
  });

  it("goes straight to the chooser for someone whose mobile is verified in the business", async () => {
    const paths = renderWith({ partnerNumbers: { available: true, trial: true, refusal: null, phoneVerified: true } });
    await waitFor(() => expect(screen.getByRole("button", { name: "phoneNumber.actions.getNumber" }).hasAttribute("disabled")).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: "phoneNumber.actions.getNumber" }));
    expect(await screen.findByText("number chooser")).toBeTruthy();
    expect(paths).not.toContain("/api/onboarding/numbers");
  });

  it("says its partner needs a paid tier when the tier allows no more, and offers no plan of its own", async () => {
    renderWith({ partnerNumbers: { available: false, trial: false, refusal: "partner_number_limit_reached" } });
    expect(await screen.findByText("phoneNumber.partnerTierRequired.description")).toBeTruthy();
    expect(screen.queryByText("phoneNumber.requiresPaidPlan.description")).toBeNull();
    expect(screen.getByRole("button", { name: "phoneNumber.actions.getNumber" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "phoneNumber.requiresPaidPlan.upgradeCta" })).toBeNull();
  });

  it("says numbers aren't available yet where no paid tier would help, as on the cloud without tier billing", async () => {
    renderWith({ partnerNumbers: { available: false, trial: false, refusal: "partner_numbers_unavailable" } });
    expect(await screen.findByText("phoneNumber.partnerNumbersUnavailable.description")).toBeTruthy();
    expect(screen.queryByText("phoneNumber.partnerTierRequired.description")).toBeNull();
    expect(screen.getByRole("button", { name: "phoneNumber.actions.getNumber" }).hasAttribute("disabled")).toBe(true);
  });
});
