// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ partner: { partnerId: "partner", name: "Bright Desk", role: "owner" as "owner" | "admin" | "member" } }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("sonner", () => ({ toast: toasts }));

import { PartnerSettingsSurface } from "./partner-settings-surface";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

/** The server's side: what it saved, which reads answer, unless the test answers itself. */
function renderAs(role: "owner" | "admin" | "member", respond?: (init?: RequestInit) => Response | Promise<Response>) {
  fixture.partner = { ...fixture.partner, partnerId: "partner", role };
  let telemetryEnabled = true;
  const saved = (init?: RequestInit) => {
    if (init?.method === "PATCH") telemetryEnabled = JSON.parse(String(init.body)).telemetryEnabled;
    return Response.json({ role, telemetryEnabled, ...(init?.method === "PATCH" ? {} : { deploymentMode: "cloud" }) });
  };
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => await (respond ?? saved)(init));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><PartnerSettingsSurface /></QueryClientProvider>;
  const view = render(tree());
  return { client, fetchMock, rerender: () => view.rerender(tree()) };
}

const toggle = () => screen.findByRole("switch", { name: "settings.telemetry.label" });

describe("the partner console's Settings page", () => {
  it.each(["owner", "admin"] as const)("lets an %s turn the partner's telemetry off, which the console's consent reads at once", async (role) => {
    const { client, fetchMock } = renderAs(role);
    const telemetry = await toggle();
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/settings?partnerId=partner", expect.anything());
    // A new partner's setting starts on, as a business's does.
    expect(telemetry.getAttribute("aria-checked")).toBe("true");
    await userEvent.click(telemetry);
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("settings.saved"));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(patch[0]).toBe("/api/partner/settings");
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ partnerId: "partner", telemetryEnabled: false });
    expect(client.getQueryData(["partner-settings", "partner"])).toMatchObject({ telemetryEnabled: false });
    expect(screen.queryByText("settings.membersCantEdit")).toBeNull();
  });

  it("shows members the setting with no way to change it", async () => {
    const { fetchMock } = renderAs("member");
    const telemetry = await toggle();
    expect(telemetry.getAttribute("aria-checked")).toBe("true");
    expect(telemetry.hasAttribute("disabled") || telemetry.getAttribute("aria-disabled") === "true" || telemetry.getAttribute("data-disabled") !== null).toBe(true);
    expect(screen.getByText("settings.membersCantEdit")).toBeTruthy();
    await userEvent.click(telemetry);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("puts the setting back and says so when the save fails", async () => {
    renderAs("owner", (init) => init?.method === "PATCH" ? Response.json({ error: "Request failed." }, { status: 500 }) : Response.json({ role: "owner", telemetryEnabled: true }));
    await userEvent.click(await toggle());
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("settings.telemetry.saveFailed"));
    await waitFor(async () => expect((await toggle()).getAttribute("aria-checked")).toBe("true"));
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("keeps quiet about a save for a partner the person has since switched away from", async () => {
    let finish!: (response: Response) => void;
    const { rerender } = renderAs("owner", (init) => init?.method === "PATCH" ? new Promise<Response>((resolve) => { finish = resolve; }) : Response.json({ role: "owner", telemetryEnabled: true }));
    await userEvent.click(await toggle());
    fixture.partner = { ...fixture.partner, partnerId: "other" };
    rerender();
    await act(async () => { finish(Response.json({ role: "owner", telemetryEnabled: false })); });
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("says when it can't load the settings", async () => {
    renderAs("owner", () => Response.json({ error: "Request failed." }, { status: 500 }));
    expect((await screen.findByRole("alert")).textContent).toBe("settings.loadFailed");
  });
});
