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
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, values?: { count?: number }) => (values?.count === undefined ? key : `${key}:${values.count}`) }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/partner/partner/templates" }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => fixture.telemetry!.telemetry }));
vi.mock("sonner", () => ({ toast: fixture.toast }));

import { PartnerTemplatesSurface } from "./partner-templates-surface";

const dental = {
  templateId: "dental",
  name: "Dental clinic",
  createdAt: "2026-10-20T12:00:00.000Z",
  template: {
    business: { name: "Harbor Dental", timezone: "America/Toronto", hours: [{ day: "monday", open: "08:00", close: "17:00" }] },
    receptionist: { greeting: "Thanks for calling." },
    services: [{ name: "Cleaning", duration_minutes: 45 }, { name: "Whitening", duration_minutes: 60 }],
    knowledge: { faqs: [{ question: "Do you take new patients?", answer: "Yes." }], files: ["prices.pdf"] },
  },
};
const harbor = { businessId: "harbor", name: "Harbor Dental" };

beforeEach(() => { fixture.telemetry = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function renderAs(role: "owner" | "admin" | "member", respond: (url: string, init?: RequestInit) => Response) {
  fixture.partner = { ...fixture.partner, role };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => respond(url, init));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PartnerTemplatesSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("the partner console's Templates page", () => {
  it("lists each template with what it sets up for anyone on the team, and lets only owners and admins change them", async () => {
    const fetchMock = renderAs("member", () => Response.json({ templates: [dental] }));
    const rows = await screen.findAllByRole("row");
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/templates?partnerId=partner", expect.anything());
    expect(within(rows[1]!).getByText("Dental clinic")).toBeTruthy();
    for (const badge of ["templates.contents.receptionist", "templates.contents.hours", "templates.contents.services:2", "templates.contents.faqs:1", "templates.contents.files:1"]) expect(within(rows[1]!).getByText(badge)).toBeTruthy();
    // A part the template doesn't set up gets no badge.
    expect(within(rows[1]!).queryByText(/templates\.contents\.rules/)).toBeNull();
    expect(screen.queryByRole("button", { name: "templates.save.action" })).toBeNull();
    expect(screen.queryByRole("button", { name: "templates.actions.more" })).toBeNull();
  });

  it("tells a member with no templates that owners and admins save them", async () => {
    renderAs("member", () => Response.json({ templates: [] }));
    expect(await screen.findByText("templates.empty.memberDescription")).toBeTruthy();
  });

  it("saves the business the admin picks under the name they give, and records web.partner.template_saved", async () => {
    const templates: unknown[] = [];
    const fetchMock = renderAs("admin", (url, init) => {
      if (init?.method === "POST") {
        templates.push(dental);
        return Response.json(dental, { status: 201 });
      }
      return url.startsWith("/api/partner/businesses") ? Response.json({ businesses: [harbor] }) : Response.json({ templates });
    });
    await screen.findByText("templates.empty.description");
    await userEvent.click(screen.getByRole("button", { name: "templates.save.action" }));
    await userEvent.click(await screen.findByRole("combobox", { name: "templates.save.businessLabel" }));
    await userEvent.click(await screen.findByRole("option", { name: "Harbor Dental" }));
    // The business's name is a start for the template's.
    const name = screen.getByLabelText("templates.save.nameLabel");
    expect((name as HTMLInputElement).value).toBe("Harbor Dental");
    await userEvent.clear(name);
    await userEvent.type(name, "Dental clinic");
    await userEvent.click(screen.getByRole("button", { name: "templates.save.submit" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.template_saved", { partnerId: "partner", templateId: "dental", businessId: "harbor", pathname: "/partner/partner/templates" }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/partner/templates");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ partnerId: "partner", businessId: "harbor", name: "Dental clinic" });
    expect(fixture.toast.success).toHaveBeenCalledWith("templates.save.saved");
    expect(await screen.findByText("Dental clinic")).toBeTruthy();
  });

  it("says why a business couldn't be saved as a template, and records nothing", async () => {
    renderAs("owner", (url, init) => {
      if (init?.method === "POST") return Response.json({ error: "A template can't hold part of this business's setup.", code: "template_invalid" }, { status: 409 });
      return url.startsWith("/api/partner/businesses") ? Response.json({ businesses: [harbor] }) : Response.json({ templates: [] });
    });
    await userEvent.click(await screen.findByRole("button", { name: "templates.save.action" }));
    await userEvent.click(await screen.findByRole("combobox", { name: "templates.save.businessLabel" }));
    await userEvent.click(await screen.findByRole("option", { name: "Harbor Dental" }));
    await userEvent.click(screen.getByRole("button", { name: "templates.save.submit" }));
    expect((await screen.findByRole("alert")).textContent).toBe("templates.save.errors.invalid");
    expect(fixture.telemetry!.events).toEqual([]);
  });

  it("deletes a template once the admin confirms, and records web.partner.template_deleted", async () => {
    let templates = [dental];
    const fetchMock = renderAs("admin", (_url, init) => {
      if (init?.method === "DELETE") {
        templates = [];
        return Response.json({ ok: true });
      }
      return Response.json({ templates });
    });
    await userEvent.click(await screen.findByRole("button", { name: "templates.actions.more" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "templates.delete.action" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("templates.delete.description")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "templates.delete.confirm" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.template_deleted", { partnerId: "partner", templateId: "dental", pathname: "/partner/partner/templates" }));
    const deleted = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(JSON.parse(String(deleted?.[1]?.body))).toEqual({ partnerId: "partner", templateId: "dental" });
    expect(fixture.toast.success).toHaveBeenCalledWith("templates.delete.deleted");
    expect(await screen.findByText("templates.empty.description")).toBeTruthy();
  });
});
