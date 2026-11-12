// How the dashboard shows knowledge: one row per source. A website is one row,
// whatever number of pages its crawl brought in; each file and each entry is
// one row. Pure functions, so the grouping is tested without a database.

/** A crawl's progress. stalled: it should be running but stopped moving (see isWebsiteImportStalled). */
export type WebsiteImportSummary = { id: string; status: string; websiteUrl: string; importedCount: number; indexedCount: number; documentCount: number; crawlFinishedCount: number | null; crawlTotalCount: number | null; stalled: boolean };

export type KnowledgeDocumentRow = {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  status: string;
  error: string | null;
  active: boolean;
  sourceActive: boolean;
  agentId: string | null;
  websiteDocumentId: string | null;
  processingProgress: number;
  revision: number;
  storageObjectId: string | null;
  mimeType: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** The first characters of the document's text, empty before it's indexed. */
  preview: string;
  /** Whether the document has indexed text. An import document often has none of its own. */
  hasContent: boolean;
  websiteImport: WebsiteImportSummary | null;
};

export type KnowledgeSnippetRow = { id: string; title: string; content: string; tags: string[]; priority: number; active: boolean; agentId: string | null; createdAt: Date; updatedAt: Date };

export type KnowledgeSourceKind = "website" | "file" | "text";

export type KnowledgeSource = {
  kind: KnowledgeSourceKind;
  /** The website's import document, the file's document, or the entry's snippet. */
  id: string;
  title: string;
  sourceUrl: string | null;
  agentId: string | null;
  /** On for the business, or for the agent that owns it. */
  active: boolean;
  status: string;
  error: string | null;
  preview: string;
  createdAt: string;
  updatedAt: string;
  processingProgress: number | null;
  revision: number;
  /** A website's pages with text, and how many of them are off. */
  pageCount?: number;
  pagesOff?: number;
  websiteImport?: WebsiteImportSummary | null;
  /** An entry's fields, so the dashboard can edit it. */
  content?: string;
  tags?: string[];
  priority?: number;
  /** For a shared source on an agent's page: whether it's on for that agent. */
  agentActive?: boolean;
};

export type WebsiteGroup = {
  /** The import document when there is one, else the oldest page. */
  primary: KnowledgeDocumentRow;
  /** Every page of the website, the import document included. */
  members: KnowledgeDocumentRow[];
  /** The pages that link to no website document. They hold the website's switch. */
  heads: KnowledgeDocumentRow[];
};

/** A website URL's host, lowercased and without www. */
export function knowledgeHost(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).host.toLowerCase().replace(/^www\./u, "");
  } catch {
    return null;
  }
}

const byAge = (left: { createdAt: Date; id: string }, right: { createdAt: Date; id: string }) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id);

/**
 * Groups website documents into websites: a page joins the website document
 * it names, and pages by the same agent (or shared) on the same host are one
 * website, as deleteWebsiteKnowledge deletes them.
 */
export function groupWebsiteDocuments(rows: ReadonlyArray<KnowledgeDocumentRow>): WebsiteGroup[] {
  const websites = rows.filter((row) => row.sourceType === "website");
  const byId = new Map(websites.map((row) => [row.id, row]));
  const keyOf = (row: KnowledgeDocumentRow): string => {
    const parent = row.websiteDocumentId ? byId.get(row.websiteDocumentId) : undefined;
    const anchor = parent ?? row;
    return `${anchor.agentId ?? ""}|${knowledgeHost(anchor.sourceUrl) ?? anchor.id}`;
  };
  const groups = new Map<string, KnowledgeDocumentRow[]>();
  for (const row of websites) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((members) => {
    const sorted = members.slice().sort(byAge);
    const primary = sorted.find((row) => row.websiteImport) ?? sorted[0]!;
    return { primary, members: sorted, heads: sorted.filter((row) => !row.websiteDocumentId || !byId.has(row.websiteDocumentId)) };
  });
}

/** The pages of a website that hold text, the ones a person can turn off or remove. */
export function websitePages(group: WebsiteGroup): KnowledgeDocumentRow[] {
  // The website's address first, then its pages by URL.
  return group.members.filter((row) => row.hasContent || !row.websiteImport)
    .sort((left, right) => Number(Boolean(right.websiteImport)) - Number(Boolean(left.websiteImport)) || (left.sourceUrl ?? "").localeCompare(right.sourceUrl ?? "") || left.id.localeCompare(right.id));
}

function iso(value: Date): string {
  return value.toISOString();
}

function websiteTitle(group: WebsiteGroup): string {
  const url = group.primary.websiteImport?.websiteUrl ?? group.primary.sourceUrl;
  if (!url) return group.primary.title;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./u, "") + (parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/u, ""));
  } catch {
    return url;
  }
}

/** One website as a row. */
export function websiteSource(group: WebsiteGroup): KnowledgeSource {
  const pages = websitePages(group).filter((row) => row.status === "indexed");
  const job = group.primary.websiteImport;
  const importing = Boolean(job && !["completed", "cancelled", "failed"].includes(job.status));
  const failed = Boolean(job && ["cancelled", "failed"].includes(job.status));
  const updatedAt = group.members.reduce((latest, row) => row.updatedAt > latest ? row.updatedAt : latest, group.primary.updatedAt);
  return {
    kind: "website",
    id: group.primary.id,
    title: websiteTitle(group),
    sourceUrl: job?.websiteUrl ?? group.primary.sourceUrl,
    agentId: group.primary.agentId,
    active: group.heads.every((row) => row.sourceActive),
    status: importing ? "processing" : pages.length ? "indexed" : failed ? "error" : group.primary.status,
    error: group.primary.error,
    preview: group.members.find((row) => row.preview)?.preview ?? "",
    createdAt: iso(group.primary.createdAt),
    updatedAt: iso(updatedAt),
    processingProgress: group.primary.processingProgress,
    revision: group.primary.revision,
    pageCount: pages.length,
    pagesOff: pages.filter((row) => !row.active).length,
    websiteImport: job,
  };
}

/** One uploaded file as a row. */
export function fileSource(row: KnowledgeDocumentRow): KnowledgeSource {
  return { kind: "file", id: row.id, title: row.title, sourceUrl: row.sourceUrl, agentId: row.agentId, active: row.active && row.sourceActive, status: row.status, error: row.error, preview: row.preview, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), processingProgress: row.processingProgress, revision: row.revision };
}

/** One FAQ entry or text as a row. */
export function snippetSource(row: KnowledgeSnippetRow): KnowledgeSource {
  return { kind: "text", id: row.id, title: row.title, sourceUrl: null, agentId: row.agentId, active: row.active, status: "indexed", error: null, preview: row.content.slice(0, 500), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), processingProgress: null, revision: 0, content: row.content, tags: row.tags, priority: row.priority };
}

/** Every source among the rows, newest first. */
export function knowledgeSources(documents: ReadonlyArray<KnowledgeDocumentRow>, snippets: ReadonlyArray<KnowledgeSnippetRow>): KnowledgeSource[] {
  return [
    ...groupWebsiteDocuments(documents).map(websiteSource),
    ...documents.filter((row) => row.sourceType !== "website").map(fileSource),
    ...snippets.map(snippetSource),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
}
