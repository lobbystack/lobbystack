import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadingTaskDestroyMock,
  documentDestroyMock,
  firstPageCleanupMock,
  secondPageCleanupMock,
  firstPageRenderMock,
  secondPageRenderMock,
  getPageMock,
  getDocumentMock,
  makeMock,
  encodePNGToStreamMock,
  createWorkerMock,
  setParametersMock,
  recognizeMock,
  terminateMock,
} = vi.hoisted(() => ({
  loadingTaskDestroyMock: vi.fn(),
  documentDestroyMock: vi.fn(),
  firstPageCleanupMock: vi.fn(),
  secondPageCleanupMock: vi.fn(),
  firstPageRenderMock: vi.fn(),
  secondPageRenderMock: vi.fn(),
  getPageMock: vi.fn(),
  getDocumentMock: vi.fn(),
  makeMock: vi.fn(),
  encodePNGToStreamMock: vi.fn(),
  createWorkerMock: vi.fn(),
  setParametersMock: vi.fn(),
  recognizeMock: vi.fn(),
  terminateMock: vi.fn(),
}));

vi.mock("pureimage", async () => {
  const actual = await vi.importActual<typeof import("pureimage")>("pureimage");
  return {
    ...actual,
    make: makeMock,
    encodePNGToStream: encodePNGToStreamMock,
  };
});

vi.mock("pdfjs-dist/legacy/build/pdf.worker.mjs", () => ({
  WorkerMessageHandler: {},
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  VerbosityLevel: {
    ERRORS: 0,
  },
  getDocument: getDocumentMock,
}));

vi.mock("tesseract.js", () => ({
  OEM: {
    LSTM_ONLY: 1,
  },
  PSM: {
    AUTO: "3",
  },
  createWorker: createWorkerMock,
}));

import {
  KNOWLEDGE_DOCUMENT_OCR_MAX_PAGES,
  KNOWLEDGE_DOCUMENT_OCR_PAGE_LIMIT_ERROR,
  KNOWLEDGE_DOCUMENT_OCR_PROCESSING_ERROR,
  extractPdfTextWithLocalOcr,
} from "../../../convex/lib/node/knowledgeExtraction";

function makeCanvas(bufferText: string) {
  return {
    width: 100,
    height: 120,
    __buffer: Buffer.from(bufferText),
    getContext: vi.fn(() => ({
      fillStyle: "#ffffff",
      fillRect: vi.fn(),
    })),
  };
}

describe("Knowledge document OCR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setParametersMock.mockResolvedValue(undefined);
    terminateMock.mockResolvedValue(undefined);
    encodePNGToStreamMock.mockImplementation(async (bitmap, stream) => {
      stream.write(bitmap.__buffer);
      stream.end();
    });
    createWorkerMock.mockResolvedValue({
      setParameters: setParametersMock,
      recognize: recognizeMock,
      terminate: terminateMock,
    });
  });

  it("OCRs image-only PDFs page by page with a single worker", async () => {
    const firstPage = {
      getViewport: vi.fn(() => ({ width: 80, height: 90 })),
      render: firstPageRenderMock,
      cleanup: firstPageCleanupMock,
    };
    const secondPage = {
      getViewport: vi.fn(() => ({ width: 60, height: 70 })),
      render: secondPageRenderMock,
      cleanup: secondPageCleanupMock,
    };
    const document = {
      numPages: 2,
      getPage: getPageMock,
      destroy: documentDestroyMock,
    };

    firstPageRenderMock.mockReturnValueOnce({ promise: Promise.resolve() });
    secondPageRenderMock.mockReturnValueOnce({ promise: Promise.resolve() });
    getPageMock.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);
    getDocumentMock.mockReturnValueOnce({
      promise: Promise.resolve(document),
      destroy: loadingTaskDestroyMock,
    });
    makeMock
      .mockReturnValueOnce(makeCanvas("page-one"))
      .mockReturnValueOnce(makeCanvas("page-two"));
    recognizeMock
      .mockResolvedValueOnce({ data: { text: "Bonjour du scan" } })
      .mockResolvedValueOnce({ data: { text: "Hours are by appointment" } });

    const text = await extractPdfTextWithLocalOcr({
      blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    });

    expect(text).toBe("Bonjour du scan\n\nHours are by appointment");
    expect(createWorkerMock).toHaveBeenCalledWith(["eng", "fra"], 1, {
      cacheMethod: "none",
      logger: expect.any(Function),
      workerPath: expect.stringContaining("tesseractNodeWorker.js"),
    });
    expect(setParametersMock).toHaveBeenCalledWith({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "3",
      user_defined_dpi: "144",
    });
    expect(getPageMock).toHaveBeenNthCalledWith(1, 1);
    expect(getPageMock).toHaveBeenNthCalledWith(2, 2);
    expect(recognizeMock).toHaveBeenNthCalledWith(1, Buffer.from("page-one"));
    expect(recognizeMock).toHaveBeenNthCalledWith(2, Buffer.from("page-two"));
    expect(terminateMock).toHaveBeenCalledTimes(1);
    expect(firstPageCleanupMock).toHaveBeenCalledTimes(1);
    expect(secondPageCleanupMock).toHaveBeenCalledTimes(1);
    expect(documentDestroyMock).toHaveBeenCalledTimes(1);
    expect(loadingTaskDestroyMock).toHaveBeenCalledTimes(1);
  });

  it("rejects PDFs that exceed the OCR page cap", async () => {
    const document = {
      numPages: KNOWLEDGE_DOCUMENT_OCR_MAX_PAGES + 1,
      getPage: getPageMock,
      destroy: documentDestroyMock,
    };

    getDocumentMock.mockReturnValueOnce({
      promise: Promise.resolve(document),
      destroy: loadingTaskDestroyMock,
    });

    await expect(
      extractPdfTextWithLocalOcr({
        blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      }),
    ).rejects.toThrow(KNOWLEDGE_DOCUMENT_OCR_PAGE_LIMIT_ERROR);

    expect(createWorkerMock).not.toHaveBeenCalled();
    expect(getPageMock).not.toHaveBeenCalled();
    expect(documentDestroyMock).toHaveBeenCalledTimes(1);
    expect(loadingTaskDestroyMock).toHaveBeenCalledTimes(1);
  });

  it("terminates the worker when OCR processing fails", async () => {
    const firstPage = {
      getViewport: vi.fn(() => ({ width: 80, height: 90 })),
      render: firstPageRenderMock,
      cleanup: firstPageCleanupMock,
    };
    const document = {
      numPages: 1,
      getPage: getPageMock,
      destroy: documentDestroyMock,
    };

    firstPageRenderMock.mockReturnValueOnce({ promise: Promise.resolve() });
    getPageMock.mockResolvedValueOnce(firstPage);
    getDocumentMock.mockReturnValueOnce({
      promise: Promise.resolve(document),
      destroy: loadingTaskDestroyMock,
    });
    makeMock.mockReturnValueOnce(makeCanvas("page-one"));
    recognizeMock.mockRejectedValueOnce(new Error("ocr failed"));

    await expect(
      extractPdfTextWithLocalOcr({
        blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      }),
    ).rejects.toThrow(KNOWLEDGE_DOCUMENT_OCR_PROCESSING_ERROR);

    expect(terminateMock).toHaveBeenCalledTimes(1);
    expect(firstPageCleanupMock).toHaveBeenCalledTimes(1);
    expect(documentDestroyMock).toHaveBeenCalledTimes(1);
    expect(loadingTaskDestroyMock).toHaveBeenCalledTimes(1);
  });
});
