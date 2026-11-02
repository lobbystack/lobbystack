// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppearancePage from "../../app/(dashboard)/settings/appearance/page";
const mocks = vi.hoisted(() => ({ toast: vi.fn(), success: vi.fn(), timeFormatReady: true }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast, success: mocks.success } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./appearance-provider", () => ({ useAppearancePreference: () => ({ ready: mocks.timeFormatReady, timeFormatPreference: "24h", setTimeFormatPreference: vi.fn() }) }));
vi.mock("./replacement-locale-provider", () => ({ useLocalePreference: () => ({ locale: "en", setLocale: vi.fn(), isSaving: false }) }));
const clients: QueryClient[] = [];
afterEach(() => { mocks.timeFormatReady = true; cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); mocks.toast.mockReset(); mocks.success.mockReset(); });
describe("appearance workspace mutation isolation", () => {
  it.each([true, false])("keeps the new workspace unchanged when the old request succeeds=%s", async succeeds => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }); clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business-a", active: true }] });
    for (const id of ["business-a", "business-b"]) client.setQueryData(["appearance-preferences", id], { telemetryEnabled: false, canManageTenant: true });
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={client}><AppearancePage /></QueryClientProvider>);
    await userEvent.click(screen.getByRole("switch", { name: "appearance.telemetry.label" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]).toEqual(expect.arrayContaining(["/api/preferences/appearance?businessId=business-a"]));
    await act(async () => client.setQueryData(["businesses"], { businesses: [{ businessId: "business-b", active: true }] }));
    await act(async () => resolve(Response.json(succeeds ? { telemetryEnabled: true } : { error: "Failed" }, { status: succeeds ? 200 : 500 })));
    await waitFor(() => expect(screen.getByRole("switch", { name: "appearance.telemetry.label" }).getAttribute("aria-checked")).toBe("false"));
    expect(screen.getByRole("switch", { name: "appearance.telemetry.label" }).hasAttribute("disabled")).toBe(false);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(client.getQueryData(["appearance-preferences", "business-b"])).toEqual({ telemetryEnabled: false, canManageTenant: true });
  });

  it("confirms a saved telemetry preference for the active workspace", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }); clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business-a", active: true }] });
    client.setQueryData(["appearance-preferences", "business-a"], { telemetryEnabled: false, canManageTenant: true });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ telemetryEnabled: true })));
    render(<QueryClientProvider client={client}><AppearancePage /></QueryClientProvider>);
    await userEvent.click(screen.getByRole("switch", { name: "appearance.telemetry.label" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("appearance.saved"));
  });
});

describe("appearance loading states", () => {
  const skeletons = () => document.querySelectorAll('[data-slot="skeleton"]').length;
  function renderPage({ workspace, preferences }: { workspace: boolean; preferences: boolean }) {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } }); clients.push(client);
    if (workspace) client.setQueryData(["businesses"], { businesses: [{ businessId: "business-a", active: true }] });
    if (preferences) client.setQueryData(["appearance-preferences", "business-a"], { telemetryEnabled: false, canManageTenant: true });
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<QueryClientProvider client={client}><AppearancePage /></QueryClientProvider>);
  }

  it.each([["the workspace", false], ["the saved preference", true]])("shows every row as a placeholder, controls and text included, while %s load", (_, workspace) => {
    renderPage({ workspace, preferences: false });
    // A title, a description and a control for each of the three rows.
    expect(skeletons()).toBe(9);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    for (const row of ["language", "timeFormat", "telemetry"]) {
      expect(screen.getByText(`appearance.${row}.label`).className).toContain("invisible");
      expect(screen.getByText(`appearance.${row}.description`).className).toContain("invisible");
    }
  });

  it("keeps all the rows placeholders until the browser's saved time format has been read", () => {
    mocks.timeFormatReady = false;
    renderPage({ workspace: true, preferences: true });
    expect(skeletons()).toBe(9);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("turns all the rows real together once everything has loaded", () => {
    renderPage({ workspace: true, preferences: true });
    expect(skeletons()).toBe(0);
    expect(screen.getByText("appearance.language.label").className).not.toContain("invisible");
    expect(screen.getByRole("combobox", { name: "common:language.ariaLabel" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "appearance.timeFormat.label" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "appearance.telemetry.label" }).getAttribute("aria-checked")).toBe("false");
  });
});
