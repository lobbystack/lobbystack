// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ capabilities: ["activity", "setup"] as string[] }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/business-capabilities-provider", () => ({ useBusinessCan: () => (capability: string) => fixture.capabilities.includes(capability) }));
vi.mock("@/components/agents/channels-section", () => ({ ChannelsSection: ({ agentId, widgetsEnabled }: { agentId: string; widgetsEnabled: boolean }) => <p>channels for {agentId}{widgetsEnabled ? " with widgets" : ""}</p> }));

import { AgentChannelsPage, AgentSharedPage } from "./agent-pages";

afterEach(cleanup);

function renderWith(node: React.ReactNode) {
  const client = new QueryClient();
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const hrefs = () => screen.getAllByRole("link").map((link) => link.getAttribute("href"));

it("shows the agent's channels, with widgets when the server makes them", () => {
  renderWith(<AgentChannelsPage agentId="agent-2" widgetsEnabled />);
  expect(screen.getByText("channels for agent-2 with widgets")).toBeTruthy();
  cleanup();
  renderWith(<AgentChannelsPage agentId="agent-2" widgetsEnabled={false} />);
  expect(screen.getByText("channels for agent-2")).toBeTruthy();
});

it("lists the workspace pages every agent shares", () => {
  renderWith(<AgentSharedPage />);
  expect(hrefs()).toEqual(["/workspace/business", "/workspace/knowledge", "/workspace/services", "/workspace/employees", "/workspace/connections"]);
});
