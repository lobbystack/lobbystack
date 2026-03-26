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
  runWithCachedInProcessTesseractWorkerMock,
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
  runWithCachedInProcessTesseractWorkerMock: vi.fn(),
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

vi.mock("../../../convex/lib/node/tesseractInProcessWorker", () => ({
  runWithCachedInProcessTesseractWorker: runWithCachedInProcessTesseractWorkerMock,
}));

import {
  KNOWLEDGE_DOCUMENT_OCR_MAX_PAGES,
  KNOWLEDGE_DOCUMENT_OCR_PAGE_LIMIT_ERROR,
  KNOWLEDGE_DOCUMENT_OCR_PROCESSING_ERROR,
  extractPdfTextWithLocalOcr,
} from "../../../convex/lib/node/knowledgeExtraction";

type CanvasContextWithPutImageData = {
  getTransform?: () => {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
    invertSelf: () => unknown;
  };
  putImageData?: (
    imageData: ImageData,
    dx: number,
    dy: number,
    dirtyX?: number,
    dirtyY?: number,
    dirtyWidth?: number,
    dirtyHeight?: number,
  ) => void;
};

function makeCanvas(bufferText: string) {
  const data = new Uint8Array(100 * 120 * 4);
  const existingGetTransform = vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 12 }));
  const existingGetImageData = vi.fn();
  const existingPutImageData = vi.fn();
  return {
    width: 100,
    height: 120,
    __buffer: Buffer.from(bufferText),
    __existingGetTransform: existingGetTransform,
    __existingPutImageData: existingPutImageData,
    data,
    calculateIndex: vi.fn((x: number, y: number) => (100 * y + x) * 4),
    getContext: vi.fn(() => ({
      fillStyle: "#ffffff",
      fillRect: vi.fn(),
      getTransform: existingGetTransform,
      getImageData: existingGetImageData,
      putImageData: existingPutImageData,
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
    runWithCachedInProcessTesseractWorkerMock.mockImplementation(
      async (_args, callback) =>
        await callback({
          setParameters: setParametersMock,
          recognize: recognizeMock,
          terminate: terminateMock,
        }),
    );
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
      .mockReturnValueOnce(makeCanvas("page-two"))
      .mockReturnValueOnce(makeCanvas("factory-create"))
      .mockReturnValueOnce(makeCanvas("factory-reset"));
    recognizeMock
      .mockResolvedValueOnce({ data: { text: "Bonjour du scan" } })
      .mockResolvedValueOnce({ data: { text: "Hours are by appointment" } });

    const text = await extractPdfTextWithLocalOcr({
      blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    });
    const loadingTaskArgs = getDocumentMock.mock.calls[0]?.[0];
    const CanvasFactory = loadingTaskArgs?.CanvasFactory as
      | (new (options?: { enableHWA?: boolean; ownerDocument?: unknown }) => {
          create: (width: number, height: number) => {
            canvas: ReturnType<typeof makeCanvas> | null;
            context: ReturnType<ReturnType<typeof makeCanvas>["getContext"]> | null;
          };
          reset: (
            entry: {
              canvas: ReturnType<typeof makeCanvas> | null;
              context: ReturnType<ReturnType<typeof makeCanvas>["getContext"]> | null;
            },
            width: number,
            height: number,
          ) => void;
          destroy: (entry: {
            canvas: ReturnType<typeof makeCanvas> | null;
            context: ReturnType<ReturnType<typeof makeCanvas>["getContext"]> | null;
          }) => void;
        })
      | undefined;

    expect(text).toBe("Bonjour du scan\n\nHours are by appointment");
    expect(CanvasFactory).toEqual(expect.any(Function));
    if (!CanvasFactory) {
      throw new Error("Expected PDF.js CanvasFactory to be provided.");
    }
    expect(runWithCachedInProcessTesseractWorkerMock).toHaveBeenCalledWith({
      cacheMethod: "none",
      languages: ["eng", "fra"],
      logger: expect.any(Function),
      oem: 1,
    }, expect.any(Function));
    expect(setParametersMock).toHaveBeenCalledTimes(1);
    expect(setParametersMock).toHaveBeenCalledWith({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "3",
      user_defined_dpi: "108",
    });
    expect(firstPage.getViewport).toHaveBeenCalledWith({ scale: 1.5 });
    expect(secondPage.getViewport).toHaveBeenCalledWith({ scale: 1.5 });
    expect(getPageMock).toHaveBeenNthCalledWith(1, 1);
    expect(getPageMock).toHaveBeenNthCalledWith(2, 2);
    expect(recognizeMock).toHaveBeenNthCalledWith(1, Buffer.from("page-one"));
    expect(recognizeMock).toHaveBeenNthCalledWith(2, Buffer.from("page-two"));
    expect(firstPageCleanupMock).toHaveBeenCalledTimes(1);
    expect(secondPageCleanupMock).toHaveBeenCalledTimes(1);
    expect(documentDestroyMock).toHaveBeenCalledTimes(1);
    expect(loadingTaskDestroyMock).toHaveBeenCalledTimes(1);

    expect(CanvasFactory).toBeDefined();
    const canvasFactory = new CanvasFactory({ enableHWA: false });
    const firstEntry = canvasFactory.create(40, 50);
    const firstContext = firstEntry.context as CanvasContextWithPutImageData | null;
    expect(makeMock).toHaveBeenNthCalledWith(3, 40, 50);
    expect(firstContext?.putImageData).toEqual(expect.any(Function));
    expect(firstContext?.getTransform).toEqual(expect.any(Function));
    expect(firstContext?.putImageData).not.toBe(
      firstEntry.canvas?.__existingPutImageData,
    );
    expect(firstContext?.getTransform).not.toBe(
      firstEntry.canvas?.__existingGetTransform,
    );

    const transform = firstContext?.getTransform?.();
    expect(transform?.f).toBe(0);
    expect(typeof transform?.invertSelf).toBe("function");

    firstContext?.putImageData?.(
      new ImageData(new Uint8ClampedArray([10, 20, 30, 255]), 1, 1),
      2,
      3,
    );
    expect(firstEntry.canvas?.calculateIndex).toHaveBeenCalledWith(2, 3);
    expect(firstEntry.canvas?.data.slice(1208, 1212)).toEqual(
      new Uint8Array([10, 20, 30, 255]),
    );

    canvasFactory.reset(firstEntry, 60, 70);
    expect(makeMock).toHaveBeenNthCalledWith(4, 60, 70);

    canvasFactory.destroy(firstEntry);
    expect(firstEntry.canvas).toBeNull();
    expect(firstEntry.context).toBeNull();
  });

  it("retries OCR with single-block segmentation when the first pass is unreadable", async () => {
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
    recognizeMock
      .mockResolvedValueOnce({ data: { text: " " } })
      .mockResolvedValueOnce({ data: { text: "Readable fallback text" } });

    const text = await extractPdfTextWithLocalOcr({
      blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    });

    expect(text).toBe("Readable fallback text");
    expect(setParametersMock).toHaveBeenNthCalledWith(1, {
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "3",
      user_defined_dpi: "90",
    });
    expect(setParametersMock).toHaveBeenNthCalledWith(2, {
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "6",
      user_defined_dpi: "90",
    });
    expect(recognizeMock).toHaveBeenCalledTimes(2);
    expect(recognizeMock).toHaveBeenNthCalledWith(1, Buffer.from("page-one"));
    expect(recognizeMock).toHaveBeenNthCalledWith(2, Buffer.from("page-one"));
    expect(firstPage.getViewport).toHaveBeenCalledWith({ scale: 1.25 });
  });

  it("starts with a single locale-specific OCR language and escalates only if needed", async () => {
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

    firstPageRenderMock.mockReturnValue({ promise: Promise.resolve() });
    getPageMock.mockResolvedValue(firstPage);
    getDocumentMock.mockReturnValueOnce({
      promise: Promise.resolve(document),
      destroy: loadingTaskDestroyMock,
    });
    makeMock
      .mockReturnValueOnce(makeCanvas("page-one-fast"))
      .mockReturnValueOnce(makeCanvas("page-one-hq"));
    recognizeMock
      .mockResolvedValueOnce({ data: { text: " " } })
      .mockResolvedValueOnce({ data: { text: " " } })
      .mockResolvedValueOnce({ data: { text: "Texte lisible en francais" } });

    const text = await extractPdfTextWithLocalOcr({
      blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      languages: ["fra"],
    });

    expect(text).toBe("Texte lisible en francais");
    expect(runWithCachedInProcessTesseractWorkerMock).toHaveBeenNthCalledWith(
      1,
      {
        cacheMethod: "none",
        languages: ["fra"],
        logger: expect.any(Function),
        oem: 1,
      },
      expect.any(Function),
    );
    expect(runWithCachedInProcessTesseractWorkerMock).toHaveBeenNthCalledWith(
      2,
      {
        cacheMethod: "none",
        languages: ["fra"],
        logger: expect.any(Function),
        oem: 1,
      },
      expect.any(Function),
    );
    expect(runWithCachedInProcessTesseractWorkerMock).toHaveBeenNthCalledWith(
      3,
      {
        cacheMethod: "none",
        languages: ["eng", "fra"],
        logger: expect.any(Function),
        oem: 1,
      },
      expect.any(Function),
    );
    expect(firstPage.getViewport).toHaveBeenNthCalledWith(1, { scale: 1.25 });
    expect(firstPage.getViewport).toHaveBeenNthCalledWith(2, { scale: 2 });
    expect(setParametersMock).toHaveBeenNthCalledWith(1, {
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "3",
      user_defined_dpi: "90",
    });
    expect(setParametersMock).toHaveBeenNthCalledWith(2, {
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "6",
      user_defined_dpi: "90",
    });
    expect(setParametersMock).toHaveBeenNthCalledWith(3, {
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "3",
      user_defined_dpi: "144",
    });
  });

  it("reruns a meaningful but suspicious link reference at high quality before accepting it", async () => {
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

    firstPageRenderMock.mockReturnValue({ promise: Promise.resolve() });
    getPageMock.mockResolvedValue(firstPage);
    getDocumentMock.mockReturnValueOnce({
      promise: Promise.resolve(document),
      destroy: loadingTaskDestroyMock,
    });
    makeMock
      .mockReturnValueOnce(makeCanvas("page-one-fast"))
      .mockReturnValueOnce(makeCanvas("page-one-hq"));
    recognizeMock
      .mockResolvedValueOnce({
        data: {
          text: "Veuillez remplir le formulaire disponible à la page : rugam ndre-r r",
        },
      })
      .mockResolvedValueOnce({
        data: {
          text: "Veuillez remplir le formulaire disponible à la page : rugam ndre-r r",
        },
      })
      .mockResolvedValueOnce({
        data: {
          text: "Veuillez remplir le formulaire disponible à la page : uqam.ca/admission",
        },
      });

    const text = await extractPdfTextWithLocalOcr({
      blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      languages: ["fra"],
    });

    expect(text).toBe(
      "Veuillez remplir le formulaire disponible à la page : uqam.ca/admission",
    );
    expect(firstPage.getViewport).toHaveBeenNthCalledWith(1, { scale: 1.25 });
    expect(firstPage.getViewport).toHaveBeenNthCalledWith(2, { scale: 2 });
    expect(runWithCachedInProcessTesseractWorkerMock).toHaveBeenNthCalledWith(
      1,
      {
        cacheMethod: "none",
        languages: ["fra"],
        logger: expect.any(Function),
        oem: 1,
      },
      expect.any(Function),
    );
    expect(runWithCachedInProcessTesseractWorkerMock).toHaveBeenNthCalledWith(
      2,
      {
        cacheMethod: "none",
        languages: ["fra"],
        logger: expect.any(Function),
        oem: 1,
      },
      expect.any(Function),
    );
    expect(runWithCachedInProcessTesseractWorkerMock).toHaveBeenNthCalledWith(
      3,
      {
        cacheMethod: "none",
        languages: ["fra"],
        logger: expect.any(Function),
        oem: 1,
      },
      expect.any(Function),
    );
    expect(setParametersMock).toHaveBeenNthCalledWith(1, {
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "3",
      user_defined_dpi: "90",
    });
    expect(setParametersMock).toHaveBeenNthCalledWith(2, {
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "6",
      user_defined_dpi: "90",
    });
    expect(setParametersMock).toHaveBeenNthCalledWith(3, {
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "3",
      user_defined_dpi: "144",
    });
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

    expect(runWithCachedInProcessTesseractWorkerMock).not.toHaveBeenCalled();
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

    expect(firstPageCleanupMock).toHaveBeenCalledTimes(1);
    expect(documentDestroyMock).toHaveBeenCalledTimes(1);
    expect(loadingTaskDestroyMock).toHaveBeenCalledTimes(1);
  });
});
