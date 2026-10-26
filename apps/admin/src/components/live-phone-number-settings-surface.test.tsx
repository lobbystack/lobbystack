// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ capabilities: ["activity", "setup", "team"] as string[] }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ business: { businessId: "harbor", role: "business_owner" } }) }));
vi.mock("./business-capabilities-provider", () => ({ useBusinessCan: () => (capability: string) => fixture.capabilities.includes(capability) }));
vi.mock("./upgrade-plan-dialog-context", () => ({ useOpenUpgradePlanDialog: () => vi.fn() }));
vi.mock("@/lib/number-step", () => ({ useOpenNumberStep: () => vi.fn() }));
vi.mock("./phone-number-chooser", () => ({ PhoneNumberChooser: () => null, phoneNumberChooserApi: () => ({}) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { LivePhoneNumberSettingsSurface } from "./live-phone-number-settings-surface";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Serves the business's numbers, and records every path the page asks for. */
function renderWith(numbers: Record<string, unknown>) {
  const paths: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = url.split("?")[0]!;
    paths.push(path);
    return path === "/api/phone-numbers" ? Response.json({ phoneNumbers: [], activeClaim: null, replacement: { usedAt: null, activeClaim: null }, ...numbers }) : new Response(null, { status: 404 });
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

  it("says its partner needs a paid tier when the tier allows no more, and offers no plan of its own", async () => {
    renderWith({ partnerNumbers: { available: false } });
    expect(await screen.findByText("phoneNumber.partnerTierRequired.description")).toBeTruthy();
    expect(screen.queryByText("phoneNumber.requiresPaidPlan.description")).toBeNull();
    expect(screen.getByRole("button", { name: "phoneNumber.actions.getNumber" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "phoneNumber.requiresPaidPlan.upgradeCta" })).toBeNull();
  });
});
