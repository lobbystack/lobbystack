import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadingTaskDestroyMock,
  documentDestroyMock,
  pageCleanupMock,
  getTextContentMock,
  getPageMock,
  getDocumentMock,
} = vi.hoisted(() => ({
  loadingTaskDestroyMock: vi.fn(),
  documentDestroyMock: vi.fn(),
  pageCleanupMock: vi.fn(),
  getTextContentMock: vi.fn(),
  getPageMock: vi.fn(),
  getDocumentMock: vi.fn(),
}));

vi.mock("pdfjs-dist/legacy/build/pdf.worker.mjs", () => ({
  WorkerMessageHandler: {},
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  VerbosityLevel: {
    ERRORS: 0,
  },
  getDocument: getDocumentMock,
}));

import {
  hasMeaningfulKnowledgeDocumentText,
  normalizeKnowledgeDocumentText,
} from "../../../convex/lib/knowledgeDocuments";
import { extractKnowledgeDocumentText } from "../../../convex/lib/node/knowledgeExtraction";

describe("Knowledge document helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("extracts PDF text and destroys PDF.js resources", async () => {
    const page = {
      getTextContent: getTextContentMock,
      cleanup: pageCleanupMock,
    };
    const document = {
      numPages: 1,
      getPage: getPageMock,
      destroy: documentDestroyMock,
    };

    getTextContentMock.mockResolvedValueOnce({
      items: [
        { str: "Extracted PDF text", hasEOL: false },
      ],
    });
    getPageMock.mockResolvedValueOnce(page);
    getDocumentMock.mockReturnValueOnce({
      promise: Promise.resolve(document),
      destroy: loadingTaskDestroyMock,
    });

    const pdfText = await extractKnowledgeDocumentText({
      blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      mimeType: "application/pdf",
    });

    expect(pdfText).toBe("Extracted PDF text");
    expect(getDocumentMock).toHaveBeenCalledTimes(1);
    expect(getPageMock).toHaveBeenCalledWith(1);
    expect(getTextContentMock).toHaveBeenCalledTimes(1);
    expect(pageCleanupMock).toHaveBeenCalledTimes(1);
    expect(documentDestroyMock).toHaveBeenCalledTimes(1);
    expect(loadingTaskDestroyMock).toHaveBeenCalledTimes(1);
  });

  it("returns an empty string when a PDF has no extractable text layer", async () => {
    const page = {
      getTextContent: getTextContentMock,
      cleanup: pageCleanupMock,
    };
    const document = {
      numPages: 1,
      getPage: getPageMock,
      destroy: documentDestroyMock,
    };

    getTextContentMock.mockResolvedValueOnce({
      items: [],
    });
    getPageMock.mockResolvedValueOnce(page);
    getDocumentMock.mockReturnValueOnce({
      promise: Promise.resolve(document),
      destroy: loadingTaskDestroyMock,
    });

    const pdfText = await extractKnowledgeDocumentText({
      blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      mimeType: "application/pdf",
    });

    expect(pdfText).toBe("");
    expect(pageCleanupMock).toHaveBeenCalledTimes(1);
    expect(documentDestroyMock).toHaveBeenCalledTimes(1);
    expect(loadingTaskDestroyMock).toHaveBeenCalledTimes(1);
  });

  it("rejects empty or near-empty extracted output", () => {
    expect(hasMeaningfulKnowledgeDocumentText("Too short")).toBe(false);
    expect(hasMeaningfulKnowledgeDocumentText("Opening hours are Monday to Friday.")).toBe(true);
  });
});
