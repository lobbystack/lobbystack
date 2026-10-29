// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
