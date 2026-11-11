// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ push: vi.fn(), search: "", role: "business_owner", toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: Record<string, unknown>) => options ? `${key}:${Object.values(options).map(String).join("|")}` : key }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: fixture.push }), useSearchParams: () => new URLSearchParams(fixture.search) }));
vi.mock("sonner", () => ({ toast: fixture.toast }));
vi.mock("@/components/business-capabilities-provider", () => ({ useBusinessCan: () => () => true }));

import type { AgentListItem } from "@/hooks/use-agents";
import { ChannelsSection } from "./channels-section";

const agent = (id: string, name: string, extra: Partial<AgentListItem> = {}): AgentListItem => ({ id, name, isDefault: false, paused: false, phoneNumbers: 0, widgetKeys: 0, instagramAccounts: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...extra });
const FRONT = agent("a1", "Front desk", { isDefault: true });
const WEEKEND = agent("a2", "Weekend");
const NUMBER = { id: "n1", e164: "+15145550100", agentId: null, voiceEnabled: true, smsEnabled: true, status: "active", reclaimScheduledAt: null, reclaimReason: null };
const RELEASED = { ...NUMBER, id: "n2", e164: "+15145550199", status: "released" };

type Data = { numbers?: unknown[]; keys?: unknown[]; issuanceEnabled?: boolean; instagram?: unknown };
let fetchMock: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;

function setup(agentId: string, data: Data = {}, { widgetsEnabled = true, pending = false } = {}) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (pending) return await new Promise<Response>(() => undefined);
    if (url.startsWith("/api/businesses")) return Response.json({ businesses: [{ businessId: "business", active: true, role: fixture.role }] });
    if (url.startsWith("/api/phone-numbers")) return Response.json({ phoneNumbers: data.numbers ?? [] });
    if (url.startsWith("/api/widget-keys") && !init?.method) return Response.json({ keys: data.keys ?? [], issuanceEnabled: data.issuanceEnabled ?? true });
    if (url.startsWith("/api/widget-keys")) return Response.json({ ok: true, key: { id: "k9", key: "pk" } });
    if (url.startsWith("/api/integrations/instagram/start")) return Response.json({ url: "https://instagram.example/oauth" });
    if (url.startsWith("/api/integrations/instagram")) return Response.json(init?.method === "DELETE" ? { disconnected: true } : data.instagram ?? { configured: true, account: null });
    if (url.startsWith("/api/agents")) return Response.json(init?.method ? { ok: true } : [FRONT, WEEKEND]);
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: fixture.role }] });
  client.setQueryData(["agents", "business"], [FRONT, WEEKEND]);
  render(<QueryClientProvider client={client}><ChannelsSection agentId={agentId} widgetsEnabled={widgetsEnabled} /></QueryClientProvider>);
}

beforeEach(() => {
  assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); fixture.search = ""; fixture.role = "business_owner"; });

const calls = (method: string, prefix: string) => fetchMock.mock.calls.filter(([url, init]) => (init as RequestInit | undefined)?.method === method && String(url).startsWith(prefix));

it("holds a row for each kind of channel while they load", () => {
  setup("a1", {}, { pending: true });
  expect(screen.getByTestId("channels-loading").getAttribute("aria-busy")).toBe("true");
  expect(screen.getByTestId("channels-loading").querySelectorAll("[data-slot=item]")).toHaveLength(3);
  expect(screen.queryByRole("button")).toBeNull();
});

it("lists the default agent's number, including one with no agent, and leaves out released ones", async () => {
  setup("a1", { numbers: [NUMBER, RELEASED] });
  expect(await screen.findByText("(514) 555-0100")).toBeTruthy();
  expect(screen.queryByText("(514) 555-0199")).toBeNull();
  expect(screen.getByText("nav:channels.manage").closest("a")?.getAttribute("href")).toBe("/agents/a1/channels/phone");
  // A number only moves; releasing it stays on its own page.
  expect(screen.queryAllByRole("button", { name: "nav:channels.disconnect" })).toHaveLength(0);
});

it("moves a number to another agent once the person confirms", async () => {
  setup("a1", { numbers: [NUMBER] });
  fireEvent.click(await screen.findByRole("button", { name: "channels.moveTo" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Weekend" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("nav:channels.moveDescription:Weekend")).toBeTruthy();
  expect(calls("PUT", "/api/agents/channels")).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "nav:channels.move" }));
  await waitFor(() => expect(calls("PUT", "/api/agents/channels")).toHaveLength(1));
  expect(JSON.parse(calls("PUT", "/api/agents/channels")[0]![1].body as string)).toEqual({ kind: "phone_number", id: "n1", agentId: "a2" });
});

it("lets a second agent take over a number, and offers no number of its own", async () => {
  setup("a2", { numbers: [NUMBER] });
  expect(await screen.findByText("nav:channels.noNumber")).toBeTruthy();
  expect(screen.queryByText("nav:channels.getNumber")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /nav:channels.moveHere/u }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /\(514\) 555-0100/u }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "nav:channels.move" }));
  await waitFor(() => expect(JSON.parse(calls("PUT", "/api/agents/channels")[0]![1].body as string)).toEqual({ kind: "phone_number", id: "n1", agentId: "a2" }));
});

it("sends the default agent with no number to get one", async () => {
  setup("a1");
  expect((await screen.findByText("nav:channels.getNumber")).closest("a")?.getAttribute("href")).toBe("/agents/a1/channels/phone");
});

it("opens the new widget form for the agent", async () => {
  setup("a2");
  expect((await screen.findByText("nav:channels.addToWebsite")).closest("a")?.getAttribute("href")).toBe("/agents/a2/channels/widget?add=1");
});

it("offers no widget when the server makes none", async () => {
  setup("a2", { issuanceEnabled: false });
  expect(await screen.findByText("nav:channels.noWidget")).toBeTruthy();
  expect(screen.queryByText("nav:channels.addToWebsite")).toBeNull();
  cleanup();
  setup("a2", {}, { widgetsEnabled: false });
  await screen.findByText("nav:channels.noNumber");
  expect(screen.queryByText("nav:channels.noWidget")).toBeNull();
});

it("disconnects a widget only after the person confirms", async () => {
  setup("a2", { keys: [{ id: "k1", agentId: "a2", label: "Main site", status: "active" }, { id: "k2", agentId: "a1", label: "Other", status: "active" }] });
  expect(await screen.findByText("Main site")).toBeTruthy();
  expect(screen.queryByText("Other")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "nav:channels.disconnect" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(calls("PATCH", "/api/widget-keys")).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "nav:channels.disconnect" }));
  await waitFor(() => expect(calls("PATCH", "/api/widget-keys")).toHaveLength(1));
  expect(calls("PATCH", "/api/widget-keys")[0]![0]).toBe("/api/widget-keys?businessId=business&id=k1");
  expect(JSON.parse(calls("PATCH", "/api/widget-keys")[0]![1].body as string)).toEqual({ status: "revoked" });
});

it("connects Instagram to this agent", async () => {
  setup("a2");
  fireEvent.click(await screen.findByRole("button", { name: "nav:channels.connectInstagram" }));
  await waitFor(() => expect(assign).toHaveBeenCalledWith("https://instagram.example/oauth"));
  expect(fetchMock).toHaveBeenCalledWith("/api/integrations/instagram/start?businessId=business&agentId=a2", expect.anything());
});

it("offers to move Instagram here when another agent answers it", async () => {
  setup("a2", { instagram: { configured: true, account: { id: "ig1", username: "salon", status: "connected", connectedAt: "2026-01-01T00:00:00Z", agentId: "a1" } } });
  expect(await screen.findByText("nav:channels.answersAs:Front desk")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "nav:channels.connectInstagram" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "nav:channels.moveHere" }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "nav:channels.move" }));
  await waitFor(() => expect(JSON.parse(calls("PUT", "/api/agents/channels")[0]![1].body as string)).toEqual({ kind: "instagram_account", id: "ig1", agentId: "a2" }));
});

it("disconnects Instagram only after the person confirms", async () => {
  setup("a1", { instagram: { configured: true, account: { id: "ig1", username: "salon", status: "connected", connectedAt: "2026-01-01T00:00:00Z", agentId: null } } });
  fireEvent.click(await screen.findByRole("button", { name: "nav:channels.disconnect" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("nav:channels.disconnectInstagramDescription:Front desk|@salon")).toBeTruthy();
  expect(calls("DELETE", "/api/integrations/instagram")).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "nav:channels.disconnect" }));
  await waitFor(() => expect(calls("DELETE", "/api/integrations/instagram")).toHaveLength(1));
});

it("hides Instagram until the server has a Meta app, and says how a sign-in went", async () => {
  fixture.search = "instagram=in_use";
  setup("a1", { instagram: { configured: false, account: null } });
  await screen.findByText("nav:channels.getNumber");
  expect(screen.queryByText("common:channels.instagram")).toBeNull();
  expect(fixture.toast.error).toHaveBeenCalledWith("settings:integrations.instagram.accountInUse");
});

it("shows channels without actions to people who can't manage the business", async () => {
  fixture.role = "business_viewer";
  setup("a1", { numbers: [NUMBER] });
  await screen.findByText("(514) 555-0100");
  expect(screen.queryByRole("button", { name: "channels.moveTo" })).toBeNull();
  expect(screen.queryByRole("button", { name: "nav:channels.connectInstagram" })).toBeNull();
});
