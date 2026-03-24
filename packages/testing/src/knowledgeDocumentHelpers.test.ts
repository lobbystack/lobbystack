import { describe, expect, it } from "vitest";

import {
  hasMeaningfulKnowledgeDocumentText,
  normalizeKnowledgeDocumentText,
} from "../../../convex/lib/knowledgeDocuments";
import { extractKnowledgeDocumentText } from "../../../convex/lib/node/knowledgeExtraction";

describe("Knowledge document helpers", () => {
  it("normalizes repeated blank lines and trims surrounding whitespace", () => {
    expect(
      normalizeKnowledgeDocumentText("  First line\r\n\r\n\r\nSecond line\r\n"),
    ).toBe("First line\n\nSecond line");
  });

  it("extracts plain-text and markdown uploads as UTF-8 text", async () => {
    const plainText = await extractKnowledgeDocumentText({
      blob: new Blob(["Hello from a text file"], { type: "text/plain" }),
      mimeType: "text/plain",
    });
    const markdownText = await extractKnowledgeDocumentText({
      blob: new Blob(["# Title\n\nBody copy"], { type: "text/markdown" }),
      mimeType: "text/markdown",
    });

    expect(plainText).toBe("Hello from a text file");
    expect(markdownText).toBe("# Title\n\nBody copy");
  });

  it("rejects empty or near-empty extracted output", () => {
    expect(hasMeaningfulKnowledgeDocumentText("Too short")).toBe(false);
    expect(hasMeaningfulKnowledgeDocumentText("Opening hours are Monday to Friday.")).toBe(true);
  });
});
