// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const fixture = vi.hoisted(() => ({
  partner: { partnerId: "partner", name: "Bright Desk", role: "admin" as "owner" | "admin" | "member" },
  telemetry: null as ReturnType<typeof createRecordedBrowserTelemetry> | null,
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/partner/partner/businesses" }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => fixture.telemetry!.telemetry }));
vi.mock("sonner", () => ({ toast: fixture.toast }));

import { PartnerBusinessesSurface } from "./partner-businesses-surface";

const harbor = { businessId: "harbor", name: "Harbor Dental", accessLevel: "full", onboardingStage: "website", createdAt: "2026-10-20T12:00:00.000Z", owner: { email: "owner@harbor.test", status: "joined" } };
const pier = { businessId: "pier", name: "Pier Clinic", accessLevel: "activity", onboardingStage: "verify_phone", createdAt: "2026-10-21T12:00:00.000Z", owner: { email: "owner@pier.test", status: "invited", expiresAt: "2099-01-01T00:00:00.000Z" } };

beforeEach(() => { fixture.telemetry = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function renderAs(role: "owner" | "admin" | "member", respond: (url: string, init?: RequestInit) => Response) {
  fixture.partner = { ...fixture.partner, role };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => respond(url, init));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PartnerBusinessesSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("the partner console's Businesses page", () => {
  it("lists each business with its owner and access level for anyone on the team, and lets only owners and admins create one", async () => {
    const fetchMock = renderAs("member", () => Response.json({ businesses: [harbor, pier] }));
    const rows = await screen.findAllByRole("row");
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/businesses?partnerId=partner", expect.anything());
    expect(within(rows[1]!).getByText("Harbor Dental")).toBeTruthy();
    expect(within(rows[1]!).getByText("owner@harbor.test")).toBeTruthy();
    expect(within(rows[1]!).getByText("businesses.access.full")).toBeTruthy();
    expect(within(rows[2]!).getByText("businesses.owner.invited")).toBeTruthy();
    expect(within(rows[2]!).getByText("businesses.access.activity")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "businesses.create.action" })).toBeNull();
  });

  it("tells a member who sees no businesses that owners and admins create them", async () => {
    renderAs("member", () => Response.json({ businesses: [] }));
    expect(await screen.findByText("businesses.empty.memberDescription")).toBeTruthy();
  });

  it("creates a business at the access level picked, invites its owner, and records web.partner.business_created", async () => {
    const businesses: unknown[] = [];
    const fetchMock = renderAs("admin", (_url, init) => {
      if (init?.method === "POST") {
        businesses.push(pier);
        return Response.json({ businessId: "pier", invitationId: "invitation", expiresAt: "2026-11-02T00:00:00.000Z" }, { status: 201 });
      }
      return Response.json({ businesses });
    });
    await screen.findByText("businesses.empty.title");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.action" }));
    await userEvent.type(await screen.findByLabelText("businesses.create.nameLabel"), "Pier Clinic");
    await userEvent.type(screen.getByLabelText("businesses.create.ownerLabel"), "owner@pier.test");
    await userEvent.click(screen.getByRole("radio", { name: /businesses\.access\.activity/ }));
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.submit" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.business_created", { partnerId: "partner", businessId: "pier", accessLevel: "activity", pathname: "/partner/partner/businesses" }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/partner/businesses");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ partnerId: "partner", name: "Pier Clinic", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", accessLevel: "activity", ownerEmail: "owner@pier.test" });
    expect(fixture.toast.success).toHaveBeenCalledWith("businesses.create.created");
    expect(await screen.findByText("Pier Clinic")).toBeTruthy();
  });

  it("says why a business wasn't created, and records nothing", async () => {
    renderAs("owner", (_url, init) => init?.method === "POST"
      ? Response.json({ error: "You need your own domain before you can create a business.", code: "partner_domain_required" }, { status: 409 })
      : Response.json({ businesses: [] }));
    await screen.findByText("businesses.empty.title");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.action" }));
    await userEvent.type(await screen.findByLabelText("businesses.create.nameLabel"), "Harbor Dental");
    await userEvent.type(screen.getByLabelText("businesses.create.ownerLabel"), "owner@harbor.test");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.submit" }));
    expect((await screen.findByRole("alert")).textContent).toBe("businesses.create.errors.domainRequired");
    expect(fixture.telemetry!.events).toEqual([]);
  });
});
