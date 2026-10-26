// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ partner: { partnerId: "partner", name: "Bright Desk", role: "owner" as "owner" | "admin" | "member" } }));
// Each key renders with the dates it interpolates, so a test can read which dates the notice shows.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, options?: Record<string, unknown>) => [key, ...["tierEndedAt", "pausesAt", "deletesAt"].filter((name) => options && name in options).map((name) => `${name}=${String(options![name])}`)].join(" "),
  }),
}));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));

import { PartnerLifecycleNotice } from "./partner-lifecycle-notice";

const ended = { tierEndedAt: "2026-11-01T12:00:00.000Z", pausesAt: "2026-12-01T12:00:00.000Z", deletesAt: "2027-01-30T12:00:00.000Z" };
const dates = "tierEndedAt=Nov 1, 2026 pausesAt=Dec 1, 2026 deletesAt=Jan 30, 2027";
// A failed payment leaves the tier in force: it hasn't ended, so the deletion has no date yet.
const failed = { tierEndedAt: null, pausesAt: "2026-12-01T12:00:00.000Z", deletesAt: null };

function renderAs(role: "owner" | "admin" | "member", lifecycle: unknown) {
  fixture.partner = { ...fixture.partner, role };
  const fetchMock = vi.fn(async (url: string) => url.startsWith("/api/partner/lifecycle?partnerId=partner") ? Response.json(lifecycle) : new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);
  const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PartnerLifecycleNotice /></QueryClientProvider>);
  return { fetchMock, view };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("the partner's lifecycle in the console", () => {
  it("tells an owner when the businesses pause after a payment fails, with no day the tier ended, and how to keep them", async () => {
    renderAs("owner", { state: "past_due", ...failed });
    expect(await screen.findByText("lifecycle.past_due.title pausesAt=Dec 1, 2026")).toBeTruthy();
    expect(screen.getByText("lifecycle.past_due.description pausesAt=Dec 1, 2026")).toBeTruthy();
    expect(screen.getByText("lifecycle.past_due.owner pausesAt=Dec 1, 2026")).toBeTruthy();
    expect(screen.queryByText(/lifecycle\.past_due\.admin/)).toBeNull();
  });

  it("tells an admin the same once the tier ended, with what an admin can do", async () => {
    renderAs("admin", { state: "ending", ...ended });
    expect(await screen.findByText(`lifecycle.ending.title ${dates}`)).toBeTruthy();
    expect(screen.getByText(`lifecycle.ending.admin ${dates}`)).toBeTruthy();
    expect(screen.queryByText(/lifecycle\.ending\.owner/)).toBeNull();
  });

  it("warns once the businesses are paused, and once they're deleted", async () => {
    renderAs("owner", { state: "paused", ...ended });
    expect((await screen.findByText(`lifecycle.paused.title ${dates}`)).closest("[data-slot=alert]")?.className).toContain("text-destructive");
    expect(screen.getByText(`lifecycle.paused.owner ${dates}`)).toBeTruthy();
    cleanup();
    renderAs("admin", { state: "deleted", tierEndedAt: ended.tierEndedAt, pausesAt: null, deletesAt: ended.deletesAt });
    expect(await screen.findByText("lifecycle.deleted.title tierEndedAt=Nov 1, 2026 deletesAt=Jan 30, 2027")).toBeTruthy();
    expect(screen.getByText("lifecycle.deleted.admin tierEndedAt=Nov 1, 2026 deletesAt=Jan 30, 2027")).toBeTruthy();
  });

  it("tells a partner paused while its payment failed to update its card, since it still holds its tier", async () => {
    renderAs("owner", { state: "paused", ...failed });
    expect(await screen.findByText("lifecycle.paused_past_due.title pausesAt=Dec 1, 2026")).toBeTruthy();
    expect(screen.getByText("lifecycle.paused_past_due.description pausesAt=Dec 1, 2026")).toBeTruthy();
    expect(screen.getByText("lifecycle.paused_past_due.owner pausesAt=Dec 1, 2026")).toBeTruthy();
    expect(screen.queryByText(/lifecycle\.paused\./)).toBeNull();
  });

  it("shows nothing for a partner whose tier never ended", async () => {
    const { fetchMock, view } = renderAs("owner", { state: "active", tierEndedAt: null, pausesAt: null, deletesAt: null });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(view.container.innerHTML).toBe("");
  });

  it("never asks the server for a member, who doesn't keep the businesses running", () => {
    const { fetchMock, view } = renderAs("member", { state: "paused", ...ended });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(view.container.innerHTML).toBe("");
  });
});
