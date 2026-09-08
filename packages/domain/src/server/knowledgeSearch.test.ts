import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DomainContext } from "./context";
import type { KnowledgePassage } from "../knowledgeRanking";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@lobbystack/db", async original => ({ ...(await original<typeof import("@lobbystack/db")>()), withBusinessTransaction: mocks.transaction }));
import { chunkText, searchKnowledgeEvidence } from "./knowledge";

const primary: KnowledgePassage = { chunkId: "chunk", documentId: "document", title: "BAA", content: "Management", sourceUrl: "https://example.com/baa", sourceRevision: 3, sequence: 1 };
const adjacent: KnowledgePassage = { ...primary, chunkId: "adjacent", sequence: 2, content: "MNGT 10407 — Approches du management." };
const dialect = new PgDialect();
const statements: string[] = [];
let lexical: KnowledgePassage[];
let semantic: KnowledgePassage[];
let current: KnowledgePassage[];
let failAll: boolean;

beforeEach(() => {
  statements.length = 0;
  lexical = [primary]; semantic = [primary]; current = [primary, adjacent]; failAll = false;
  mocks.transaction.mockImplementation(async (_db, actor, callback) => {
    expect(actor.businessId).toBe("tenant-a");
    return callback({ execute: async (statement: Parameters<typeof dialect.sqlToQuery>[0]) => {
      const query = dialect.sqlToQuery(statement);
      statements.push(query.sql);
      if (query.sql.startsWith("SET")) return { rows: [] };
      if (failAll) throw new Error("database unavailable");
      expect(query.params).toContain("tenant-a");
      expect(query.sql).toContain("d.active = true AND d.status = 'indexed'");
      if (query.sql.includes("BETWEEN")) return { rows: current };
      return { rows: query.sql.includes("<=>") ? semantic : lexical };
    } });
  });
});

function context(embed = vi.fn().mockResolvedValue([[0.1, 0.2]])): DomainContext {
  return { db: {} as never, embeddings: { embed } };
}
afterEach(() => vi.useRealTimers());

describe("knowledge evidence", () => {
  it("reserves primary evidence before expanding neighboring chunks", async () => {
    const content = Array.from({ length: 90 }, (_, index) => `detail${index}`).join(" ");
    lexical = semantic = Array.from({ length: 6 }, (_, index) => ({ ...primary, chunkId: `primary-${index}`, documentId: `document-${index}`, sequence: 1, content: `${content} ${index === 5 ? "MNGT 10407" : ""}` }));
    current = lexical.flatMap(row => [row, { ...row, chunkId: `${row.chunkId}-before`, sequence: 0, content }, { ...row, chunkId: `${row.chunkId}-after`, sequence: 2, content }]);
    const result = await searchKnowledgeEvidence(context(), { businessId: "tenant-a", query: "management" });
    expect(result.matches).toHaveLength(6);
    expect(result.matches.some(row => row.content.includes("MNGT 10407"))).toBe(true);
  });
  it("bounds a stalled embedding request and uses keyword results", async () => {
    vi.useFakeTimers();
    const result = searchKnowledgeEvidence(context(vi.fn().mockImplementation(() => new Promise(() => {}))), { businessId: "tenant-a", query: "management" });
    await vi.advanceTimersByTimeAsync(1801);
    expect(await result).toMatchObject({ mode: "keyword", outcome: "found" });
  });
  it("returns neighboring evidence with source revision and no generated answer", async () => {
    const result = await searchKnowledgeEvidence(context(), { businessId: "tenant-a", query: "management" });
    expect(result.outcome).toBe("found");
    expect(result.mode).toBe("hybrid");
    expect(result.matches[0]).toMatchObject({ sourceRevision: 3, supportingChunkIds: ["chunk", "adjacent"] });
    expect(result.matches[0]?.content).toContain("MNGT 10407");
    expect(statements.filter(value => value.includes("LIMIT 12"))).toHaveLength(2);
  });
  it("keeps keyword search when embeddings fail", async () => {
    const result = await searchKnowledgeEvidence(context(vi.fn().mockRejectedValue(new Error("private provider error"))), { businessId: "tenant-a", query: "MNGT 10407" });
    expect(result).toMatchObject({ mode: "keyword", outcome: "found", failure: "embedding_unavailable" });
    expect(JSON.stringify(result)).not.toContain("private provider error");
  });
  it("discards evidence deleted or revised while searches were running", async () => {
    current = [];
    const result = await searchKnowledgeEvidence(context(), { businessId: "tenant-a", query: "management" });
    expect(result).toMatchObject({ matches: [], outcome: "empty" });
  });
  it("distinguishes database failure from no evidence", async () => {
    failAll = true;
    expect(await searchKnowledgeEvidence(context(), { businessId: "tenant-a", query: "management" })).toMatchObject({ matches: [], outcome: "unavailable", failure: "search_unavailable" });
  });
  it("returns empty when both indexes have no matches", async () => {
    lexical = []; semantic = [];
    expect(await searchKnowledgeEvidence(context(), { businessId: "tenant-a", query: "unknown" })).toMatchObject({ matches: [], outcome: "empty" });
  });
});

describe("knowledge chunk boundaries", () => {
  it("starts a new passage at a course heading instead of mixing adjacent courses", () => {
    const chunks = chunkText("## Marketing\nMARK 10100 Introduction to marketing.\n## Management\nMNGT 10407 Management fundamentals.");
    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toBe("## Management\nMNGT 10407 Management fundamentals.");
    expect(chunkText("## Marketing MARK 10100. ## Management MNGT 10407.")).toHaveLength(2);
  });
  it("preserves headings and overlapping evidence", () => {
    const text = "# Programme BAA\n\n" + "Préparation. ".repeat(12) + "\n## Management\nMNGT 10407\nApproches du management.\n" + "Suite. ".repeat(20);
    const chunks = chunkText(text, { maxCharacters: 200, overlap: 80 });
    expect(chunks.every(chunk => chunk.length <= 200)).toBe(true);
    expect(chunks.some(chunk => chunk.includes("Management\nMNGT 10407"))).toBe(true);
    expect(chunks[0]).toContain("# Programme BAA\n");
  });
  it("handles blank text and rejects non-progressing sizes", () => {
    expect(chunkText("  \n ")).toEqual([]);
    expect(() => chunkText("hello", { maxCharacters: 0 })).toThrow();
  });
});
