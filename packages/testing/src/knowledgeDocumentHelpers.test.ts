import { describe, expect, it, vi } from "vitest";

const { pdfDestroyMock, pdfGetTextMock, pdfSetWorkerMock } = vi.hoisted(() => ({
  pdfDestroyMock: vi.fn(),
  pdfGetTextMock: vi.fn(),
  pdfSetWorkerMock: vi.fn(),
}));

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    static setWorker = pdfSetWorkerMock;

    async getText() {
      return await pdfGetTextMock();
    }

    async destroy() {
      await pdfDestroyMock();
    }
  },
}));

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

  it("destroys PDF parsers after extracting text", async () => {
    pdfGetTextMock.mockResolvedValueOnce({ text: "Extracted PDF text" });

    const pdfText = await extractKnowledgeDocumentText({
      blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      mimeType: "application/pdf",
    });

    expect(pdfText).toBe("Extracted PDF text");
    expect(pdfSetWorkerMock).toHaveBeenCalledTimes(1);
    expect(pdfSetWorkerMock.mock.calls[0]?.[0]).toMatch(/^data:text\/javascript;base64,/);
    expect(pdfGetTextMock).toHaveBeenCalledTimes(1);
    expect(pdfDestroyMock).toHaveBeenCalledTimes(1);
  });

  it("rejects empty or near-empty extracted output", () => {
    expect(hasMeaningfulKnowledgeDocumentText("Too short")).toBe(false);
    expect(hasMeaningfulKnowledgeDocumentText("Opening hours are Monday to Friday.")).toBe(true);
  });
});
