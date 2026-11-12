// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingAttributionSurface } from "./onboarding-attribution-surface";
import { OnboardingBusinessSurface } from "./onboarding-business-surface";
import { OnboardingLanguageSurface } from "./onboarding-language-surface";
import { OnboardingReadingSurface } from "./onboarding-reading-surface";
import { OnboardingMeetSurface } from "./onboarding-meet-surface";
import { OnboardingNumberSurface } from "./onboarding-number-surface";
import { OnboardingVerifyPhoneSurface } from "./onboarding-verify-phone-surface";
import { OnboardingWebsiteSurface } from "./onboarding-website-surface";
import OnboardingBrandLoading from "../../app/(onboarding)/onboarding/brand/loading";

vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => ({ track: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
vi.mock("@/components/test-window", () => ({ TestPanel: () => <p>test panel</p> }));
vi.mock("@/components/live-upgrade-plan-provider", () => ({ LiveUpgradePlanProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("./onboarding-plan-surface", () => ({ OnboardingPlanSurface: () => <div>plans</div> }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Every request stays pending, so each step shows what it renders before its data arrives. */
function renderLoading(surface: React.ReactElement, withBusiness = false) {
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (withBusiness) client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Test", role: "business_owner", active: true, onboardingStage: "attribution" }] });
  return render(<QueryClientProvider client={client}>{surface}</QueryClientProvider>);
}

describe("onboarding steps while they load", () => {
  it("holds the brand form's fields, preview and actions until the server says what the step asks", () => {
    const { container } = render(<OnboardingBrandLoading />);
    const busy = container.querySelector("[aria-busy='true']")!;
    expect(busy).toBeTruthy();
    for (const key of ["brand.nameLabel", "brand.nameHint", "brand.logoLabel", "brand.logoChoose", "brand.logoHint", "brand.preview"]) expect(busy.textContent).toContain(key);
    expect(screen.getByText("brand.continue").closest("[data-slot='skeleton']")).toBeTruthy();
    expect(screen.getByText("brand.skip").closest("[data-slot='skeleton']")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(busy.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThanOrEqual(6);
  });

  it("replaces the business name input with a placeholder under its label", () => {
    renderLoading(<OnboardingBusinessSurface />);
    expect(screen.getByText("businessName.label")).toBeTruthy();
    // The input stays mounted under the skeleton, so a name typed before hydration is kept.
    expect(document.querySelector("[aria-busy='true'] [data-slot='skeleton']")).toBeTruthy();
  });

  it("replaces the website input with a placeholder under its label", () => {
    renderLoading(<OnboardingWebsiteSurface />);
    expect(screen.getByText("website.label")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector("[aria-busy='true'] [data-slot='skeleton']")).toBeTruthy();
  });

  it("replaces the language dropdown with a placeholder under its label", () => {
    renderLoading(<OnboardingLanguageSurface />);
    expect(screen.getByText("language.label")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.querySelector("[aria-busy='true'] [data-slot='skeleton']")).toBeTruthy();
  });

  it("shows the chooser's controls and list as placeholders, with its real labels", () => {
    renderLoading(<OnboardingNumberSurface />);
    const busy = document.querySelector("[aria-busy='true']")!;
    expect(busy).toBeTruthy();
    // The real chooser sits in a max-w-lg column, so its placeholder does too.
    expect(busy.closest(".max-w-lg")).not.toBeNull();
    for (const text of ["number.countryLabel", "number.areaCodeLabel", "number.tableHeaders.phoneNumber"]) expect(busy.textContent).toContain(text);
    expect(screen.getByText("number.search").closest("[data-slot='skeleton']")).toBeTruthy();
    expect(busy.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(4);
    expect(document.querySelector(".animate-spin")).toBeNull();
  });

  it("shows the mobile number form as placeholders instead of a spinner", async () => {
    renderLoading(<OnboardingVerifyPhoneSurface />);
    // The country is chosen from the browser's locale once the effect runs.
    expect(document.querySelector(".animate-spin")).toBeNull();
    const busy = document.querySelector("[aria-busy='true']")!;
    expect(busy.textContent).toContain("verifyPhone.fields.mobileNumber");
    for (const text of ["verifyPhone.hint", "verifyPhone.sendCode"]) expect(screen.getByText(text).closest("[data-slot='skeleton']")).toBeTruthy();
    expect(busy.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the attribution choices' place until the saved answer arrives", () => {
    renderLoading(<OnboardingAttributionSurface />, true);
    const busy = document.querySelector("[aria-busy='true']")!;
    expect(busy.textContent).toContain("attribution.options.google");
    expect(busy.textContent).toContain("attribution.options.other");
    expect(screen.queryByRole("button", { name: "attribution.options.google" })).toBeNull();
    expect(busy.querySelectorAll("[data-slot='skeleton']")).toHaveLength(15);
  });

  it("holds the reading line and bar under the slide while the knowledge list answers", () => {
    renderLoading(<OnboardingReadingSurface documentId="document" />, true);
    const busy = document.querySelector("[aria-busy='true']")!;
    expect(busy.textContent).toContain("reading.status");
    expect(busy.querySelectorAll("[data-slot='skeleton']")).toHaveLength(2);
    expect(busy.closest("[data-slot='surface']")).toBeNull();
  });

  it("shows the test call, and each agent field, as placeholders", () => {
    renderLoading(<OnboardingMeetSurface />);
    const busy = Array.from(document.querySelectorAll("[aria-busy='true']"));
    expect(busy).toHaveLength(2);
    const form = busy.find((element) => element.textContent?.includes("meet.name"))!;
    for (const label of ["meet.name", "fields.voice.label", "meet.greeting", "meet.language"]) expect(form.textContent).toContain(label);
    expect(form.querySelectorAll("[data-slot='skeleton']")).toHaveLength(4);
    expect(screen.queryByText("test panel")).toBeNull();
  });
});
