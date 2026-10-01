// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveContactsSurface } from "./live-contacts-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
const toast = vi.hoisted(() => ({ error: vi.fn() }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); vi.stubGlobal("localStorage", { getItem: () => "en", setItem: vi.fn() }); vi.stubGlobal("EventSource", class { addEventListener() {} close() {} }); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(deleteError?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") return Response.json(deleteError ? { error: deleteError } : { ok: true }, { status: deleteError ? 409 : 200 });
    const params = new URL(url, "https://example.invalid").searchParams;
    const offset = Number(params.get("offset")); const search = params.get("search");
    return Response.json({ contacts: [{ id: `contact-${offset}`, name: search ? "Matching contact beyond first 100" : `Contact ${offset + 1}`, phone: "+14155550100", email: null, operatorBlockedAt: null, createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-04T12:00:00Z", lastInteractionAt: "2026-09-02T12:00:00Z", callCount: 2, messageCount: 0, appointmentCount: 0 }], pagination: { total: search ? 1 : 101 } });
  });
  vi.stubGlobal("fetch", fetchMock);
  const view = render(<QueryClientProvider client={client}><LiveContactsSurface /></QueryClientProvider>);
  return { ...view, fetchMock };
}
describe("contact list parity and pagination", () => {
  it("keeps deletion confirmation open and reports the linked-history error", async () => {
    const error = "This contact can't be deleted because it still has linked conversations or appointments.";
    const { fetchMock } = setup(error);
    await userEvent.click(await screen.findByRole("button", { name: "table.actions.moreOptions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "table.actions.deleteContact" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "table.actions.deleteConfirm" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(error));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("Contact 1")).toBeTruthy();
  });
  it("renders the original trailing actions layout", async () => {
    const { container } = setup();
    expect(await screen.findByRole("button", { name: "table.actions.moreOptions" })).toBeTruthy();
    expect(container.querySelector('[data-slot="data-table-row-actions"]')).toBeTruthy();
  });
  it("uses total row count and fetches contacts beyond the first hundred", async () => {
    const { fetchMock } = setup();
    await screen.findByText("Contact 1");
    await userEvent.click(screen.getByRole("button", { name: "pagination.lastPage" }));
    expect(await screen.findByText("Contact 101")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url.includes("offset=100"))).toBe(true);
    expect(screen.getByRole("button", { name: "pagination.nextPage" }).hasAttribute("disabled")).toBe(true);
  });
  it("searches the tenant's complete contact set and resets pagination", async () => {
    const { fetchMock } = setup();
    await screen.findByText("Contact 1");
    await userEvent.click(screen.getByRole("button", { name: "pagination.lastPage" }));
    await screen.findByText("Contact 101");
    await userEvent.type(screen.getByPlaceholderText("page.searchPlaceholder"), "beyond");
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("offset=0&search=beyond"))).toBe(true));
    expect(await screen.findByText("Matching contact beyond first 100")).toBeTruthy();
  });
  it("records contact_opened with the active business and contact identifiers", async () => {
    setup();
    await userEvent.click(await screen.findByText("Contact 1"));
    telemetryRef.current!.expectEvent("web.contacts.contact_opened", { businessId: "business", contactId: "contact-0" });
  });
});
describe("contact names and channels", () => {
  const base = { operatorBlockedAt: null, createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-04T12:00:00Z", lastInteractionAt: "2026-09-02T12:00:00Z", callCount: 1, messageCount: 0, appointmentCount: 0 };
  function renderContacts(contacts: Array<Record<string, unknown>>) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ contacts, pagination: { total: contacts.length } })));
    render(<QueryClientProvider client={client}><LiveContactsSurface /></QueryClientProvider>);
  }
  async function rowFor(text: string) {
    return (await screen.findByText(text)).closest("tr")!;
  }
  it("shows the name, then the phone number, then how a web-only contact reached the business", async () => {
    renderContacts([
      { ...base, id: "named", name: "Marie Tremblay", phone: "+14155550100", email: "marie@example.com", channels: ["voice", "sms"] },
      { ...base, id: "phone-only", name: null, phone: "+14155550123", email: null, channels: ["voice"] },
      { ...base, id: "web-voice", name: null, phone: null, email: null, channels: ["web_voice"] },
      { ...base, id: "web-chat", name: null, phone: null, email: null, channels: ["web_chat"] },
    ]);
    const named = within(await rowFor("Marie Tremblay"));
    expect(named.getByText("(415) 555-0100")).toBeTruthy();
    expect(named.getByText("marie@example.com")).toBeTruthy();
    expect(named.getByRole("img", { name: "common:channels.phoneCall" })).toBeTruthy();
    expect(named.getByRole("img", { name: "common:channels.sms" })).toBeTruthy();

    const phoneOnly = within(await rowFor("(415) 555-0123"));
    expect(phoneOnly.getAllByText("(415) 555-0123")).toHaveLength(1);
    expect(phoneOnly.getByRole("img", { name: "common:channels.phoneCall" })).toBeTruthy();

    const webVoice = within(await rowFor("common:contactFallback.webCaller"));
    expect(webVoice.getByRole("img", { name: "common:channels.webCall" })).toBeTruthy();
    expect(webVoice.queryByRole("img", { name: "common:channels.phoneCall" })).toBeNull();

    expect(within(await rowFor("common:contactFallback.websiteVisitor")).getByRole("img", { name: "common:channels.webChat" })).toBeTruthy();
    expect(screen.queryByText("common:contactFallback.unknown")).toBeNull();
  });
  it("keeps the phone number out of the channels column", async () => {
    renderContacts([{ ...base, id: "phone-only", name: "Sam", phone: "+14155550123", email: null, channels: ["voice"] }]);
    const cells = (await rowFor("Sam")).querySelectorAll("td");
    expect(cells[0]!.textContent).toContain("(415) 555-0123");
    expect(cells[1]!.textContent).not.toContain("555");
  });
});
