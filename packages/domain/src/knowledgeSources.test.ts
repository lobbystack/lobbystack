import { describe, expect, it } from "vitest";

import { groupWebsiteDocuments, knowledgeSources, websitePages, type KnowledgeDocumentRow, type WebsiteImportSummary } from "./knowledgeSources";

let clock = 0;
function row(input: Partial<KnowledgeDocumentRow> & { id: string }): KnowledgeDocumentRow {
  clock += 1;
  return { title: input.id, sourceType: "website", sourceUrl: null, status: "indexed", error: null, active: true, sourceActive: true, agentId: null, websiteDocumentId: null, processingProgress: 100, revision: 1, storageObjectId: null, mimeType: null, createdAt: new Date(2026, 0, 1, 0, 0, clock), updatedAt: new Date(2026, 0, 1, 0, 0, clock), preview: "text", hasContent: true, websiteImport: null, ...input };
}
const job = (status: string): WebsiteImportSummary => ({ id: "job", status, websiteUrl: "https://harbor.example/", importedCount: 3, indexedCount: 3, documentCount: 3, crawlFinishedCount: 3, crawlTotalCount: 3 });

describe("knowledge sources", () => {
  it("shows a website as one row with its page count, apart from files and entries", () => {
    const home = row({ id: "home", sourceUrl: "https://harbor.example/", websiteImport: job("completed"), preview: "", hasContent: false });
    const documents = [
      home,
      row({ id: "team", sourceUrl: "https://harbor.example/team", websiteDocumentId: "home" }),
      row({ id: "hours", sourceUrl: "https://www.harbor.example/hours", active: false }),
      row({ id: "menu", sourceType: "upload", title: "Menu.pdf" }),
    ];
    const sources = knowledgeSources(documents, [{ id: "faq", title: "Parking", content: "Behind the clinic.", tags: ["faq"], priority: 0, active: true, agentId: null, createdAt: new Date(2026, 0, 2), updatedAt: new Date(2026, 0, 2) }]);
    expect(sources.map((source) => [source.kind, source.id])).toEqual([["text", "faq"], ["file", "menu"], ["website", "home"]]);
    expect(sources.find((source) => source.kind === "website")).toMatchObject({ title: "harbor.example", pageCount: 2, pagesOff: 1, active: true, status: "indexed" });
    // The import document has no text of its own, so it isn't a page.
    expect(websitePages(groupWebsiteDocuments(documents)[0]!).map((page) => page.id)).toEqual(["team", "hours"]);
  });

  it("keeps an agent's website apart from a shared one, and reads the website's switch from every page that links to nothing", () => {
    const groups = groupWebsiteDocuments([
      row({ id: "shared", sourceUrl: "https://harbor.example/", websiteImport: job("completed") }),
      row({ id: "orphan", sourceUrl: "https://harbor.example/old", sourceActive: false }),
      row({ id: "own", sourceUrl: "https://night.example/", agentId: "evening", websiteImport: job("completed") }),
    ]);
    expect(groups.map((group) => [group.primary.id, group.members.map((member) => member.id)])).toEqual([["shared", ["shared", "orphan"]], ["own", ["own"]]]);
    expect(groups[0]!.heads.map((head) => head.id)).toEqual(["shared", "orphan"]);
    expect(knowledgeSources(groups.flatMap((group) => group.members), [])[1]).toMatchObject({ id: "shared", active: false });
  });

  it("says a website is importing until its crawl finishes, and failed when a failed crawl left no page", () => {
    expect(knowledgeSources([row({ id: "home", sourceUrl: "https://harbor.example/", status: "processing", hasContent: false, preview: "", websiteImport: job("crawling") })], [])[0]).toMatchObject({ status: "processing", pageCount: 0 });
    expect(knowledgeSources([row({ id: "home", sourceUrl: "https://harbor.example/", status: "error", hasContent: false, preview: "", websiteImport: job("failed") })], [])[0]).toMatchObject({ status: "error", pageCount: 0 });
  });
});
