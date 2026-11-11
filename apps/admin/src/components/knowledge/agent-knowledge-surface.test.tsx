// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { KnowledgeSource } from "@/hooks/use-knowledge-sources";
import { AgentKnowledgeSurface } from "./agent-knowledge-surface";

vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => ({ track: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/agents/agent-1/knowledge", useSearchParams: () => new URLSearchParams() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

const at = "2026-09-01T12:00:00Z";
function source(input: Partial<KnowledgeSource> & Pick<KnowledgeSource, "kind" | "id" | "title">): KnowledgeSource {
  return { sourceUrl: null, agentId: null, active: true, status: "indexed", error: null, preview: "Text", createdAt: at, updatedAt: at, processingProgress: 100, revision: 1, ...input };
}

function setup({ own = [] as KnowledgeSource[], shared = [] as KnowledgeSource[], seed = true } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  if (seed) client.setQueryData(["knowledge-sources", "business", "agent-1"], { own, shared });
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => seed || init?.method ? Response.json({ ok: true, changed: 1, snippetId: "new" }) : new Promise<Response>(() => undefined));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><AgentKnowledgeSurface agentId="agent-1" /></QueryClientProvider>);
  return fetchMock;
}
const bodies = (fetchMock: ReturnType<typeof setup>, path: string) => fetchMock.mock.calls.filter(([url, init]) => url.startsWith(path) && init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)));

describe("an agent's Specific knowledge", () => {
  it("lists this agent's own sources apart from the shared ones", () => {
    setup({ own: [source({ kind: "text", id: "night", title: "Night door", agentId: "agent-1" })], shared: [source({ kind: "file", id: "menu", title: "Menu", agentActive: true })] });
    const own = screen.getByRole("region", { name: "sections.knowledge.agent.ownTitle" });
    const shared = screen.getByRole("region", { name: "sections.knowledge.agent.sharedTitle" });
    expect(within(own).getByText("Night door")).toBeTruthy();
    expect(within(shared).getByText("Menu")).toBeTruthy();
    expect(within(shared).getByText("sections.knowledge.agent.manageShared").closest("a")?.getAttribute("href")).toBe("/business/knowledge");
  });

  it("adds an entry for this agent alone", async () => {
    const fetchMock = setup();
    await userEvent.click(screen.getByRole("button", { name: "sections.knowledge.addKnowledge" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "sections.knowledge.addKnowledgeOptions.text" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/fields.title.label/), "Night door");
    await userEvent.type(within(dialog).getByLabelText(/fields.content.label/), "Ring the side bell.");
    await userEvent.click(within(dialog).getByRole("button", { name: /actions.add|actions.save/ }));
    await waitFor(() => expect(bodies(fetchMock, "/api/knowledge/snippets")).toEqual([expect.objectContaining({ title: "Night door", content: "Ring the side bell.", agentId: "agent-1" })]));
  });

  it.each([
    [{ error: "In shared.", code: "knowledge_website_in_shared" }, "sections.knowledge.websiteImport.inShared"],
    [{ error: "In Evening.", code: "knowledge_website_in_agent", agentName: "Evening" }, "sections.knowledge.websiteImport.inAgent"],
  ])("explains a website that's already in another scope: %j", async (body, message) => {
    const fetchMock = setup();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => url.startsWith("/api/knowledge?") && init?.method === "POST" ? Response.json(body, { status: 409 }) : Response.json({ ok: true }));
    await userEvent.click(screen.getByRole("button", { name: "sections.knowledge.addKnowledge" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "sections.knowledge.addKnowledgeOptions.website" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/fields.websiteUrl.label/), "harbor.example");
    await userEvent.click(within(dialog).getByRole("button", { name: /websiteImport.submit/ }));
    expect(await within(dialog).findByText(message)).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.startsWith("/api/knowledge?") && init?.method === "POST")?.[1]?.body))).toMatchObject({ sourceUrl: "https://harbor.example", agentId: "agent-1" });
  });

  it("turns a shared source off for this agent with its switch", async () => {
    const fetchMock = setup({ shared: [source({ kind: "file", id: "menu", title: "Menu", agentActive: true })] });
    await userEvent.click(screen.getByRole("switch", { name: "sections.knowledge.agent.useSource" }));
    await waitFor(() => expect(bodies(fetchMock, "/api/knowledge/sources/actions")).toEqual([{ action: "agent_disable", items: [{ type: "file", id: "menu" }], agentId: "agent-1" }]));
  });

  it("turns several shared sources back on for this agent at once", async () => {
    const fetchMock = setup({ shared: [source({ kind: "file", id: "menu", title: "Menu", agentActive: false }), source({ kind: "text", id: "faq", title: "Parking", agentActive: false })] });
    const shared = screen.getByRole("region", { name: "sections.knowledge.agent.sharedTitle" });
    expect(within(shared).getAllByText("table.disabled")).toHaveLength(2);
    await userEvent.click(within(shared).getByRole("button", { name: "sections.knowledge.selection.select" }));
    await userEvent.click(within(shared).getByRole("checkbox", { name: "sections.knowledge.selection.selectAll" }));
    await userEvent.click(within(shared).getByRole("button", { name: "sections.knowledge.batch.agentEnable" }));
    await waitFor(() => expect(bodies(fetchMock, "/api/knowledge/sources/actions")).toEqual([{ action: "agent_enable", items: [{ type: "file", id: "menu" }, { type: "snippet", id: "faq" }], agentId: "agent-1" }]));
  });

  it("can't turn on for this agent a shared source the business turned off", () => {
    setup({ shared: [source({ kind: "file", id: "menu", title: "Menu", active: false, agentActive: true })] });
    expect((screen.getByRole("switch", { name: "sections.knowledge.agent.useSource" }) as HTMLElement).getAttribute("data-disabled")).not.toBeNull();
  });

  it("waits with a placeholder for both sections", () => {
    setup({ seed: false });
    const busy = document.querySelector("[aria-busy='true']");
    expect(busy).not.toBeNull();
    expect(busy!.querySelectorAll("table")).toHaveLength(2);
    expect(busy!.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });
});
