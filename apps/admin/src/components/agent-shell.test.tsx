// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerTestWindow } from "@/lib/test-window";
import { AgentShell } from "./agent-shell";
import { AccountLevelShell, BusinessLevelShell, WorkspaceLevelShell } from "./settings-level-shell";

const route = vi.hoisted(() => ({ pathname: "/agents/agent-1/rules" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
afterEach(cleanup);

const agent = { id: "agent-1", name: "Front desk" };
function withQueries(node: React.ReactNode) {
  const client = new QueryClient();
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  client.setQueryData(["agent-settings", "business", "agent-1"], { business: null, profile: { name: "Evenings" } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}
const placeholders = (html: string) => html.match(/data-slot="skeleton"/g)?.length ?? 0;

describe("agent page headings", () => {
  it("names the agent on its own page, with a rename once it's saved", () => {
    route.pathname = "/agents/agent-1";
    render(withQueries(<AgentShell agent={agent}>content</AgentShell>));
    expect(screen.getByRole("heading").textContent).toBe("Evenings");
  });

  it("titles each section page with the section", () => {
    for (const [pathname, title] of [["/agents/agent-1/knowledge", "nav:agentPages.knowledge"], ["/agents/agent-1/channels/phone", "nav:agentPages.phone"], ["/agents/agent-1/rules", "nav:agentPages.rules"]]) {
      route.pathname = pathname!;
      render(withQueries(<AgentShell agent={agent}>content</AgentShell>));
      expect(screen.getByRole("heading").textContent).toBe(title);
      cleanup();
    }
  });
});

describe("header actions before the page mounts", () => {
  it("renders a Test call placeholder in the server markup on every agent page, and an add rule placeholder for Rules", () => {
    route.pathname = "/agents/agent-1/rules";
    const html = renderToString(withQueries(<AgentShell agent={agent}>content</AgentShell>));
    expect(placeholders(html)).toBe(2);
    expect(html).toContain('<span class="invisible">testCall.trigger</span>');
    expect(html).toContain('<span class="invisible">agent:sections.rules.addKnowledge</span>');
    route.pathname = "/agents/agent-1/channels";
    expect(placeholders(renderToString(withQueries(<AgentShell agent={agent}>content</AgentShell>)))).toBe(1);
  });

  it("sizes each Business page's button placeholder from its own button label", () => {
    const labels = { knowledge: "agent:sections.knowledge.addKnowledge", services: "agent:sections.services.addKnowledge", employees: "employees:add.button" };
    for (const [section, label] of Object.entries(labels)) {
      route.pathname = `/business/${section}`;
      const html = renderToString(<BusinessLevelShell>content</BusinessLevelShell>);
      expect(placeholders(html)).toBe(1);
      expect(html).toContain(`<span class="invisible">${label}</span>`);
    }
  });

  it("leaves the header empty on settings pages without header actions", () => {
    route.pathname = "/business";
    expect(placeholders(renderToString(<BusinessLevelShell>content</BusinessLevelShell>))).toBe(0);
    route.pathname = "/workspace/team";
    expect(placeholders(renderToString(<WorkspaceLevelShell>content</WorkspaceLevelShell>))).toBe(0);
    route.pathname = "/account";
    expect(placeholders(renderToString(<AccountLevelShell>content</AccountLevelShell>))).toBe(0);
  });

  it("drops the placeholders once the header slot is mounted", () => {
    route.pathname = "/business/knowledge";
    const { container } = render(<BusinessLevelShell>content</BusinessLevelShell>);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(0);
    cleanup();
    route.pathname = "/agents/agent-1/rules";
    const opened: unknown[] = [];
    const unregister = registerTestWindow((options) => opened.push(options));
    expect(render(withQueries(<AgentShell agent={agent}>content</AgentShell>)).container.querySelectorAll('[data-slot="skeleton"]').length).toBe(0);
    screen.getByRole("button", { name: "testCall.trigger" }).click();
    expect(opened).toEqual([{ agentId: "agent-1" }]);
    unregister();
  });
});

describe("settings level headings", () => {
  it("titles each page with its name in the settings menu", () => {
    for (const [pathname, title, Shell] of [["/business", "nav:settingsPages.business", BusinessLevelShell], ["/business/integrations", "nav:settingsPages.connections", BusinessLevelShell], ["/workspace/webhooks", "nav:settingsPages.webhooks", WorkspaceLevelShell], ["/account/appearance", "nav:settingsPages.appearance", AccountLevelShell], ["/account", "nav:settingsPages.profile", AccountLevelShell]] as const) {
      route.pathname = pathname;
      render(<Shell>content</Shell>);
      expect(screen.getByRole("heading").textContent).toBe(title);
      cleanup();
    }
  });
});
