// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ push: vi.fn(), capabilities: ["activity", "setup", "team", "billing", "api_keys", "mcp"] as string[] }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: Record<string, unknown>) => options && !options.returnObjects ? `${key}:${Object.values(options).map(String).join("|")}` : options?.returnObjects ? undefined : key }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: fixture.push }) }));
vi.mock("@/components/business-capabilities-provider", () => ({ useBusinessCan: () => (capability: string) => fixture.capabilities.includes(capability), useOpensPartnerBilling: () => false }));

import { SearchButton } from "@/components/navigation/search-button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SearchDialog } from "./search-dialog";

let fetchMock: ReturnType<typeof vi.fn>;

function setup({ pendingLive = false } = {}) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/businesses")) return Response.json({ businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
    if (pendingLive && (url.startsWith("/api/contacts") || url.startsWith("/api/inbox"))) return await new Promise<Response>(() => undefined);
    if (url.startsWith("/api/contacts")) return Response.json({ contacts: [{ id: "c1", name: "Marie Tremblay", phone: null, email: null }] });
    if (url.startsWith("/api/inbox")) return Response.json({ items: [{ key: "call:k1", kind: "call", id: "k1", channel: "phone_call", agent: null, contactName: "Marie Tremblay", contactPhone: null, contactEmail: null, preview: null, outcome: null, status: "completed", automationState: null, occurredAt: "2026-11-02T15:00:00Z" }], nextCursor: null, agents: [] });
    if (url.startsWith("/api/knowledge/snippets")) return Response.json({ snippets: [{ id: "s1", title: "Parking rules" }] });
    if (url.startsWith("/api/knowledge")) return Response.json({ documents: [{ id: "d1", title: "Price list" }] });
    if (url.startsWith("/api/catalog")) return Response.json({ currency: "CAD", services: [{ id: "v1", name: "Deep cleaning" }, { id: "v2", name: "Whitening" }] });
    if (url.startsWith("/api/employees")) return Response.json({ employees: url.includes("search=marie") ? [{ id: "e1", name: "Marie Roy" }] : [], services: [], today: "", pagination: { total: 0 } });
    if (url.startsWith("/api/rules")) return Response.json([{ id: "r1", title: "Never quote prices for cleaning" }]);
    if (url.startsWith("/api/agents")) return Response.json([{ id: "a1", name: "Front desk", isDefault: true, paused: false, phoneNumbers: 0, widgetKeys: 0, instagramAccounts: 0, createdAt: "", updatedAt: "" }]);
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  render(<QueryClientProvider client={client}><SidebarProvider><SearchButton /><SearchDialog businessId="business" /></SidebarProvider></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); fixture.capabilities = ["activity", "setup", "team", "billing", "api_keys", "mcp"]; });

async function type(text: string) {
  fireEvent.click(screen.getByRole("button", { name: /search.button/u }));
  const input = await screen.findByRole("combobox");
  fireEvent.change(input, { target: { value: text } });
  return input;
}

const urls = (prefix: string) => fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith(prefix));

it("shows the sidebar's button once the dialog is there, and opens with ⌘K", async () => {
  setup();
  expect(screen.getByRole("button", { name: /search.button/u })).toBeTruthy();
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true })); });
  expect(await screen.findByRole("combobox")).toBeTruthy();
});

it("finds a settings page by a word that means it, and opens it with Enter", async () => {
  setup();
  const input = await type("invoice");
  const option = await screen.findByRole("option", { name: /settingsPages.billing/u });
  expect(option.getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(fixture.push).toHaveBeenCalledWith("/workspace/billing");
});

it("finds agents for people who set them up", async () => {
  setup();
  await type("front");
  await waitFor(() => expect(screen.getByRole("option", { name: /Front desk/u })).toBeTruthy());
});

it("finds contacts and conversations through their pages' APIs", async () => {
  setup();
  await type("marie");
  const contacts = await screen.findByRole("group", { name: "search.groups.contacts" });
  expect(within(contacts).getByRole("option", { name: /Marie Tremblay/u })).toBeTruthy();
  const conversations = screen.getByRole("group", { name: "search.groups.conversations" });
  fireEvent.click(within(conversations).getByRole("option", { name: /Marie Tremblay/u }));
  expect(fixture.push).toHaveBeenCalledWith("/inbox?call=k1");
  expect(urls("/api/contacts")[0]).toBe("/api/contacts?businessId=business&limit=4&search=marie");
  expect(urls("/api/inbox")[0]).toBe("/api/inbox?businessId=business&limit=4&search=marie");
});

it("holds the contacts and conversations' place while they load", async () => {
  setup({ pendingLive: true });
  await type("marie");
  expect((await screen.findByTestId("search-live-loading")).getAttribute("aria-busy")).toBe("true");
  expect(screen.queryByText(/search.empty/u)).toBeNull();
});

it("gives an activity-only business no agents or setup pages, and still its contacts", async () => {
  fixture.capabilities = ["activity"];
  setup();
  await type("front");
  await screen.findByText(/search.empty/u);
  expect(urls("/api/agents")).toEqual([]);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "marie" } });
  expect(await screen.findByRole("group", { name: "search.groups.contacts" })).toBeTruthy();
});

it("says when nothing matches", async () => {
  fixture.capabilities = [];
  setup();
  await type("zzzz");
  expect(await screen.findByText("search.empty:zzzz")).toBeTruthy();
  expect(urls("/api/contacts")).toEqual([]);
});

it("suggests the pages and agents the person may open before anything is typed, each with where it lives", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: /search.button/u }));
  const pages = await screen.findByRole("group", { name: "search.groups.pages" });
  const names = within(pages).getAllByRole("option").map((option) => option.textContent);
  expect(names.slice(0, 6)).toEqual(["items.home", "items.inbox", "items.appointments", "items.contacts", "items.analytics", "items.agents"]);
  expect(names).toContain("items.business›settingsPages.knowledge");
  expect(names).toContain("items.settings›settingsPages.team");
  const agents = await screen.findByRole("group", { name: "search.groups.agents" });
  await waitFor(() => expect(within(agents).getByRole("option", { name: /Front desk/u })).toBeTruthy());
  // The first row is highlighted and opens with Enter.
  expect(within(pages).getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
  expect(fixture.push).toHaveBeenCalledWith("/inbox");
  expect(urls("/api/contacts")).toEqual([]);
});

it("suggests only what an activity-only business may open", async () => {
  fixture.capabilities = ["activity"];
  setup();
  fireEvent.click(screen.getByRole("button", { name: /search.button/u }));
  const pages = await screen.findByRole("group", { name: "search.groups.pages" });
  const names = within(pages).getAllByRole("option").map((option) => option.textContent);
  expect(names).toContain("items.inbox");
  for (const hidden of ["items.analytics", "items.agents", "items.business›settingsPages.knowledge"]) expect(names).not.toContain(hidden);
  expect(screen.queryByRole("group", { name: "search.groups.agents" })).toBeNull();
});

it("closes from the Esc key badge", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: /search.button/u }));
  await screen.findByRole("combobox");
  fireEvent.click(screen.getByRole("button", { name: "search.keys.close" }));
  await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
});

it("finds knowledge, services, employees and each agent's rules by name, and opens their page", async () => {
  setup();
  await type("cleaning");
  const services = await screen.findByRole("group", { name: "search.groups.services" });
  expect(within(services).getAllByRole("option").map((option) => option.textContent)).toEqual(["items.business › settingsPages.services›Deep cleaning"]);
  const rules = await screen.findByRole("group", { name: "search.groups.rules" });
  fireEvent.click(within(rules).getByRole("option", { name: /Never quote prices/u }));
  expect(fixture.push).toHaveBeenCalledWith("/agents/a1/rules");
  cleanup();
  setup();
  await type("parking");
  fireEvent.click(within(await screen.findByRole("group", { name: "search.groups.knowledge" })).getByRole("option", { name: /Parking rules/u }));
  expect(fixture.push).toHaveBeenCalledWith("/business/knowledge");
  cleanup();
  setup();
  await type("marie");
  expect(within(await screen.findByRole("group", { name: "search.groups.employees" })).getByRole("option", { name: /Marie Roy/u })).toBeTruthy();
  expect(urls("/api/employees")).toContain("/api/employees?businessId=business&limit=4&offset=0&search=marie");
});

it("leaves knowledge, services, employees and rules out for an activity-only business", async () => {
  fixture.capabilities = ["activity"];
  setup();
  await type("cleaning");
  await screen.findByText(/search.empty/u);
  for (const prefix of ["/api/knowledge", "/api/catalog", "/api/employees", "/api/rules"]) expect(urls(prefix)).toEqual([]);
});
