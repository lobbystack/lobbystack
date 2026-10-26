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
  packages: { stripe: { configured: false }, packages: [] as unknown[] },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/partner/partner/businesses" }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => fixture.telemetry!.telemetry }));
vi.mock("sonner", () => ({ toast: fixture.toast }));

import { PartnerBusinessesSurface } from "./partner-businesses-surface";

const harbor = { businessId: "harbor", name: "Harbor Dental", accessLevel: "full", onboardingStage: "website", createdAt: "2026-10-20T12:00:00.000Z", owner: { email: "owner@harbor.test", status: "joined" }, usage: { periodKey: "2026-10", voiceSeconds: 750, chats: 1234 } };
const noOverage = { enabled: false, currency: "CAD", voiceMinuteRateMinor: 0, chatRateMinor: 0, capMinor: null };
const pier = { businessId: "pier", name: "Pier Clinic", accessLevel: "activity", onboardingStage: "verify_phone", createdAt: "2026-10-21T12:00:00.000Z", owner: { email: "owner@pier.test", status: "invited", expiresAt: "2099-01-01T00:00:00.000Z" }, usage: { periodKey: "2026-10", voiceSeconds: 0, chats: 0 } };

beforeEach(() => {
  fixture.telemetry = createRecordedBrowserTelemetry();
  fixture.packages = { stripe: { configured: false }, packages: [] };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function renderAs(role: "owner" | "admin" | "member", respond: (url: string, init?: RequestInit) => Response) {
  fixture.partner = { ...fixture.partner, role };
  // Owners and admins also read the packages they can sell.
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => url.startsWith("/api/partner/packages") ? Response.json(fixture.packages) : respond(url, init));
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
    // Session replay masks each business's name and its owner's email.
    expect(within(rows[1]!).getByText("Harbor Dental").className).toContain("ph-mask");
    expect(within(rows[1]!).getByText("owner@harbor.test").className).toContain("ph-mask");
    expect(within(rows[1]!).getByText("businesses.access.full")).toBeTruthy();
    expect(within(rows[2]!).getByText("businesses.owner.invited")).toBeTruthy();
    expect(within(rows[2]!).getByText("businesses.access.activity")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "businesses.create.action" })).toBeNull();
  });

  it("shows each business's minutes and chats this month", async () => {
    renderAs("member", () => Response.json({ businesses: [harbor, pier] }));
    const rows = await screen.findAllByRole("row");
    expect(within(rows[0]!).getByText("businesses.table.minutes")).toBeTruthy();
    expect(within(rows[0]!).getByText("businesses.table.chats")).toBeTruthy();
    expect(within(rows[1]!).getByText("12.5")).toBeTruthy();
    expect(within(rows[1]!).getByText("1,234")).toBeTruthy();
    expect(within(rows[2]!).getAllByText("0")).toHaveLength(2);
  });

  it("lets only owners and admins release or delete a business", async () => {
    renderAs("member", () => Response.json({ businesses: [harbor, pier] }));
    await screen.findAllByRole("button", { name: "businesses.open.label" });
    expect(screen.queryAllByRole("button", { name: "businesses.actions.more" })).toEqual([]);
  });

  it("releases a business to the owner who joined once the admin confirms, and records web.partner.business_released", async () => {
    let businesses = [harbor, pier];
    const fetchMock = renderAs("admin", (url, init) => {
      if (init?.method === "POST" && url === "/api/partner/businesses/release") {
        businesses = [pier];
        return Response.json({ ok: true });
      }
      return Response.json({ businesses });
    });
    const [harborActions, pierActions] = await screen.findAllByRole("button", { name: "businesses.actions.more" });
    // An owner who hasn't accepted the invitation can't take the business over yet.
    await userEvent.click(pierActions!);
    expect((await screen.findByRole("menuitem", { name: "businesses.release.action" })).getAttribute("aria-disabled")).toBe("true");
    await userEvent.keyboard("{Escape}");

    await userEvent.click(harborActions!);
    await userEvent.click(await screen.findByRole("menuitem", { name: "businesses.release.action" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("businesses.release.description")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/partner/businesses/release")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "businesses.release.confirm" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.business_released", { partnerId: "partner", businessId: "harbor", pathname: "/partner/partner/businesses" }));
    const post = fetchMock.mock.calls.find(([url]) => url === "/api/partner/businesses/release");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ partnerId: "partner", businessId: "harbor" });
    expect(fixture.toast.success).toHaveBeenCalledWith("businesses.release.released");
    await waitFor(() => expect(screen.queryByText("Harbor Dental")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("deletes a business once the owner confirms, and records web.partner.business_deleted", async () => {
    let businesses = [harbor, pier];
    const fetchMock = renderAs("owner", (url, init) => {
      if (init?.method === "DELETE" && url === "/api/partner/businesses") {
        businesses = [harbor];
        return Response.json({ ok: true });
      }
      return Response.json({ businesses });
    });
    const [, pierActions] = await screen.findAllByRole("button", { name: "businesses.actions.more" });
    await userEvent.click(pierActions!);
    await userEvent.click(await screen.findByRole("menuitem", { name: "businesses.delete.action" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "businesses.delete.confirm" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.business_deleted", { partnerId: "partner", businessId: "pier", pathname: "/partner/partner/businesses" }));
    const deleted = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(JSON.parse(String(deleted?.[1]?.body))).toEqual({ partnerId: "partner", businessId: "pier" });
    expect(fixture.toast.success).toHaveBeenCalledWith("businesses.delete.deleted");
    await waitFor(() => expect(screen.queryByText("Pier Clinic")).toBeNull());
  });

  it("says why a business wasn't deleted, keeps it, and records nothing", async () => {
    renderAs("admin", (url, init) => init?.method === "DELETE"
      ? Response.json({ error: "The business's phone number is still being set up. Try again in a few minutes.", code: "business_number_in_progress" }, { status: 409 })
      : Response.json({ businesses: [harbor] }));
    await userEvent.click(await screen.findByRole("button", { name: "businesses.actions.more" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "businesses.delete.action" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "businesses.delete.confirm" }));
    await waitFor(() => expect(fixture.toast.error).toHaveBeenCalledWith("businesses.delete.errors.numberInProgress"));
    expect(screen.getByText("Harbor Dental")).toBeTruthy();
    expect(fixture.telemetry!.events).toEqual([]);
  });

  it("says a business that pays for its package through Stripe waits for its subscription to end before it's released", async () => {
    renderAs("owner", (url, init) => init?.method === "POST" && url === "/api/partner/businesses/release"
      ? Response.json({ error: "This business pays for its package through Stripe.", code: "subscription_active" }, { status: 409 })
      : Response.json({ businesses: [harbor] }));
    await userEvent.click(await screen.findByRole("button", { name: "businesses.actions.more" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "businesses.release.action" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "businesses.release.confirm" }));
    await waitFor(() => expect(fixture.toast.error).toHaveBeenCalledWith("businesses.billing.errors.subscriptionActive"));
    expect(screen.getByText("Harbor Dental")).toBeTruthy();
    expect(fixture.telemetry!.events).toEqual([]);
  });

  it("tells a member who sees no businesses that owners and admins create them", async () => {
    renderAs("member", () => Response.json({ businesses: [] }));
    expect(await screen.findByText("businesses.empty.memberDescription")).toBeTruthy();
  });

  it("tells owners and admins, above the businesses, that the partner's businesses are paused", async () => {
    const lifecycle = { state: "paused", tierEndedAt: "2026-09-01T12:00:00.000Z", pausesAt: "2026-10-01T12:00:00.000Z", deletesAt: "2026-11-30T12:00:00.000Z" };
    for (const role of ["owner", "admin"] as const) {
      renderAs(role, (url) => url.startsWith("/api/partner/lifecycle") ? Response.json(lifecycle) : Response.json({ businesses: [harbor] }));
      expect(await screen.findByText("lifecycle.paused.title")).toBeTruthy();
      expect(screen.getByText(`lifecycle.paused.${role}`)).toBeTruthy();
      expect(screen.getByText("Harbor Dental")).toBeTruthy();
      cleanup();
    }
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
    // Without Stripe Connect, the business is billed outside LobbyStack.
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ partnerId: "partner", name: "Pier Clinic", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", accessLevel: "activity", ownerEmail: "owner@pier.test", packageId: null });
    expect(screen.queryByLabelText("businesses.create.billingLabel")).toBeNull();
    expect(fixture.toast.success).toHaveBeenCalledWith("businesses.create.created");
    expect(await screen.findByText("Pier Clinic")).toBeTruthy();
  });

  it("opens a business for anyone on the team, records web.partner.business_opened, and goes to its dashboard on the partner's domain", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const fetchMock = renderAs("member", (url, init) => init?.method === "POST" && url === "/api/partner/businesses/open"
      ? Response.json({ expiresAt: "2026-10-26T20:00:00.000Z", url: "https://bright.portal.example.test/" })
      : Response.json({ businesses: [harbor, pier] }));
    const [openHarbor] = await screen.findAllByRole("button", { name: "businesses.open.label" });
    await userEvent.click(openHarbor!);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://bright.portal.example.test/"));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ partnerId: "partner", businessId: "harbor" });
    fixture.telemetry!.expectEvent("web.partner.business_opened", { partnerId: "partner", businessId: "harbor", pathname: "/partner/partner/businesses" });
  });

  it("says when a business didn't open, and records nothing", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    renderAs("admin", (url, init) => init?.method === "POST" && url === "/api/partner/businesses/open"
      ? Response.json({ error: "Business not found.", code: "business_not_found" }, { status: 404 })
      : Response.json({ businesses: [pier] }));
    await userEvent.click(await screen.findByRole("button", { name: "businesses.open.label" }));
    await waitFor(() => expect(fixture.toast.error).toHaveBeenCalledWith("businesses.open.failed"));
    expect(assign).not.toHaveBeenCalled();
    expect(fixture.telemetry!.events).toEqual([]);
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

  it("starts a business from the template the admin picks, and says when the template couldn't set it up", async () => {
    const dental = { templateId: "dental", name: "Dental clinic", createdAt: "2026-10-20T12:00:00.000Z", template: { business: { name: "Harbor Dental", timezone: "America/Toronto" } } };
    let posts = 0;
    const fetchMock = renderAs("admin", (url, init) => {
      if (init?.method === "POST") {
        posts += 1;
        return posts === 1
          ? Response.json({ error: "The template couldn't set up the business, so it wasn't created.", code: "template_failed" }, { status: 409 })
          : Response.json({ businessId: "pier", invitationId: "invitation", expiresAt: "2026-11-02T00:00:00.000Z" }, { status: 201 });
      }
      return url.startsWith("/api/partner/templates") ? Response.json({ templates: [dental] }) : Response.json({ businesses: [] });
    });
    await screen.findByText("businesses.empty.title");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.action" }));
    await userEvent.type(await screen.findByLabelText("businesses.create.nameLabel"), "Pier Clinic");
    await userEvent.type(screen.getByLabelText("businesses.create.ownerLabel"), "owner@pier.test");
    await userEvent.click(await screen.findByRole("combobox", { name: "businesses.create.templateLabel" }));
    await userEvent.click(await screen.findByRole("option", { name: "Dental clinic" }));
    expect(screen.getByText("businesses.create.templateHelp")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.submit" }));
    expect((await screen.findByRole("alert")).textContent).toBe("businesses.create.errors.templateFailed");
    expect(fixture.telemetry!.events).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "businesses.create.submit" }));
    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.business_created", { partnerId: "partner", businessId: "pier", accessLevel: "full", pathname: "/partner/partner/businesses" }));
    const sent = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(sent.map((body) => body.templateId)).toEqual(["dental", "dental"]);
  });

  it("saves a business as a template from its row, under its name, and records web.partner.template_saved", async () => {
    const fetchMock = renderAs("owner", (url, init) => {
      if (init?.method === "POST" && url === "/api/partner/templates") return Response.json({ templateId: "dental", name: "Harbor Dental", createdAt: "2026-10-26T00:00:00.000Z", template: {} }, { status: 201 });
      return Response.json({ businesses: [harbor, pier] });
    });
    const [harborActions] = await screen.findAllByRole("button", { name: "businesses.actions.more" });
    await userEvent.click(harborActions!);
    await userEvent.click(await screen.findByRole("menuitem", { name: "businesses.actions.saveTemplate" }));
    const dialog = await screen.findByRole("dialog");
    // The row names the business, so the dialog doesn't ask which.
    expect(within(dialog).queryByRole("combobox")).toBeNull();
    expect((within(dialog).getByLabelText("templates.save.nameLabel") as HTMLInputElement).value).toBe("Harbor Dental");
    await userEvent.click(within(dialog).getByRole("button", { name: "templates.save.submit" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.template_saved", { partnerId: "partner", templateId: "dental", businessId: "harbor", pathname: "/partner/partner/businesses" }));
    const post = fetchMock.mock.calls.find(([url, init]) => init?.method === "POST" && url === "/api/partner/templates");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ partnerId: "partner", businessId: "harbor", name: "Harbor Dental" });
    expect(fixture.toast.success).toHaveBeenCalledWith("templates.save.saved");
  });

  it("says when the owner entered is someone on the partner's team", async () => {
    renderAs("admin", (_url, init) => init?.method === "POST"
      ? Response.json({ error: "The owner can't be someone on your team. Your team works in the business from the console.", code: "owner_on_partner_team" }, { status: 409 })
      : Response.json({ businesses: [] }));
    await screen.findByText("businesses.empty.title");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.action" }));
    await userEvent.type(await screen.findByLabelText("businesses.create.nameLabel"), "Harbor Dental");
    await userEvent.type(screen.getByLabelText("businesses.create.ownerLabel"), "member@acme.test");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.submit" }));
    expect((await screen.findByRole("alert")).textContent).toBe("businesses.create.errors.ownerOnTeam");
    expect(fixture.telemetry!.events).toEqual([]);
  });

  it("shows owners and admins what each business pays, and members nothing of it", async () => {
    const billed = [{ ...harbor, billing: { kind: "package", packageId: "front-desk", packageName: "Front desk", status: "past_due", overage: noOverage } }, { ...pier, billing: { kind: "outside" } }];
    renderAs("owner", () => Response.json({ businesses: billed }));
    const rows = await screen.findAllByRole("row");
    expect(within(rows[0]!).getByText("businesses.table.billing")).toBeTruthy();
    expect(within(rows[1]!).getByText("Front desk")).toBeTruthy();
    expect(within(rows[1]!).getByText("businesses.billing.status.past_due")).toBeTruthy();
    expect(within(rows[2]!).getByText("businesses.billing.outside")).toBeTruthy();
    cleanup();

    renderAs("member", () => Response.json({ businesses: [{ ...harbor, billing: null }] }));
    const memberRows = await screen.findAllByRole("row");
    expect(within(memberRows[0]!).queryByText("businesses.table.billing")).toBeNull();
  });

  it("sells a new business one of the partner's packages", async () => {
    fixture.packages = { stripe: { configured: true }, packages: [{ packageId: "front-desk", name: "Front desk", currency: "CAD", monthlyPriceMinor: 14900, onConnectedAccount: true }] };
    const fetchMock = renderAs("admin", (_url, init) => init?.method === "POST"
      ? Response.json({ businessId: "pier", invitationId: "invitation", expiresAt: "2026-11-02T00:00:00.000Z" }, { status: 201 })
      : Response.json({ businesses: [] }));
    await screen.findByText("businesses.empty.title");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.action" }));
    await userEvent.type(await screen.findByLabelText("businesses.create.nameLabel"), "Pier Clinic");
    await userEvent.type(screen.getByLabelText("businesses.create.ownerLabel"), "owner@pier.test");
    expect(screen.getByText("businesses.create.billing.outside")).toBeTruthy();
    await userEvent.click(screen.getByLabelText("businesses.create.billingLabel"));
    await userEvent.click(await screen.findByRole("option", { name: "businesses.billing.option" }));
    expect(await screen.findByText("businesses.create.billing.package")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.submit" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ name: "Pier Clinic", packageId: "front-desk" });
  });

  it("sells a new business a package and starts it from a template at once", async () => {
    fixture.packages = { stripe: { configured: true }, packages: [{ packageId: "front-desk", name: "Front desk", currency: "CAD", monthlyPriceMinor: 14900, onConnectedAccount: true }] };
    const dental = { templateId: "dental", name: "Dental clinic", createdAt: "2026-10-20T12:00:00.000Z", template: { business: { name: "Harbor Dental", timezone: "America/Toronto" } } };
    const fetchMock = renderAs("admin", (url, init) => init?.method === "POST"
      ? Response.json({ businessId: "pier", invitationId: "invitation", expiresAt: "2026-11-02T00:00:00.000Z" }, { status: 201 })
      : url.startsWith("/api/partner/templates") ? Response.json({ templates: [dental] }) : Response.json({ businesses: [] }));
    await screen.findByText("businesses.empty.title");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.action" }));
    await userEvent.type(await screen.findByLabelText("businesses.create.nameLabel"), "Pier Clinic");
    await userEvent.type(screen.getByLabelText("businesses.create.ownerLabel"), "owner@pier.test");
    await userEvent.click(screen.getByLabelText("businesses.create.billingLabel"));
    await userEvent.click(await screen.findByRole("option", { name: "businesses.billing.option" }));
    await userEvent.click(await screen.findByRole("combobox", { name: "businesses.create.templateLabel" }));
    await userEvent.click(await screen.findByRole("option", { name: "Dental clinic" }));
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.submit" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ name: "Pier Clinic", packageId: "front-desk", templateId: "dental" });
  });

  it("changes how a business is billed, and says why it can't while the business pays", async () => {
    fixture.packages = { stripe: { configured: true }, packages: [{ packageId: "front-desk", name: "Front desk", currency: "CAD", monthlyPriceMinor: 14900, onConnectedAccount: true }] };
    const fetchMock = renderAs("owner", (_url, init) => init?.method === "PUT"
      ? Response.json({ error: "This business pays for its package through Stripe.", code: "subscription_active" }, { status: 409 })
      : Response.json({ businesses: [{ ...harbor, billing: { kind: "package", packageId: "front-desk", packageName: "Front desk", status: "active", overage: noOverage } }] }));
    await userEvent.click(await screen.findByRole("button", { name: "businesses.billing.changeFor" }));
    await userEvent.click(await screen.findByLabelText("businesses.create.billingLabel"));
    await userEvent.click(await screen.findByRole("option", { name: "businesses.billing.outside" }));
    await userEvent.click(screen.getByRole("button", { name: "businesses.billing.submit" }));
    expect((await screen.findByRole("alert")).textContent).toBe("businesses.billing.errors.subscriptionActive");
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(put?.[0]).toBe("/api/partner/businesses/billing");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ partnerId: "partner", businessId: "harbor", packageId: null });
  });

  it("shows each package business's overage, and sets its rates and cap in the package's currency", async () => {
    fixture.packages = { stripe: { configured: true }, packages: [{ packageId: "front-desk", name: "Front desk", currency: "CAD", monthlyPriceMinor: 14900, onConnectedAccount: true }] };
    const capped = { enabled: true, currency: "CAD", voiceMinuteRateMinor: 25, chatRateMinor: 5, capMinor: 5_000 };
    const billed = [{ ...harbor, billing: { kind: "package", packageId: "front-desk", packageName: "Front desk", status: "active", overage: noOverage } }, { ...pier, billing: { kind: "package", packageId: "front-desk", packageName: "Front desk", status: "active", overage: capped } }];
    const fetchMock = renderAs("admin", (_url, init) => init?.method === "PUT" ? Response.json({ billing: { ...billed[0]!.billing, overage: capped } }) : Response.json({ businesses: billed }));
    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]!).getByText("businesses.overage.summary.off")).toBeTruthy();
    expect(within(rows[2]!).getByText("businesses.overage.summary.cap")).toBeTruthy();

    // Harbor's overage was never set, so its rates start empty, and turning it on asks for them.
    await userEvent.click(within(rows[1]!).getByRole("button", { name: "businesses.overage.changeFor" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("businesses.overage.minuteRateLabel")).toBeNull();
    await userEvent.click(within(dialog).getByRole("switch", { name: "businesses.overage.toggle" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "businesses.overage.submit" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("businesses.overage.errors.invalidRate");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);

    await userEvent.type(within(dialog).getByLabelText("businesses.overage.minuteRateLabel"), "0.25");
    await userEvent.type(within(dialog).getByLabelText("businesses.overage.chatRateLabel"), "0.05");
    await userEvent.type(within(dialog).getByLabelText("businesses.overage.capLabel"), "50");
    await userEvent.click(within(dialog).getByRole("button", { name: "businesses.overage.submit" }));
    await waitFor(() => expect(fixture.toast.success).toHaveBeenCalledWith("businesses.overage.saved"));
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(put?.[0]).toBe("/api/partner/businesses/overage");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ partnerId: "partner", businessId: "harbor", enabled: true, voiceMinuteRateMinor: 25, chatRateMinor: 5, capMinor: 5_000 });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("turns a business's overage off and keeps its rates and cap, and says why the server refused", async () => {
    fixture.packages = { stripe: { configured: true }, packages: [] };
    const capped = { enabled: true, currency: "CAD", voiceMinuteRateMinor: 25, chatRateMinor: 5, capMinor: null };
    const fetchMock = renderAs("owner", (_url, init) => init?.method === "PUT"
      ? Response.json({ error: "This business is billed outside LobbyStack.", code: "billed_outside" }, { status: 409 })
      : Response.json({ businesses: [{ ...harbor, billing: { kind: "package", packageId: "front-desk", packageName: "Front desk", status: "active", overage: capped } }] }));
    expect(await screen.findByText("businesses.overage.summary.noCap")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "businesses.overage.changeFor" }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("businesses.overage.minuteRateLabel") as HTMLInputElement).value).toBe("0.25");
    await userEvent.click(within(dialog).getByRole("switch", { name: "businesses.overage.toggle" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "businesses.overage.submit" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("businesses.overage.errors.billedOutside");
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ partnerId: "partner", businessId: "harbor", enabled: false, voiceMinuteRateMinor: 25, chatRateMinor: 5, capMinor: null });
  });

  it("shows no overage controls without Stripe Connect, and none to members", async () => {
    renderAs("admin", () => Response.json({ businesses: [{ ...harbor, billing: { kind: "package", packageId: "front-desk", packageName: "Front desk", status: "active", overage: noOverage } }] }));
    expect(await screen.findByText("businesses.overage.summary.off")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "businesses.overage.changeFor" })).toBeNull();
    cleanup();

    renderAs("member", () => Response.json({ businesses: [{ ...harbor, billing: null }] }));
    await screen.findAllByRole("row");
    expect(screen.queryByText("businesses.overage.summary.off")).toBeNull();
  });
});
