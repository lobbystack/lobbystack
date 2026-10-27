// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ partner: { partnerId: "partner", name: "Bright Desk", role: "member" as "owner" | "admin" | "member" } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PartnerTeamSurface } from "./partner-team-surface";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const team = (role: "owner" | "admin" | "member") => ({
  role,
  members: [
    { memberId: "owner-row", userId: "owner", name: "Olive", email: "olive@example.test", role: "owner", joinedAt: "2026-10-01T00:00:00.000Z" },
    { memberId: "member-row", userId: "member", name: null, email: "max@example.test", role: "member", joinedAt: "2026-10-02T00:00:00.000Z" },
  ],
  invitations: [{ invitationId: "owner-invite", email: "boss@example.test", role: "owner", expiresAt: "2099-01-01T00:00:00.000Z", invitedAt: "2026-10-03T00:00:00.000Z" }],
});

function renderAs(role: "owner" | "admin" | "member") {
  fixture.partner = { ...fixture.partner, role };
  const fetchMock = vi.fn(async () => Response.json(team(role)));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PartnerTeamSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("the partner console's Team page", () => {
  it("shows a member the team with no way to change it", async () => {
    const fetchMock = renderAs("member");
    await screen.findByText("olive@example.test", { exact: false });
    // Session replay masks each person's name and email.
    expect(screen.getByText("max@example.test").className).toContain("ph-mask");
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/team?partnerId=partner", expect.anything());
    expect(screen.queryByRole("button", { name: "team.invite.action" })).toBeNull();
    expect(screen.queryAllByRole("button", { name: "team.actions.moreOptions" })).toEqual([]);
  });

  it("lets an admin manage admins and members, and hides everything that touches the owner role", async () => {
    renderAs("admin");
    await screen.findByText("max@example.test");
    // Only the member's row has actions: the owner's and the owner invitation's don't.
    const actions = screen.getAllByRole("button", { name: "team.actions.moreOptions" });
    expect(actions).toHaveLength(1);
    await userEvent.click(actions[0]!);
    expect(await screen.findByRole("menuitem", { name: "team.actions.makeAdmin" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "team.actions.makeOwner" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "team.invite.action" }));
    await screen.findByRole("radio", { name: /roles\.admin/ });
    expect(screen.queryByRole("radio", { name: /roles\.owner/ })).toBeNull();
  });

  it("gives an owner the owner-only actions", async () => {
    renderAs("owner");
    await screen.findByText("max@example.test");
    expect(screen.getAllByRole("button", { name: "team.actions.moreOptions" })).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "team.invite.action" }));
    expect(await screen.findByRole("radio", { name: /roles\.owner/ })).toBeTruthy();
  });

  it("asks before it makes someone an owner", async () => {
    const fetchMock = renderAs("owner");
    await screen.findByText("max@example.test");
    await userEvent.click(screen.getAllByRole("button", { name: "team.actions.moreOptions" })[1]!);
    await userEvent.click(await screen.findByRole("menuitem", { name: "team.actions.makeOwner" }));
    expect(await screen.findByText("team.confirm.ownerTitle")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/partner/team", expect.objectContaining({ method: "PATCH" }));
    await userEvent.click(screen.getByRole("button", { name: "team.confirm.ownerAction" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/partner/team", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ partnerId: "partner", memberId: "member-row", role: "owner" }) })));
  });

  it("sends an invitation for the partner the console is open on", async () => {
    const fetchMock = renderAs("admin");
    await screen.findByText("max@example.test");
    await userEvent.click(screen.getByRole("button", { name: "team.invite.action" }));
    await userEvent.type(await screen.findByLabelText("team.invite.emailLabel"), "new@example.test");
    await userEvent.click(screen.getByRole("radio", { name: /roles\.admin/ }));
    await userEvent.click(screen.getByRole("button", { name: "team.invite.submit" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/partner/team", expect.objectContaining({ method: "POST", body: JSON.stringify({ partnerId: "partner", email: "new@example.test", role: "admin" }) })));
  });
});
