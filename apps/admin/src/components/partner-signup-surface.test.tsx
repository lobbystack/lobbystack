// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const fixture = vi.hoisted(() => ({
  telemetry: null as ReturnType<typeof createRecordedBrowserTelemetry> | null,
  router: { replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/partner/signup", useRouter: () => fixture.router }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => fixture.telemetry!.telemetry }));
vi.mock("@/components/replacement-onboarding-shell", () => ({ ReplacementOnboardingShell: ({ children, title }: { children: React.ReactNode; title: string }) => <main><h1>{title}</h1>{children}</main> }));
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => vi.fn() }));

import { PartnerSignupSurface } from "./partner-signup-surface";

beforeEach(() => { fixture.telemetry = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function renderSignup(props: Partial<React.ComponentProps<typeof PartnerSignupSurface>>, response: () => Response) {
  const fetchMock = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <PartnerSignupSurface baseDomain={null} blocked={null} invitation={null} invitedEmail={null} returnTo="/partner/signup" {...props} />
    </QueryClientProvider>,
  );
  return fetchMock;
}

describe("partner signup", () => {
  it("records web.partner.signup_succeeded and opens the new partner's console", async () => {
    const fetchMock = renderSignup({ baseDomain: "portal.example.test", invitation: "token" }, () => Response.json({ partnerId: "partner", slug: "bright-desk", subdomain: "bright-desk.portal.example.test" }, { status: 201 }));
    await userEvent.type(screen.getByLabelText("signup.nameLabel"), "Bright Desk");
    // The address follows the name until someone edits it.
    expect((screen.getByLabelText("signup.subdomainLabel") as HTMLInputElement).value).toBe("bright-desk");
    await userEvent.click(screen.getByRole("button", { name: "signup.submit" }));
    await waitFor(() => expect(fixture.router.replace).toHaveBeenCalledWith("/partner/partner/businesses"));
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/signup", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Bright Desk", subdomain: "bright-desk", invitation: "token" }) }));
    fixture.telemetry!.expectEvent("web.partner.signup_succeeded", { partnerId: "partner", pathname: "/partner/signup", invited: true, subdomain: true });
  });

  it("records the event without an invitation or a subdomain when the deployment has neither", async () => {
    renderSignup({}, () => Response.json({ partnerId: "partner", slug: "bright-desk", subdomain: null }, { status: 201 }));
    await userEvent.type(screen.getByLabelText("signup.nameLabel"), "Bright Desk");
    expect(screen.queryByLabelText("signup.subdomainLabel")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "signup.submit" }));
    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.signup_succeeded", { partnerId: "partner", invited: false, subdomain: false }));
  });

  it("records nothing when signup is refused, and says why", async () => {
    renderSignup({ baseDomain: "portal.example.test" }, () => Response.json({ error: "That subdomain is taken.", code: "subdomain_taken" }, { status: 409 }));
    await userEvent.type(screen.getByLabelText("signup.nameLabel"), "Bright Desk");
    await userEvent.click(screen.getByRole("button", { name: "signup.submit" }));
    expect((await screen.findByRole("alert")).textContent).toBe("signup.errors.subdomainTaken");
    expect(fixture.telemetry!.events).toEqual([]);
    expect(fixture.router.replace).not.toHaveBeenCalled();
  });
});
