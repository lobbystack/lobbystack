// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import common from "../../../public/locales/en/common.json";
import type { KnowledgeSource } from "@/hooks/use-knowledge-sources";
import { useSelection } from "./selection";
import { KnowledgeSourcesTable, useKnowledgeSearch } from "./knowledge-sources-table";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/knowledge", useSearchParams: () => new URLSearchParams() }));
vi.mock("react-i18next", () => ({
  useTranslation: (ns?: string) => ({
    i18n: { language: "en", resolvedLanguage: "en" },
    t: (key: string, options?: { query?: string }) => ns === "common" ? String((common.tableSearch as Record<string, string>)[key.replace("tableSearch.", "")] ?? key).replace("{{query}}", options?.query ?? "") : key,
  }),
}));

afterEach(() => cleanup());

const at = "2026-09-01T12:00:00Z";
function source(input: Partial<KnowledgeSource> & Pick<KnowledgeSource, "kind" | "id" | "title">): KnowledgeSource {
  return { sourceUrl: null, agentId: null, active: true, status: "indexed", error: null, preview: "Text", createdAt: at, updatedAt: at, processingProgress: 100, revision: 1, ...input };
}
const all = [
  source({ kind: "text", id: "hours", title: "Opening hours", preview: "We open at nine" }),
  source({ kind: "website", id: "site", title: "Harbor site", sourceUrl: "https://harbor.example" }),
  source({ kind: "file", id: "menu", title: "Menu", preview: "Soup of the day" }),
];

function Harness() {
  const { rows, search } = useKnowledgeSearch(all);
  const selection = useSelection(rows.map((row) => row.id));
  return <>
    <button onClick={selection.start} type="button">start</button>
    <output data-testid="selected">{[...selection.selected].join(",")}</output>
    <KnowledgeSourcesTable emptyText="Nothing yet" isOff={() => false} label="Knowledge" loading={false} rows={rows} search={search} selection={selection} />
  </>;
}

describe("knowledge search", () => {
  it("matches the title, address and preview", async () => {
    render(<QueryClientProvider client={new QueryClient()}><Harness /></QueryClientProvider>);
    const box = screen.getByRole("textbox", { name: "Search knowledge" });
    await userEvent.type(box, "soup");
    expect(screen.getByText("Menu")).toBeTruthy();
    expect(screen.queryByText("Opening hours")).toBeNull();
    await userEvent.clear(box);
    await userEvent.type(box, "harbor.example");
    expect(screen.getByText("Harbor site")).toBeTruthy();
    expect(screen.queryByText("Menu")).toBeNull();
  });

  it("selects only the matching rows with select all, and says nothing matched", async () => {
    render(<QueryClientProvider client={new QueryClient()}><Harness /></QueryClientProvider>);
    await userEvent.click(screen.getByRole("button", { name: "start" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search knowledge" }), "menu");
    await userEvent.click(screen.getByRole("checkbox", { name: "sections.knowledge.selection.selectAll" }));
    expect(screen.getByTestId("selected").textContent).toBe("menu");
    await userEvent.clear(screen.getByRole("textbox", { name: "Search knowledge" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search knowledge" }), "zzz");
    expect(screen.getByText("No results for “zzz”")).toBeTruthy();
    expect(screen.queryByText("Nothing yet")).toBeNull();
  });
});
