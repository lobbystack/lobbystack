// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveKnowledgeSurface, websiteImportProgress, type WebsiteImport } from "./live-knowledge-surface";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/agent/knowledge", useSearchParams: () => new URLSearchParams() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string) => key }) }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup({ snippet = false, active = true, role = "business_owner", status = "indexed", sourceType = "upload", textContent = "**Clinic** [hours](https://example.invalid)", websiteImport = null as null | WebsiteImport } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role }] });
  const document = { websiteImport, id: "document", title: "Clinic hours", active, sourceType, status, sourceUrl: sourceType === "website" ? "https://example.invalid" : null, textContent, processingProgress: 40, createdAt: "2026-09-01T12:00:00Z", updatedAt: "2026-09-01T12:00:00Z" };
  const snippets = snippet ? [{ id: "snippet", title: "Clinic hours", content: "Open weekdays", tags: ["hours"], priority: 5, active, createdAt: "2026-09-01T12:00:00Z" }] : [];
  client.setQueryData(["knowledge", "business"], { documents: snippet ? [] : [document] });
  client.setQueryData(["knowledge-snippets", "business"], { snippets });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method) return Response.json({ ok: true });
    if (url.includes("/document?")) return Response.json({ document, content: "Readable extracted content" });
    return Response.json(url.includes("/snippets?") ? { snippets } : { documents: snippet ? [] : [document] });
  }); vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveKnowledgeSurface /></QueryClientProvider>);
  return Object.assign(fetchMock, { client });
}
describe("original knowledge row interactions", () => {
  it("renders a queued website import before its pages exist", () => {
    setup({ sourceType: "website", status: "processing", textContent: "", websiteImport: { id: "job", status: "queued", websiteUrl: "https://www.example.invalid/help/", importedCount: 0, indexedCount: 0 } });
    expect(screen.getByText("example.invalid/help")).toBeTruthy();
    expect(screen.getByText("sections.knowledge.websiteImport.status.inProgress")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("8");
    expect(screen.getByRole("progressbar").textContent).toBe("");
  });
  it("does not move crawl progress backwards when refreshed counts lag", async () => {
    const { client } = setup({ sourceType: "website", status: "processing", textContent: "", websiteImport: { id: "job", status: "crawling", websiteUrl: "https://example.invalid", importedCount: 10, indexedCount: 0, documentCount: 0, crawlFinishedCount: 8, crawlTotalCount: 10 } });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("80");
    await act(async () => { client.setQueryData(["knowledge", "business"], (current: { documents: Array<Record<string, unknown>> }) => ({ documents: current.documents.map(document => ({ ...document, websiteImport: { id: "job", status: "crawling", websiteUrl: "https://example.invalid", importedCount: 20, indexedCount: 0, documentCount: 0, crawlFinishedCount: 8, crawlTotalCount: 20 } })) })); });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("80");
  });
  it("keeps a fully crawled import below completion while indexing continues", () => {
    setup({ sourceType: "website", status: "processing", textContent: "", websiteImport: { id: "job", status: "indexing", websiteUrl: "https://example.invalid", importedCount: 10, indexedCount: 0, documentCount: 0, crawlFinishedCount: 10, crawlTotalCount: 10 } });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("99");
  });
  it("removes a completed import placeholder when it contains no page text", () => {
    setup({ sourceType: "website", status: "indexed", textContent: "", websiteImport: { id: "job", status: "completed", websiteUrl: "https://example.invalid", importedCount: 10, indexedCount: 10 } });
    expect(screen.queryByText("Clinic hours")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("preserves the indexed root page when the completed import has content", () => {
    setup({ sourceType: "website", status: "indexed", websiteImport: { id: "job", status: "completed", websiteUrl: "https://example.invalid", importedCount: 10, indexedCount: 10 } });
    expect(screen.getByText("Clinic hours")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("uses the original crawl and indexing progress bounds", () => {
    const job = { id: "job", websiteUrl: "https://example.invalid", importedCount: 0, indexedCount: 0 };
    expect(websiteImportProgress({ ...job, status: "crawling" })).toBe(12);
    expect(websiteImportProgress({ ...job, status: "indexing" })).toBe(72);
    expect(websiteImportProgress({ ...job, status: "crawling", importedCount: 10, indexedCount: 0, crawlFinishedCount: 20, crawlTotalCount: 10 })).toBe(99);
  });
  it("shows the original upload progress while extracted text is unavailable", () => {
    setup({ status: "processing", textContent: "" });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("40%")).toBeTruthy();
  });
  it.each([{ status: "processing", textContent: "Readable text" }, { status: "processing", sourceType: "website", textContent: "" }, { status: "indexed", textContent: "" }, { status: "processing", textContent: "", active: false }])("keeps progress out of readable, website, completed and disabled rows: %j", options => {
    setup(options); expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("toggles a snippet without opening its editor", async () => {
    const fetchMock = setup({ snippet: true });
    await userEvent.click(screen.getByRole("button", { name: "actions.moreOptions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "actions.disable" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/snippets/snippet?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ id: "snippet", active: false }) })));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("renders the original sanitized website preview and source marker", () => {
    setup({ sourceType: "website", textContent: "[Hours](https://example.invalid) ![Clinic](https://example.invalid/photo.png) <https://example.invalid>" });
    expect(screen.getByText("Hours Clinic")).toBeTruthy();
    expect(screen.getByLabelText("sections.knowledge.websiteImport.badge")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("deletes a failed import only after the original confirmation", async () => {
    const fetchMock = setup({ sourceType: "website", status: "error" });
    await userEvent.click(screen.getByRole("button", { name: "actions.moreOptions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "actions.delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "actions.delete" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/document?businessId=business", expect.objectContaining({ method: "DELETE" })));
  });
  it("opens snippet rows with stored values and updates that snippet", async () => {
    const fetchMock = setup({ snippet: true }); await userEvent.click(screen.getByText("Clinic hours", { exact: true }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByDisplayValue("Open weekdays")).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "agent:actions.saveChanges" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/snippets/snippet?businessId=business", expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"id":"snippet"') })));
  });
  it("hides tenant-admin knowledge controls from viewers", () => {
    setup({ role: "viewer" }); expect(screen.queryByRole("button", { name: "sections.knowledge.addKnowledge" })).toBeNull(); expect(screen.queryByRole("button", { name: "actions.moreOptions" })).toBeNull();
  });
  it.each([true, false])("toggles document activity from %s without opening its preview", async active => {
    const fetchMock = setup({ active });
    if (!active) expect(screen.getByText("table.disabled")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "actions.moreOptions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: active ? "actions.disable" : "actions.enable" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/document?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ active: !active }) })));
    expect(screen.queryByRole("textbox", { name: "" })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) => url.includes("/document?") && !init?.method)).toBe(false);
  });
  it("keeps document content readable during reindexing", async () => {
    setup({ status: "processing" }); await userEvent.click(screen.getByText("Clinic hours", { exact: true }));
    expect(await screen.findByDisplayValue("Readable extracted content")).toBeTruthy(); expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("opens deletion confirmation without opening a snippet editor", async () => {
    setup({ snippet: true }); await userEvent.click(screen.getByRole("button", { name: "actions.moreOptions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "actions.delete" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy(); expect(screen.queryByDisplayValue("Open weekdays")).toBeNull();
  });
  it("can cancel an active website import from its actions", async () => {
    const fetchMock = setup({ status: "processing", sourceType: "website", textContent: "", websiteImport: { id: "job", status: "queued", websiteUrl: "https://example.invalid", importedCount: 0, indexedCount: 0 } }); await userEvent.click(screen.getByRole("button", { name: "actions.moreOptions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "actions.cancelImport" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "actions.cancelImport" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/document?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "cancel" }) })));
  });
  it.each(["", "Indexed root page content"])("keeps partial imports cancellable with root content %j", async (textContent) => {
    const fetchMock = setup({ status: "processing", sourceType: "website", textContent, websiteImport: { id: "job", status: "indexing", websiteUrl: "https://example.invalid", importedCount: 10, indexedCount: 1 } });
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText("sections.knowledge.websiteImport.status.inProgress")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "actions.moreOptions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "actions.cancelImport" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "actions.cancelImport" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/document?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "cancel" }) })));
  });
  it.each(["", "Indexed root page content"])("shows failures after partial indexing with root content %j", (textContent) => {
    setup({ status: "error", sourceType: "website", textContent, websiteImport: { id: "job", status: "failed", websiteUrl: "https://example.invalid", importedCount: 10, indexedCount: 1 } });
    expect(screen.getByText("sections.knowledge.websiteImport.status.failed")).toBeTruthy();
    expect(screen.getByText("sections.knowledge.websiteImport.previewFailed")).toBeTruthy();
  });
});
