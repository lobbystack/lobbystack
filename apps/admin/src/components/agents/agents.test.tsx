// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ push: vi.fn(), openUpgrade: vi.fn(), role: "business_owner" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: Record<string, unknown>) => options && "count" in options ? `${key}:${String(options.count)}` : options && "name" in options ? `${key}:${String(options.name)}` : key }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: fixture.push }), usePathname: () => "/agents" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/business-capabilities-provider", () => ({ useBusinessCan: () => () => true }));
vi.mock("@/components/upgrade-plan-dialog-context", () => ({ useUpgradePlanDialogOpener: () => fixture.openUpgrade }));

import type { AgentListItem } from "@/hooks/use-agents";
import { AgentActionsMenu } from "./agent-actions";
import { AgentsPage } from "./agents-page";

const agent = (id: string, name: string, extra: Partial<AgentListItem> = {}): AgentListItem => ({ id, name, isDefault: false, paused: false, phoneNumbers: 0, widgetKeys: 0, instagramAccounts: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...extra });
const front = agent("a1", "Front desk", { isDefault: true, phoneNumbers: 2, widgetKeys: 1 });
const weekend = agent("a2", "Weekend", { paused: true, instagramAccounts: 1 });
const night = agent("a3", "Night");

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init?.method) return Response.json(url.startsWith("/api/agents") ? [front, weekend, night] : { businesses: [{ businessId: "business", active: true, role: fixture.role }] });
    return Response.json({ id: "a9", name: "New" }, { status: 201 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); fixture.push.mockReset(); fixture.openUpgrade.mockReset(); });

function renderWith(node: React.ReactNode, agents: AgentListItem[] | null = [front, weekend, night]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: fixture.role }] });
  if (agents) client.setQueryData(["agents", "business"], agents);
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const calls = (method: string) => fetchMock.mock.calls.filter(([, init]) => init?.method === method);

it("lists each agent with its channels, and marks the default and paused ones", () => {
  renderWith(<AgentsPage />);
  const rows = screen.getAllByRole("link").map((link) => link.closest("[data-slot=item]") as HTMLElement);
  expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/agents/a1", "/agents/a2", "/agents/a3"]);
  expect(within(rows[0]!).getByText("agents.default")).toBeTruthy();
  expect(within(rows[0]!).getByText(/agents.channelCounts.phone:2/u)).toBeTruthy();
  expect(within(rows[1]!).getByText("agents.paused")).toBeTruthy();
  expect(within(rows[2]!).getByText("agentMenu.noChannels")).toBeTruthy();
  fireEvent.click(within(rows[1]!).getByRole("button", { name: "agents.upgrade" }));
  expect(fixture.openUpgrade).toHaveBeenCalled();
});

it("holds the list's place while the agents load", () => {
  fetchMock.mockImplementation(() => new Promise(() => undefined));
  renderWith(<AgentsPage />, null);
  expect(screen.getByTestId("agents-loading").getAttribute("aria-busy")).toBe("true");
  expect(screen.queryByRole("link")).toBeNull();
});

it("adds an agent as a copy of the default agent and opens it", async () => {
  renderWith(<AgentsPage />);
  fireEvent.click(screen.getByRole("button", { name: "agents.add" }));
  fireEvent.change(screen.getByLabelText("agents.nameLabel"), { target: { value: " Spa " } });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "agents.add" }));
  await waitFor(() => expect(fixture.push).toHaveBeenCalledWith("/agents/a9"));
  expect(JSON.parse(calls("POST")[0]![1]!.body as string)).toEqual({ name: "Spa", copyFromAgentId: "a1" });
  expect(calls("POST")[0]![0]).toBe("/api/agents?businessId=business");
});

it("opens the plan picker when the plan has no room for another agent", async () => {
  fetchMock.mockImplementation(async () => Response.json({ error: "Your plan includes no more agents.", code: "agent_limit_reached" }, { status: 402 }));
  renderWith(<AgentsPage />);
  fireEvent.click(screen.getByRole("button", { name: "agents.add" }));
  fireEvent.change(screen.getByLabelText("agents.nameLabel"), { target: { value: "Spa" } });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "agents.add" }));
  await waitFor(() => expect(fixture.openUpgrade).toHaveBeenCalled());
  expect(fixture.push).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("hides adding agents from people who can't manage the business", () => {
  fixture.role = "business_viewer";
  try {
    renderWith(<AgentsPage />);
    expect(screen.queryByRole("button", { name: "agents.add" })).toBeNull();
  } finally { fixture.role = "business_owner"; }
});

async function openActions(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `agents.moreActions:${name}` }));
  return await screen.findByRole("menu");
}

it("won't remove the default agent", async () => {
  renderWith(<AgentActionsMenu agentId="a1" />);
  const menu = await openActions("Front desk");
  expect(within(menu).getByRole("menuitem", { name: /agents.remove/u }).getAttribute("aria-disabled")).toBe("true");
  expect(within(menu).queryByRole("menuitem", { name: "agents.makeDefault" })).toBeNull();
});

it("removes an agent after confirming, moving its channels to the agent picked", async () => {
  renderWith(<AgentActionsMenu agentId="a2" />);
  const menu = await openActions("Weekend");
  fireEvent.click(within(menu).getByRole("menuitem", { name: /agents.remove/u }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("agents.removeDescriptionPick")).toBeTruthy();
  // Its own knowledge doesn't move: removing it deletes it.
  expect(within(dialog).getByText("agents.removeKnowledge")).toBeTruthy();
  expect(calls("DELETE")).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "agents.remove" }));
  await waitFor(() => expect(calls("DELETE")).toHaveLength(1));
  expect(calls("DELETE")[0]![0]).toBe("/api/agents/a2?businessId=business");
  expect(JSON.parse(calls("DELETE")[0]![1]!.body as string)).toEqual({ reassignToAgentId: "a1" });
  await waitFor(() => expect(fixture.push).toHaveBeenCalledWith("/agents"));
});

it("makes another agent the default", async () => {
  renderWith(<AgentActionsMenu agentId="a3" />);
  const menu = await openActions("Night");
  fireEvent.click(within(menu).getByRole("menuitem", { name: "agents.makeDefault" }));
  await waitFor(() => expect(calls("POST")[0]![0]).toBe("/api/agents/a3/default?businessId=business"));
});

it("offers only Add agent while there's one agent", () => {
  renderWith(<AgentActionsMenu agentId="a1" />, [front]);
  expect(screen.getByRole("button", { name: "agents.add" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /agents.moreActions/u })).toBeNull();
});
