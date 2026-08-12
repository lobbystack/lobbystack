import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWorker: vi.fn(),
  destroy: vi.fn(),
  getScreenshot: vi.fn(),
  getText: vi.fn(),
  recognize: vi.fn(),
  terminate: vi.fn(),
}));

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    destroy = mocks.destroy;
    getScreenshot = mocks.getScreenshot;
    getText = mocks.getText;
  },
}));

vi.mock("tesseract.js", () => ({ createWorker: mocks.createWorker }));

import { extractDocumentText } from "./documentExtraction";

describe("knowledge document extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createWorker.mockResolvedValue({ recognize: mocks.recognize, terminate: mocks.terminate });
    mocks.terminate.mockResolvedValue(undefined);
    mocks.destroy.mockResolvedValue(undefined);
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
