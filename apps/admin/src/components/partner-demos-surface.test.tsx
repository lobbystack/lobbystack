// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const fixture = vi.hoisted(() => ({
  partner: { partnerId: "partner", name: "Bright Desk", role: "member" as "owner" | "admin" | "member" },
  telemetry: null as ReturnType<typeof createRecordedBrowserTelemetry> | null,
  // One t for every render, as react-i18next gives.
  translation: { i18n: { language: "en" }, t: (key: string, values?: Record<string, unknown>) => (values && "minutes" in values ? `${key}:${String(values.minutes)}:${String(values.chats)}` : key) },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => fixture.translation }));
vi.mock("next/navigation", () => ({ usePathname: () => "/partner/partner/demos" }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => fixture.telemetry!.telemetry }));

import { PartnerDemosSurface } from "./partner-demos-surface";

const url = "https://bright.portal.example.test/demo#prospect_demo_token=harbor-token";
const harbor = {
  demoId: "demo",
  businessId: "harbor",
  businessName: "Harbor Dental",
  businessSlug: "harbor-dental",
  websiteUrl: "https://harbor.example",
  status: "preparing",
  suggestedPrompts: ["Hours?", "Prices?"],
  expiresAt: "2026-11-25T12:00:00.000Z",
  websiteIngestionStatus: "completed",
  greetingReady: true,
  snapshotReady: true,
  promptsReady: true,
  accessLevel: "activity",
  usage: { periodKey: "2026-10", voiceSeconds: 90, chats: 2 },
};

beforeEach(() => {
  fixture.telemetry = createRecordedBrowserTelemetry();
  fixture.partner = { ...fixture.partner, role: "member" };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function renderWith(respond: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => respond(input, init));
  vi.stubGlobal("fetch", fetchMock);
  render(<PartnerDemosSurface />);
  return fetchMock;
}

const posted = (fetchMock: ReturnType<typeof renderWith>, path: string) => fetchMock.mock.calls.filter(([input, init]) => input === path && init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

describe("the partner console's Demos page", () => {
  it("lists the partner's demos with the access level each gives once claimed and its usage this month", async () => {
    const fetchMock = renderWith(() => Response.json({ demos: [harbor] }));
    expect(await screen.findByText("Harbor Dental")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/demos?partnerId=partner");
    expect(screen.getByText("partner:businesses.access.activity")).toBeTruthy();
    expect(screen.getByText("operator.partner.usage:1.5:2")).toBeTruthy();
  });

  it("makes a demo at the access level an admin picks, keeps its link on the partner's domain, and records web.partner.demo_created", async () => {
    fixture.partner = { ...fixture.partner, role: "admin" };
    let made = false;
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const fetchMock = renderWith((_input, init) => {
      if (init?.method === "POST") { made = true; return Response.json({ demoId: "demo", businessId: "harbor", token: "harbor-token", url, accessLevel: "activity", status: "preparing" }, { status: 201 }); }
      return Response.json({ demos: made ? [harbor] : [] });
    });
    await screen.findByText("operator.partner.empty");
    // The Create demo button opens the form in a dialog.
    await userEvent.click(screen.getByRole("button", { name: "operator.create" }));
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("operator.businessName"), "Harbor Dental");
    await userEvent.type(dialog.getByLabelText("operator.websiteUrl"), "https://harbor.example");
    await userEvent.type(screen.getByLabelText("operator.suggestedPrompts"), "Hours?{enter}Prices?");
    await userEvent.click(screen.getByRole("radio", { name: /businesses\.access\.activity/ }));
    await userEvent.click(screen.getByRole("button", { name: "operator.create" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.demo_created", { partnerId: "partner", prospectDemoId: "demo", businessId: "harbor", accessLevel: "activity", pathname: "/partner/partner/demos" }));
    expect(posted(fetchMock, "/api/partner/demos")).toEqual([{ partnerId: "partner", name: "Harbor Dental", websiteUrl: "https://harbor.example", greeting: "", locale: "en", suggestedPrompts: ["Hours?", "Prices?"], accessLevel: "activity" }]);
    await userEvent.click(await screen.findByRole("button", { name: "operator.openLink" }));
    expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer");
  });

  it("says the list didn't load on the page itself, not only inside the closed dialog", async () => {
    renderWith(() => Response.json({ error: "down" }, { status: 500 }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "operator.errors.load");
    expect(screen.queryByText("operator.partner.empty")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts each new demo at full access, even after an admin picked another level and closed the dialog", async () => {
    fixture.partner = { ...fixture.partner, role: "admin" };
    renderWith(() => Response.json({ demos: [] }));
    await screen.findByText("operator.partner.empty");
    await userEvent.click(screen.getByRole("button", { name: "operator.create" }));
    await userEvent.click(await screen.findByRole("radio", { name: /businesses\.access\.activity/ }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "operator.create" }));
    expect((await screen.findByRole("radio", { name: /businesses\.access\.full/ })).getAttribute("aria-checked")).toBe("true");
  });

  it("makes a member's demo at full access, with no access level to pick", async () => {
    let made = false;
    const fetchMock = renderWith((_input, init) => {
      if (init?.method === "POST") { made = true; return Response.json({ demoId: "demo", businessId: "harbor", token: "harbor-token", url, accessLevel: "full", status: "preparing" }, { status: 201 }); }
      return Response.json({ demos: made ? [{ ...harbor, accessLevel: "full" }] : [] });
    });
    await screen.findByText("operator.partner.empty");
    expect(screen.queryByRole("radio")).toBeNull();
    // The Create demo button opens the form in a dialog.
    await userEvent.click(screen.getByRole("button", { name: "operator.create" }));
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("operator.businessName"), "Harbor Dental");
    await userEvent.type(dialog.getByLabelText("operator.websiteUrl"), "https://harbor.example");
    await userEvent.type(dialog.getByLabelText("operator.suggestedPrompts"), "Hours?{enter}Prices?");
    await userEvent.click(dialog.getByRole("button", { name: "operator.create" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.demo_created", { partnerId: "partner", prospectDemoId: "demo", businessId: "harbor", accessLevel: "full", pathname: "/partner/partner/demos" }));
    expect(posted(fetchMock, "/api/partner/demos")[0]).not.toHaveProperty("accessLevel");
  });

  it("says when the partner needs a domain first, and records nothing", async () => {
    renderWith((_input, init) => init?.method === "POST" ? Response.json({ error: "You need your own domain before you can make a demo.", code: "partner_domain_required" }, { status: 409 }) : Response.json({ demos: [] }));
    await screen.findByText("operator.partner.empty");
    // The Create demo button opens the form in a dialog.
    await userEvent.click(screen.getByRole("button", { name: "operator.create" }));
    const dialog = within(await screen.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("operator.businessName"), "Harbor Dental");
    await userEvent.type(dialog.getByLabelText("operator.websiteUrl"), "https://harbor.example");
    await userEvent.type(dialog.getByLabelText("operator.suggestedPrompts"), "Hours?{enter}Prices?");
    await userEvent.click(dialog.getByRole("button", { name: "operator.create" }));
    expect((await screen.findByRole("alert")).textContent).toBe("operator.partner.errors.domainRequired");
    expect(fixture.telemetry!.events).toEqual([]);
  });

  it("publishes a demo with its new link's token and turns it off, recording web.partner.demo_published and web.partner.demo_revoked", async () => {
    let status = "preparing";
    const fetchMock = renderWith((input, init) => {
      if (input === "/api/partner/demos/demo") {
        const action = JSON.parse(String(init?.body)).action as string;
        if (action === "rotate") return Response.json({ token: "fresh-token", url });
        status = action === "publish" ? "active" : "revoked";
        return Response.json({ status });
      }
      return Response.json({ demos: [{ ...harbor, status }] });
    });
    await screen.findByText("Harbor Dental");
    await userEvent.click(screen.getByRole("button", { name: "operator.rotate" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "operator.publish" }).hasAttribute("disabled")).toBe(false));
    await userEvent.click(screen.getByRole("button", { name: "operator.publish" }));
    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.demo_published", { partnerId: "partner", prospectDemoId: "demo", businessId: "harbor", pathname: "/partner/partner/demos" }));
    await userEvent.click(await screen.findByRole("button", { name: "operator.revoke" }));
    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.demo_revoked", { partnerId: "partner", prospectDemoId: "demo", businessId: "harbor", pathname: "/partner/partner/demos" }));

    expect(posted(fetchMock, "/api/partner/demos/demo").map((body) => [body.partnerId, body.action, body.token])).toEqual([["partner", "rotate", undefined], ["partner", "publish", "fresh-token"], ["partner", "revoke", "fresh-token"]]);
    // A closed demo can't get a new link or be opened.
    await waitFor(() => expect(screen.getByRole("button", { name: "operator.rotate" }).hasAttribute("disabled")).toBe(true));
    expect(screen.queryByRole("button", { name: "operator.partner.open" })).toBeNull();
  });

  it("opens a demo's business on the partner's domain, as opening a business does, and records web.partner.business_opened", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const fetchMock = renderWith((input) => input === "/api/partner/businesses/open" ? Response.json({ expiresAt: "2026-10-26T20:00:00.000Z", url: "https://bright.portal.example.test/" }) : Response.json({ demos: [harbor] }));
    const card = (await screen.findByText("Harbor Dental")).closest("[data-slot=card]") as HTMLElement;
    await userEvent.click(within(card).getByRole("button", { name: "operator.partner.open" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://bright.portal.example.test/"));
    expect(posted(fetchMock, "/api/partner/businesses/open")).toEqual([{ partnerId: "partner", businessId: "harbor" }]);
    fixture.telemetry!.expectEvent("web.partner.business_opened", { partnerId: "partner", businessId: "harbor", pathname: "/partner/partner/demos" });
  });

  it("deletes a closed demo nobody claimed once an owner confirms, and records web.partner.business_deleted", async () => {
    fixture.partner = { ...fixture.partner, role: "owner" };
    let demos = [{ ...harbor, status: "revoked" }, { ...harbor, demoId: "pier-demo", businessId: "pier", businessName: "Pier Clinic", status: "claimed" }];
    const fetchMock = renderWith((input, init) => {
      if (init?.method === "DELETE") {
        demos = demos.filter((demo) => `/api/partner/demos/${demo.demoId}` !== input);
        return Response.json({ ok: true });
      }
      return Response.json({ demos });
    });
    const card = (await screen.findByText("Harbor Dental")).closest("[data-slot=card]") as HTMLElement;
    // A claimed demo is one of the partner's businesses, which the Businesses page deletes.
    const claimed = screen.getByText("Pier Clinic").closest("[data-slot=card]") as HTMLElement;
    expect(within(claimed).queryByRole("button", { name: "operator.partner.delete" })).toBeNull();
    await userEvent.click(within(card).getByRole("button", { name: "operator.partner.delete" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "operator.partner.deleteConfirm" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.business_deleted", { partnerId: "partner", businessId: "harbor", pathname: "/partner/partner/demos" }));
    const deleted = fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
    expect(deleted.map(([input, init]) => [input, JSON.parse(String(init?.body))])).toEqual([["/api/partner/demos/demo", { partnerId: "partner" }]]);
    await waitFor(() => expect(screen.queryByText("Harbor Dental")).toBeNull());
  });

  it("offers a member no delete, and an owner none for a demo that's still open", async () => {
    renderWith(() => Response.json({ demos: [{ ...harbor, status: "revoked" }] }));
    await screen.findByText("Harbor Dental");
    expect(screen.queryByRole("button", { name: "operator.partner.delete" })).toBeNull();
    cleanup();
    fixture.partner = { ...fixture.partner, role: "owner" };
    renderWith(() => Response.json({ demos: [{ ...harbor, status: "active", expiresAt: "2099-01-01T00:00:00.000Z" }] }));
    await screen.findByText("Harbor Dental");
    expect(screen.queryByRole("button", { name: "operator.partner.delete" })).toBeNull();
  });
});
