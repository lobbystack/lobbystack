// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentShell } from "./agent-shell";

const route = vi.hoisted(() => ({ pathname: "/agent/services" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
afterEach(cleanup);

describe("agent section headings", () => {
  it("shows the Services title with no count", () => {
    render(<AgentShell>content</AgentShell>);
    expect(screen.getByRole("heading", { name: "sections.services.title" }).textContent).toBe("sections.services.title");
  });
});

describe("header actions before the page mounts", () => {
  const placeholders = (html: string) => html.match(/data-slot="skeleton"/g)?.length ?? 0;

  it("renders a search and button placeholder in the server markup for pages with header actions", () => {
    for (const pathname of ["/agent/knowledge", "/agent/services", "/agent/employees", "/agent/rules"]) {
      route.pathname = pathname;
      expect(placeholders(renderToString(<AgentShell>content</AgentShell>))).toBe(2);
    }
  });

  it("sizes the button placeholder from each page's own button label", () => {
    const labels = { knowledge: "sections.knowledge.addKnowledge", services: "sections.services.addKnowledge", employees: "add.button", rules: "sections.rules.addKnowledge" };
    for (const [section, label] of Object.entries(labels)) {
      route.pathname = `/agent/${section}`;
      expect(renderToString(<AgentShell>content</AgentShell>)).toContain(`<span class="invisible">${label}</span>`);
    }
  });

  it("leaves the header empty on Basic settings, which has no header actions", () => {
    route.pathname = "/agent/basic-settings";
    expect(placeholders(renderToString(<AgentShell>content</AgentShell>))).toBe(0);
  });

  it("drops the placeholders once the header slot is mounted", () => {
    route.pathname = "/agent/knowledge";
    const { container } = render(<AgentShell>content</AgentShell>);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(0);
  });
});
