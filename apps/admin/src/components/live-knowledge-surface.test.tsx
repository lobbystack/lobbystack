// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeSource } from "@/hooks/use-knowledge-sources";
import { LiveKnowledgeSurface, websiteImportProgress, type WebsiteImport } from "./live-knowledge-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
const captureBrowserError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/browser-error-reporting", () => ({ captureBrowserError }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/business/knowledge", useSearchParams: () => new URLSearchParams() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string, options?: { count?: number }) => options?.count === undefined ? key : `${key}:${options.count}` }) }));
const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

const at = "2026-09-01T12:00:00Z";
const job = (status: string, extra: Partial<WebsiteImport> = {}): WebsiteImport => ({ id: "job", status, websiteUrl: "https://example.invalid", importedCount: 10, indexedCount: 0, documentCount: 0, crawlFinishedCount: null, crawlTotalCount: null, ...extra });
function source(input: Partial<KnowledgeSource> & Pick<KnowledgeSource, "kind" | "id">): KnowledgeSource {
  return { title: "Clinic hours", sourceUrl: null, agentId: null, active: true, status: "indexed", error: null, preview: "**Clinic** [hours](https://example.invalid)", createdAt: at, updatedAt: at, processingProgress: 100, revision: 1, ...input };
}
const website = (input: Partial<KnowledgeSource> = {}) => source({ kind: "website", id: "site", title: "example.invalid", sourceUrl: "https://example.invalid/", pageCount: 3, pagesOff: 1, websiteImport: job("completed"), ...input });
const pages = [
  { id: "site", title: "Home", sourceUrl: "https://example.invalid/", status: "indexed", error: null, active: true, preview: "", createdAt: at, updatedAt: at, removable: false },
  { id: "team", title: "Team", sourceUrl: "https://example.invalid/team", status: "indexed", error: null, active: true, preview: "", createdAt: at, updatedAt: at, removable: true },
];

function setup({ rows = [source({ kind: "file", id: "document" })] as KnowledgeSource[], role = "business_owner" } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role }] });
  client.setQueryData(["knowledge-sources", "business", null], { own: [], shared: rows });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method) return Response.json({ ok: true, changed: 1 });
    if (url.includes("/pages?")) return Response.json({ source: website(), pages });
    if (url.startsWith("/api/knowledge/document?")) return Response.json({ document: {}, content: "Readable extracted content" });
    if (url.startsWith("/api/knowledge/sources?")) return Response.json({ own: [], shared: rows });
    return Response.json({ questions: [], openCount: 0 });
  }); vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveKnowledgeSurface /></QueryClientProvider>);
  return Object.assign(fetchMock, { client });
}
const actionCall = (fetchMock: ReturnType<typeof setup>) => fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/knowledge/sources/actions")).map(([, init]) => JSON.parse(String(init?.body)));

describe("the business's knowledge, one row per source", () => {
  it("shows a website as one row with its page count, and opens its pages", async () => {
    const fetchMock = setup({ rows: [website(), source({ kind: "file", id: "document" })] });
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByTitle("sections.knowledge.website.pages:3 · sections.knowledge.website.pagesOff:1")).toBeTruthy();
    await userEvent.click(screen.getByText("example.invalid"));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Team")).toBeTruthy();
    // The website's address can't be removed on its own.
    expect(within(dialog).getAllByRole("button", { name: "sections.knowledge.pagesDialog.remove" }).map((button) => (button as HTMLButtonElement).disabled)).toEqual([true, false]);
    const switches = within(dialog).getAllByRole("switch");
    await userEvent.click(switches[1]!);
    await waitFor(() => expect(actionCall(fetchMock)).toEqual([{ action: "disable", items: [{ type: "page", id: "team" }] }]));
  });

  it("re-imports a website and removes one of its pages after confirming", async () => {
    const fetchMock = setup({ rows: [website()] });
    await userEvent.click(screen.getByText("example.invalid"));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Team");
    await userEvent.click(within(dialog).getByRole("button", { name: "sections.knowledge.batch.reimport" }));
    const removes = within(dialog).getAllByRole("button", { name: "sections.knowledge.pagesDialog.remove" });
    expect((removes[0] as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(removes[1]!);
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "sections.knowledge.pagesDialog.removeConfirm" }));
    await waitFor(() => expect(actionCall(fetchMock)).toEqual([{ action: "reimport", items: [{ type: "website", id: "site" }] }, { action: "delete", items: [{ type: "page", id: "team" }] }]));
  });

  it("shows import progress, and lets an import be cancelled after confirming", async () => {
    const fetchMock = setup({ rows: [website({ status: "processing", pageCount: 0, pagesOff: 0, websiteImport: job("crawling", { crawlFinishedCount: 8, crawlTotalCount: 10 }) })] });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("80");
    expect(screen.getByText("sections.knowledge.websiteImport.status.inProgress")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "actions.moreOptions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "actions.cancelImport" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "actions.cancelImport" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/site?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "cancel" }) })));
  });

  it("uses the original crawl and indexing progress bounds", () => {
    const base = { id: "job", websiteUrl: "https://example.invalid", importedCount: 0, indexedCount: 0 };
    expect(websiteImportProgress({ ...base, status: "crawling" })).toBe(12);
    expect(websiteImportProgress({ ...base, status: "indexing" })).toBe(72);
    expect(websiteImportProgress({ ...base, status: "crawling", importedCount: 10, crawlFinishedCount: 20, crawlTotalCount: 10 })).toBe(99);
  });

  it("shows a failed website import", () => {
    setup({ rows: [website({ status: "error", pageCount: 0, pagesOff: 0, websiteImport: job("failed") })] });
    expect(screen.getByText("sections.knowledge.websiteImport.status.failed")).toBeTruthy();
    expect(screen.getByText("sections.knowledge.websiteImport.previewFailed")).toBeTruthy();
  });

  it("turns a file off from its menu, without opening its text", async () => {
    const fetchMock = setup();
    await userEvent.click(screen.getByRole("button", { name: "actions.moreOptions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "sections.knowledge.batch.disable" }));
    await waitFor(() => expect(actionCall(fetchMock)).toEqual([{ action: "disable", items: [{ type: "file", id: "document" }] }]));
    expect(fetchMock.mock.calls.some(([url]) => url.startsWith("/api/knowledge/document?"))).toBe(false);
  });

  it("shows a file's text under its row, and its sanitized preview", async () => {
    setup();
    // Markdown links and images read as plain text.
    expect(screen.getByTitle("**Clinic** hours")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    await userEvent.click(screen.getAllByText("Clinic hours")[0]!);
    expect(await screen.findByDisplayValue("Readable extracted content")).toBeTruthy();
  });

  it("opens an entry with its stored values and saves that entry", async () => {
    const fetchMock = setup({ rows: [source({ kind: "text", id: "snippet", content: "Open weekdays", preview: "Open weekdays", tags: ["hours"], priority: 5 })] });
    await userEvent.click(screen.getByText("Clinic hours"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByDisplayValue("Open weekdays")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "agent:actions.saveChanges" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/snippets/snippet?businessId=business", expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"id":"snippet"') })));
  });

  it("hides the controls that change knowledge from viewers", () => {
    setup({ role: "viewer" });
    expect(screen.queryByRole("button", { name: "sections.knowledge.addKnowledge" })).toBeNull();
    expect(screen.queryByRole("button", { name: "actions.moreOptions" })).toBeNull();
    expect(screen.queryByRole("button", { name: "sections.knowledge.selection.select" })).toBeNull();
  });

  it("records knowledge upload start and completion with the file content type", async () => {
    vi.stubGlobal("crypto", { subtle: { digest: async () => new ArrayBuffer(32) } });
    const fetchMock = setup();
    await userEvent.click(screen.getByRole("button", { name: "sections.knowledge.addKnowledge" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "sections.knowledge.addKnowledgeOptions.upload" }));
    fireEvent.change(document.getElementById("knowledge-document-file")!, { target: { files: [new File(["hours"], "hours.txt", { type: "text/plain" })] } });
    await userEvent.click(screen.getByRole("button", { name: "actions.upload" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/uploads")).toBe(true));
    const expected = { businessId: "business", section: "knowledge", contentType: "text/plain" };
    telemetryRef.current!.expectEvent("web.knowledge.upload_started", expected);
    telemetryRef.current!.expectEvent("web.knowledge.upload_completed", expected);
  });

  it("shows the translated message and reports it when storage blocks the upload", async () => {
    vi.stubGlobal("crypto", { subtle: { digest: async () => new ArrayBuffer(32) } });
    const fetchMock = setup();
    const defaultFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/uploads" && init?.method === "POST") return Response.json({ objectId: "object", url: "https://uploads.example.invalid/object" });
      if (url === "https://uploads.example.invalid/object") throw new TypeError("Failed to fetch");
      return await defaultFetch(url, init);
    });
    await userEvent.click(screen.getByRole("button", { name: "sections.knowledge.addKnowledge" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "sections.knowledge.addKnowledgeOptions.upload" }));
    fireEvent.change(document.getElementById("knowledge-document-file")!, { target: { files: [new File(["hours"], "hours.txt", { type: "text/plain" })] } });
    await userEvent.click(screen.getByRole("button", { name: "actions.upload" }));
    expect(await screen.findByText("sections.knowledge.uploadValidation.uploadFailed")).toBeTruthy();
    expect(captureBrowserError).toHaveBeenCalledWith(expect.objectContaining({ message: "Storage upload to uploads.example.invalid failed without a response: Failed to fetch" }));
  });
});

describe("selecting several sources", () => {
  const rows = [website(), source({ kind: "file", id: "document" }), source({ kind: "text", id: "snippet", title: "Parking", content: "Behind." })];

  it("shows no checkboxes until Select, then deletes the rows chosen after confirming", async () => {
    const fetchMock = setup({ rows });
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "sections.knowledge.selection.select" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "actions.moreOptions" })).toBeNull();
    await userEvent.click(screen.getAllByRole("checkbox", { name: "sections.knowledge.selection.selectRow" })[0]!);
    await userEvent.click(screen.getByText("Parking"));
    expect(screen.getByText("sections.knowledge.selection.count:2")).toBeTruthy();
    // Re-import needs a website among the rows chosen.
    expect((screen.getByRole("button", { name: "sections.knowledge.batch.reimport" }) as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "sections.knowledge.batch.delete" }));
    expect(actionCall(fetchMock)).toEqual([]);
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "actions.delete" }));
    await waitFor(() => expect(actionCall(fetchMock)).toEqual([{ action: "delete", items: [{ type: "website", id: "site" }, { type: "snippet", id: "snippet" }] }]));
  });

  it("selects every row at once, turns them on, and leaves selection mode", async () => {
    const fetchMock = setup({ rows });
    await userEvent.click(screen.getByRole("button", { name: "sections.knowledge.selection.select" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "sections.knowledge.selection.selectAll" }));
    expect(screen.getByText("sections.knowledge.selection.count:3")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "sections.knowledge.batch.enable" }));
    await waitFor(() => expect(actionCall(fetchMock)).toEqual([{ action: "enable", items: [{ type: "website", id: "site" }, { type: "file", id: "document" }, { type: "snippet", id: "snippet" }] }]));
    await waitFor(() => expect(screen.queryAllByRole("checkbox")).toHaveLength(0));
  });

  it("leaves selection mode on Escape or Cancel", async () => {
    setup({ rows });
    await userEvent.click(screen.getByRole("button", { name: "sections.knowledge.selection.select" }));
    await act(async () => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "sections.knowledge.selection.select" }));
    await userEvent.click(screen.getByRole("button", { name: "sections.knowledge.selection.cancel" }));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("knowledge loading states", () => {
  const skeletons = (selector: string) => document.querySelectorAll(`${selector} [data-slot="skeleton"]`).length;
  function renderPending(seedBusinesses: boolean) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    if (seedBusinesses) client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<QueryClientProvider client={client}><LiveKnowledgeSurface /></QueryClientProvider>);
  }
  it("shows the page title and a placeholder table while the workspace loads", () => {
    renderPending(false);
    expect(screen.getByRole("heading", { name: "sections.knowledge.title" })).toBeTruthy();
    expect(screen.getByText("table.title")).toBeTruthy();
    expect(skeletons("tbody")).toBe(60);
  });
  it("keeps the real header and shows placeholder rows while the sources load", () => {
    renderPending(true);
    expect(document.querySelector("tbody")?.getAttribute("aria-busy")).toBe("true");
    expect(skeletons("tbody")).toBe(60);
    expect(screen.queryByText("sections.knowledge.emptyState")).toBeNull();
    expect(screen.queryByRole("button", { name: /sections.knowledge.addKnowledge/ })).toBeNull();
  });
});
