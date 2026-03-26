"use node";

import { PassThrough } from "node:stream";

import mammoth from "mammoth";
import { encodePNGToStream, make } from "pureimage";

import { createInProcessTesseractWorker } from "./tesseractInProcessWorker";

type PdfJsWorkerGlobal = typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler?: unknown;
  };
};

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfJsWorkerModule = {
  WorkerMessageHandler?: unknown;
};
type PdfLoadingTask = ReturnType<PdfJsModule["getDocument"]>;
type PdfDocument = Awaited<PdfLoadingTask["promise"]>;
type PdfRenderBitmap = ReturnType<typeof make>;
type PdfRenderContext = ReturnType<PdfRenderBitmap["getContext"]> & {
  createImageData?: (width: number, height: number) => ImageData;
  getContextAttributes?: () => { alpha: boolean };
};

export const KNOWLEDGE_DOCUMENT_OCR_MAX_PAGES = 10;
export const KNOWLEDGE_DOCUMENT_OCR_LANGUAGES = ["eng", "fra"] as const;
export const KNOWLEDGE_DOCUMENT_OCR_PAGE_LIMIT_ERROR = `We can only OCR PDFs up to ${KNOWLEDGE_DOCUMENT_OCR_MAX_PAGES} pages right now. Upload a searchable PDF or split this file into smaller parts.`;
export const KNOWLEDGE_DOCUMENT_OCR_UNREADABLE_ERROR =
  "We couldn't extract enough readable text from this PDF, even after OCR. Upload a searchable PDF or a clearer scan.";
export const KNOWLEDGE_DOCUMENT_OCR_PROCESSING_ERROR =
  "We couldn't OCR this PDF locally. Upload a searchable PDF or a clearer scan.";

const KNOWLEDGE_DOCUMENT_OCR_RENDER_SCALE = 2;
const TESSERACT_OEM_LSTM_ONLY = 1;
const TESSERACT_PSM_AUTO = "3";

let pdfJsModulesPromise: Promise<{
  pdfjs: PdfJsModule;
  pdfjsWorker: PdfJsWorkerModule;
}> | null = null;

function ensurePdfParseGlobals(): void {
  if (typeof globalThis.DOMMatrix === "undefined") {
    class MinimalDOMMatrix {
      multiplySelf(): this {
        return this;
      }

      preMultiplySelf(): this {
        return this;
      }

      translateSelf(): this {
        return this;
      }

      scaleSelf(): this {
        return this;
      }

      rotateSelf(): this {
        return this;
      }

      invertSelf(): this {
        return this;
      }

      transformPoint<T>(point: T): T {
        return point;
      }
    }

    globalThis.DOMMatrix = MinimalDOMMatrix as unknown as typeof globalThis.DOMMatrix;
  }

  if (typeof globalThis.ImageData === "undefined") {
    class MinimalImageData {
      colorSpace = "srgb" as const;
      data: Uint8ClampedArray;
      height: number;
      width: number;

      constructor(
        dataOrWidth: Uint8ClampedArray | number,
        widthOrHeight: number,
        maybeHeight?: number,
      ) {
        if (typeof dataOrWidth === "number") {
          this.width = dataOrWidth;
          this.height = widthOrHeight;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
          return;
        }

        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = maybeHeight ?? 0;
      }
    }

    globalThis.ImageData = MinimalImageData as unknown as typeof globalThis.ImageData;
  }

  if (typeof globalThis.Path2D === "undefined") {
    class MinimalPath2D {}
    globalThis.Path2D = MinimalPath2D as unknown as typeof globalThis.Path2D;
  }
}

async function loadPdfJsModules(): Promise<{
  pdfjs: PdfJsModule;
  pdfjsWorker: PdfJsWorkerModule;
}> {
  ensurePdfParseGlobals();

  if (!pdfJsModulesPromise) {
    pdfJsModulesPromise = (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      // @ts-expect-error pdfjs-dist does not publish typings for the worker bundle entrypoint.
      const pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      return { pdfjs, pdfjsWorker };
    })();
  }

  return await pdfJsModulesPromise;
}

async function ensurePdfJsWorkerInstalled(): Promise<PdfJsModule> {
  const { pdfjs, pdfjsWorker } = await loadPdfJsModules();

  const globalWithPdfWorker = globalThis as PdfJsWorkerGlobal;
  if (!globalWithPdfWorker.pdfjsWorker?.WorkerMessageHandler) {
    globalWithPdfWorker.pdfjsWorker = {
      WorkerMessageHandler: pdfjsWorker.WorkerMessageHandler,
    };
  }

  return pdfjs;
}

async function withLoadedPdfDocument<T>(
  buffer: Buffer,
  callback: (input: { document: PdfDocument; pdfjs: PdfJsModule }) => Promise<T>,
): Promise<T> {
  const pdfjs = await ensurePdfJsWorkerInstalled();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    useWorkerFetch: false,
  });

  try {
    const document = await loadingTask.promise;

    try {
      return await callback({ document, pdfjs });
    } finally {
      await document.destroy();
    }
  } finally {
    await loadingTask.destroy();
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  return await withLoadedPdfDocument(buffer, async ({ document }) => {
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);

      try {
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => {
            if (!("str" in item)) {
              return "";
            }

            return item.hasEOL ? `${item.str}\n` : item.str;
          })
          .join("")
          .trim();

        if (pageText.length > 0) {
          pages.push(pageText);
        }
      } finally {
        page.cleanup();
      }
    }

    return pages.join("\n\n");
  });
}

function createPdfRenderSurface(
  width: number,
  height: number,
): {
  canvas: PdfRenderBitmap;
  canvasContext: PdfRenderContext;
} {
  const canvas = make(width, height);
  const canvasContext = canvas.getContext("2d") as PdfRenderContext;

  if (typeof canvasContext.createImageData !== "function") {
    canvasContext.createImageData = (surfaceWidth: number, surfaceHeight: number) =>
      new ImageData(surfaceWidth, surfaceHeight);
  }

  if (typeof canvasContext.getContextAttributes !== "function") {
    canvasContext.getContextAttributes = () => ({ alpha: true });
  }

  return {
    canvas,
    canvasContext,
  };
}

async function encodeBitmapToPngBuffer(bitmap: PdfRenderBitmap): Promise<Buffer> {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];

  stream.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  await encodePNGToStream(bitmap, stream);
  return Buffer.concat(chunks);
}

type ExtractKnowledgeDocumentTextArgs = {
  blob: Blob;
  mimeType: string;
};

type ExtractPdfTextWithLocalOcrArgs = {
  blob: Blob;
  languages?: ReadonlyArray<string>;
  maxPages?: number;
};

export async function extractKnowledgeDocumentText(
  args: ExtractKnowledgeDocumentTextArgs,
): Promise<string> {
  const buffer = Buffer.from(await args.blob.arrayBuffer());

  switch (args.mimeType) {
    case "text/plain":
    case "text/markdown":
    case "text/x-markdown":
      return buffer.toString("utf-8");
    case "application/pdf":
      return await extractPdfText(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    }
    default:
      throw new Error("This document type is not supported.");
  }
}

export async function extractPdfTextWithLocalOcr(
  args: ExtractPdfTextWithLocalOcrArgs,
): Promise<string> {
  const buffer = Buffer.from(await args.blob.arrayBuffer());
  const maxPages = args.maxPages ?? KNOWLEDGE_DOCUMENT_OCR_MAX_PAGES;
  const languages = args.languages ?? KNOWLEDGE_DOCUMENT_OCR_LANGUAGES;

  return await withLoadedPdfDocument(buffer, async ({ document }) => {
    if (document.numPages > maxPages) {
      throw new Error(KNOWLEDGE_DOCUMENT_OCR_PAGE_LIMIT_ERROR);
    }

    let worker: Awaited<ReturnType<typeof createInProcessTesseractWorker>> | null = null;

    try {
      worker = await createInProcessTesseractWorker({
        cacheMethod: "none",
        languages,
        logger: () => undefined,
        oem: TESSERACT_OEM_LSTM_ONLY,
      });

      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: TESSERACT_PSM_AUTO,
        user_defined_dpi: "144",
      });

      const pages: string[] = [];

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);

        try {
          const viewport = page.getViewport({ scale: KNOWLEDGE_DOCUMENT_OCR_RENDER_SCALE });
          const { canvas, canvasContext } = createPdfRenderSurface(
            Math.max(1, Math.ceil(viewport.width)),
            Math.max(1, Math.ceil(viewport.height)),
          );
          canvasContext.fillStyle = "#ffffff";
          canvasContext.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({
            canvas: canvas as unknown as HTMLCanvasElement,
            canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
            viewport,
          }).promise;

          const imageBuffer = await encodeBitmapToPngBuffer(canvas);
          const result = await worker.recognize(imageBuffer);
          const pageText = result.data.text.trim();

          if (pageText.length > 0) {
            pages.push(pageText);
          }
        } finally {
          page.cleanup();
        }
      }

      return pages.join("\n\n");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === KNOWLEDGE_DOCUMENT_OCR_PAGE_LIMIT_ERROR
      ) {
        throw error;
      }

      throw new Error(KNOWLEDGE_DOCUMENT_OCR_PROCESSING_ERROR);
    } finally {
      if (worker) {
        await worker.terminate();
      }
    }
  });
}
