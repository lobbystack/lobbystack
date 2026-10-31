// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveTeamSurface } from "./live-team-surface";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
  useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }),
}));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

const skeletons = () => document.querySelectorAll('[data-slot="skeleton"]').length;
const hidden = (text: string) => screen.getByText(text).className.includes("invisible");

function render_(role: string, { workspace = true, team = false }: { workspace?: boolean; team?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  if (workspace) client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Clinic", active: true, role }] });
  if (team) client.setQueryData(["team", "business"], { members: [{ membershipId: "member", email: "owner@example.invalid", role: "business_owner", joinedAt: "2026-09-01T12:00:00Z" }], invitations: [] });
  else vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<QueryClientProvider client={client}><LiveTeamSurface /></QueryClientProvider>);
}

describe("team loading states", () => {
  it.each([["the workspace", false], ["the members", true]])("shows placeholders for the whole page, controls included, while %s load", (_, workspace) => {
    render_("business_owner", { workspace });
    // The business name item, the members section and the delete card.
    expect(hidden("account.businessName.label")).toBe(true);
    expect(hidden("workspaceTeam.members.title")).toBe(true);
    expect(hidden("workspaceTeam.delete.title")).toBe(true);
    expect(document.querySelectorAll("tbody tr").length).toBe(3);
    expect(document.querySelector("tbody")?.getAttribute("aria-busy")).toBe("true");
    expect(skeletons()).toBe(21);
    // The real column headings stay.
    expect(screen.getByText("workspaceTeam.members.table.email")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Clinic")).toBeNull();
    expect(screen.queryByText("workspaceTeam.members.empty")).toBeNull();
  });

  it("turns the whole page real together, with the owner's controls, once the members have loaded", () => {
    render_("business_owner", { team: true });
    expect(skeletons()).toBe(0);
    expect(screen.getByRole("heading", { name: "workspaceTeam.members.title" })).toBeTruthy();
    expect(screen.getByText("Clinic")).toBeTruthy();
    expect(screen.getByText("owner@example.invalid")).toBeTruthy();
    for (const label of ["account.actions.change", "workspaceTeam.invite.action", "workspaceTeam.delete.action"]) expect(screen.getByRole("button", { name: label })).toBeTruthy();
  });

  it("leaves out the controls a viewer can't use once the members have loaded", () => {
    render_("viewer", { team: true });
    expect(skeletons()).toBe(0);
    for (const label of ["account.actions.change", "workspaceTeam.invite.action", "workspaceTeam.delete.action"]) expect(screen.queryByRole("button", { name: label })).toBeNull();
  });
});
