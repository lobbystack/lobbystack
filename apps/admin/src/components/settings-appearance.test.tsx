// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppearancePage from "../../app/(dashboard)/settings/appearance/page";
const mocks = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./appearance-provider", () => ({ useAppearancePreference: () => ({ timeFormatPreference: "24h", setTimeFormatPreference: vi.fn() }) }));
vi.mock("./replacement-locale-provider", () => ({ useLocalePreference: () => ({ locale: "en", setLocale: vi.fn(), isSaving: false }) }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); mocks.toast.mockReset(); });
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
    expect(client.getQueryData(["appearance-preferences", "business-b"])).toEqual({ telemetryEnabled: false, canManageTenant: true });
  });
});
