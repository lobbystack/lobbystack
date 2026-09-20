import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWorker: vi.fn(),
  destroy: vi.fn(),
  extractRawText: vi.fn(),
  getScreenshot: vi.fn(),
  getText: vi.fn(),
  loads: { mammoth: 0, pdf: 0, tesseract: 0 },
  recognize: vi.fn(),
  terminate: vi.fn(),
}));

vi.mock("mammoth", () => {
  mocks.loads.mammoth += 1;
  return { default: { extractRawText: mocks.extractRawText } };
});

vi.mock("pdf-parse", () => {
  mocks.loads.pdf += 1;
  return {
    PDFParse: class {
      destroy = mocks.destroy;
      getScreenshot = mocks.getScreenshot;
      getText = mocks.getText;
    },
  };
});

vi.mock("tesseract.js", () => {
  mocks.loads.tesseract += 1;
  return { createWorker: mocks.createWorker };
});

import { extractDocumentText } from "./documentExtraction";

describe("knowledge document extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createWorker.mockResolvedValue({ recognize: mocks.recognize, terminate: mocks.terminate });
    mocks.terminate.mockResolvedValue(undefined);
    mocks.destroy.mockResolvedValue(undefined);
  });

  it("does not load extraction dependencies when the module or plain text path is used", async () => {
    expect(mocks.loads).toEqual({ mammoth: 0, pdf: 0, tesseract: 0 });

    await expect(extractDocumentText({ body: new TextEncoder().encode("plain"), contentType: "text/plain" })).resolves.toBe("plain");

    expect(mocks.loads).toEqual({ mammoth: 0, pdf: 0, tesseract: 0 });
  });

  it("extracts UTF-8 text documents", async () => {
    await expect(extractDocumentText({ body: new TextEncoder().encode("English et français"), contentType: "text/plain; charset=utf-8" })).resolves.toBe("English et français");
  });

  it("uses the PDF text layer without OCR when text is available", async () => {
    mocks.getText.mockResolvedValue({ text: "Business hours", total: 1 });

    await expect(extractDocumentText({ body: new Uint8Array([1]), contentType: "application/pdf" })).resolves.toBe("Business hours");

    expect(mocks.getScreenshot).not.toHaveBeenCalled();
    expect(mocks.createWorker).not.toHaveBeenCalled();
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.loads.pdf).toBe(1);
    expect(mocks.loads.tesseract).toBe(0);
  });

  it("loads mammoth only for DOCX extraction", async () => {
    mocks.extractRawText.mockResolvedValue({ value: "Document text" });

    await expect(extractDocumentText({ body: new Uint8Array([1]), contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).resolves.toBe("Document text");

    expect(mocks.loads.mammoth).toBe(1);
  });

  it("OCRs every page of a textless PDF with one bilingual worker", async () => {
    mocks.getText.mockResolvedValue({ text: "  ", total: 2 });
    mocks.getScreenshot.mockResolvedValue({
      pages: [{ data: new Uint8Array([1]) }, { data: new Uint8Array([2]) }],
      total: 2,
    });
    mocks.recognize
      .mockResolvedValueOnce({ data: { text: "Bonjour du scan\n" } })
      .mockResolvedValueOnce({ data: { text: "Hours by appointment" } });

    await expect(extractDocumentText({ body: new Uint8Array([1]), contentType: "application/pdf" })).resolves.toBe("Bonjour du scan\n\nHours by appointment");

    expect(mocks.getScreenshot).toHaveBeenCalledWith({ imageBuffer: true, imageDataUrl: false, scale: 2 });
    expect(mocks.createWorker).toHaveBeenCalledWith(["eng", "fra"]);
    expect(mocks.recognize).toHaveBeenNthCalledWith(1, Buffer.from([1]));
    expect(mocks.recognize).toHaveBeenNthCalledWith(2, Buffer.from([2]));
    expect(mocks.terminate).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.loads.tesseract).toBe(1);
  });

  it("rejects textless PDFs above the OCR page limit", async () => {
    mocks.getText.mockResolvedValue({ text: "", total: 11 });

    await expect(extractDocumentText({ body: new Uint8Array([1]), contentType: "application/pdf" })).rejects.toThrow("Scanned PDF OCR is limited to 10 pages");

    expect(mocks.getScreenshot).not.toHaveBeenCalled();
    expect(mocks.createWorker).not.toHaveBeenCalled();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("rejects unsupported content types", async () => {
    await expect(extractDocumentText({ body: new Uint8Array(), contentType: "application/octet-stream" })).rejects.toThrow("Unsupported knowledge document content type");
  });
});
