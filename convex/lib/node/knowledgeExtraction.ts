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
type BrowserInteropCanvasContext = {
  createImageData?: (width: number, height: number) => ImageData;
  getContextAttributes?: () => { alpha: boolean };
  getTransform?: () => DOMMatrix;
  getImageData?: (
    sx: number,
    sy: number,
    sw: number,
    sh: number,
  ) => ImageData;
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
type PdfJsCanvasEntry = {
  canvas: PdfRenderBitmap | null;
  context: PdfRenderContext | null;
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
      a: number;
      b: number;
      c: number;
      d: number;
      e: number;
      f: number;
      is2D = true;
      isIdentity = false;

      constructor(
        init?:
          | number[]
          | {
              a?: number;
              b?: number;
              c?: number;
              d?: number;
              e?: number;
              f?: number;
            },
      ) {
        const values = Array.isArray(init)
          ? init
          : init && typeof init === "object"
            ? [
                init.a ?? 1,
                init.b ?? 0,
                init.c ?? 0,
                init.d ?? 1,
                init.e ?? 0,
                init.f ?? 0,
              ]
            : [1, 0, 0, 1, 0, 0];

        this.a = values[0] ?? 1;
        this.b = values[1] ?? 0;
        this.c = values[2] ?? 0;
        this.d = values[3] ?? 1;
        this.e = values[4] ?? 0;
        this.f = values[5] ?? 0;
        this.isIdentity =
          this.a === 1 &&
          this.b === 0 &&
          this.c === 0 &&
          this.d === 1 &&
          this.e === 0 &&
          this.f === 0;
      }

      private multiplyMatrices(
        left: [number, number, number, number, number, number],
        right: [number, number, number, number, number, number],
      ): [number, number, number, number, number, number] {
        return [
          left[0] * right[0] + left[2] * right[1],
          left[1] * right[0] + left[3] * right[1],
          left[0] * right[2] + left[2] * right[3],
          left[1] * right[2] + left[3] * right[3],
          left[0] * right[4] + left[2] * right[5] + left[4],
          left[1] * right[4] + left[3] * right[5] + left[5],
        ];
      }

      private setFromArray(values: [number, number, number, number, number, number]): this {
        this.a = values[0];
        this.b = values[1];
        this.c = values[2];
        this.d = values[3];
        this.e = values[4];
        this.f = values[5];
        this.isIdentity =
          this.a === 1 &&
          this.b === 0 &&
          this.c === 0 &&
          this.d === 1 &&
          this.e === 0 &&
          this.f === 0;
        return this;
      }

      private toArray(): [number, number, number, number, number, number] {
        return [this.a, this.b, this.c, this.d, this.e, this.f];
      }

      multiplySelf(other?: MinimalDOMMatrix): this {
        if (!other) {
          return this;
        }

        return this.setFromArray(
          this.multiplyMatrices(this.toArray(), [
            other.a,
            other.b,
            other.c,
            other.d,
            other.e,
            other.f,
          ]),
        );
      }

      preMultiplySelf(other?: MinimalDOMMatrix): this {
        if (!other) {
          return this;
        }

        return this.setFromArray(
          this.multiplyMatrices(
            [other.a, other.b, other.c, other.d, other.e, other.f],
            this.toArray(),
          ),
        );
      }

      translateSelf(tx = 0, ty = 0): this {
        return this.multiplySelf(new MinimalDOMMatrix([1, 0, 0, 1, tx, ty]));
      }

      scaleSelf(scaleX = 1, scaleY = scaleX): this {
        return this.multiplySelf(
          new MinimalDOMMatrix([scaleX, 0, 0, scaleY, 0, 0]),
        );
      }

      rotateSelf(angle = 0): this {
        const radians = (angle * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        return this.multiplySelf(
          new MinimalDOMMatrix([cos, sin, -sin, cos, 0, 0]),
        );
      }

      invertSelf(): this {
        const determinant = this.a * this.d - this.b * this.c;
        if (!Number.isFinite(determinant) || determinant === 0) {
          return this.setFromArray([NaN, NaN, NaN, NaN, NaN, NaN]);
        }

        const inverseDeterminant = 1 / determinant;
        return this.setFromArray([
          this.d * inverseDeterminant,
          -this.b * inverseDeterminant,
          -this.c * inverseDeterminant,
          this.a * inverseDeterminant,
          (this.c * this.f - this.d * this.e) * inverseDeterminant,
          (this.b * this.e - this.a * this.f) * inverseDeterminant,
        ]);
      }

      transformPoint<T extends { x: number; y: number }>(point: T): T {
        return {
          ...point,
          x: point.x * this.a + point.y * this.c + this.e,
          y: point.x * this.b + point.y * this.d + this.f,
        };
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
    CanvasFactory: PureImageCanvasFactory,
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
  const canvasContext = canvas.getContext("2d") as unknown as PdfRenderContext;
  const interopContext = canvasContext as unknown as BrowserInteropCanvasContext;

  if (typeof interopContext.createImageData !== "function") {
    interopContext.createImageData = (surfaceWidth: number, surfaceHeight: number) =>
      new ImageData(surfaceWidth, surfaceHeight);
  }

  if (typeof interopContext.getContextAttributes !== "function") {
    interopContext.getContextAttributes = () => ({ alpha: true });
  }

  interopContext.getTransform = () => {
    const transformState = (
      canvasContext as unknown as {
        _transform?: { getMatrix?: () => [number, number, number, number, number, number] };
      }
    )._transform;
    const matrix =
      typeof transformState?.getMatrix === "function"
        ? transformState.getMatrix()
        : [1, 0, 0, 1, 0, 0];

    return new DOMMatrix(matrix);
  };

  interopContext.getImageData = (
    sx: number,
    sy: number,
    sw: number,
    sh: number,
  ) => {
    const safeWidth = Math.max(0, Math.floor(sw));
    const safeHeight = Math.max(0, Math.floor(sh));
    const imageData = new ImageData(safeWidth, safeHeight);

    for (let y = 0; y < safeHeight; y += 1) {
      for (let x = 0; x < safeWidth; x += 1) {
        const sourceX = Math.floor(sx) + x;
        const sourceY = Math.floor(sy) + y;
        const targetIndex = (y * safeWidth + x) * 4;

        if (
          sourceX < 0 ||
          sourceY < 0 ||
          sourceX >= canvas.width ||
          sourceY >= canvas.height
        ) {
          imageData.data[targetIndex + 3] = 0;
          continue;
        }

        const sourceIndex = Number(canvas.calculateIndex(sourceX, sourceY));
        imageData.data[targetIndex] = canvas.data[sourceIndex] ?? 0;
        imageData.data[targetIndex + 1] = canvas.data[sourceIndex + 1] ?? 0;
        imageData.data[targetIndex + 2] = canvas.data[sourceIndex + 2] ?? 0;
        imageData.data[targetIndex + 3] = canvas.data[sourceIndex + 3] ?? 0;
      }
    }

    return imageData;
  };

  interopContext.putImageData = (
    imageData: ImageData,
    dx: number,
    dy: number,
    dirtyX = 0,
    dirtyY = 0,
    dirtyWidth = imageData.width,
    dirtyHeight = imageData.height,
  ) => {
    const startX = Math.max(
      0,
      Math.floor(typeof dirtyX === "number" ? dirtyX : 0),
    );
    const startY = Math.max(
      0,
      Math.floor(typeof dirtyY === "number" ? dirtyY : 0),
    );
    const copyWidth = Math.max(
      0,
      Math.floor(typeof dirtyWidth === "number" ? dirtyWidth : imageData.width),
    );
    const copyHeight = Math.max(
      0,
      Math.floor(typeof dirtyHeight === "number" ? dirtyHeight : imageData.height),
    );

    for (let y = 0; y < copyHeight; y += 1) {
      for (let x = 0; x < copyWidth; x += 1) {
        const sourceX = startX + x;
        const sourceY = startY + y;
        const targetX = Math.floor(dx) + sourceX;
        const targetY = Math.floor(dy) + sourceY;

        if (
          sourceX < 0 ||
          sourceY < 0 ||
          sourceX >= imageData.width ||
          sourceY >= imageData.height ||
          targetX < 0 ||
          targetY < 0 ||
          targetX >= canvas.width ||
          targetY >= canvas.height
        ) {
          continue;
        }

        const sourceIndex = (sourceY * imageData.width + sourceX) * 4;
        const targetIndex = Number(canvas.calculateIndex(targetX, targetY));
        canvas.data[targetIndex] = imageData.data[sourceIndex] ?? 0;
        canvas.data[targetIndex + 1] = imageData.data[sourceIndex + 1] ?? 0;
        canvas.data[targetIndex + 2] = imageData.data[sourceIndex + 2] ?? 0;
        canvas.data[targetIndex + 3] = imageData.data[sourceIndex + 3] ?? 0;
      }
    }
  };

  return {
    canvas,
    canvasContext,
  };
}

class PureImageCanvasFactory {
  constructor(_options?: { enableHWA?: boolean; ownerDocument?: unknown }) {}

  create(width: number, height: number): PdfJsCanvasEntry {
    if (width <= 0 || height <= 0) {
      throw new Error("Invalid canvas size");
    }

    const { canvas, canvasContext } = createPdfRenderSurface(width, height);
    return {
      canvas,
      context: canvasContext,
    };
  }

  reset(canvasAndContext: PdfJsCanvasEntry, width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new Error("Invalid canvas size");
    }

    const { canvas, canvasContext } = createPdfRenderSurface(width, height);
    canvasAndContext.canvas = canvas;
    canvasAndContext.context = canvasContext;
  }

  destroy(canvasAndContext: PdfJsCanvasEntry): void {
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
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

      console.error("Local PDF OCR failed", {
        error:
          error instanceof Error
            ? {
                message: error.message,
                name: error.name,
                stack: error.stack,
              }
            : error,
      });

      throw new Error(KNOWLEDGE_DOCUMENT_OCR_PROCESSING_ERROR);
    } finally {
      if (worker) {
        await worker.terminate();
      }
    }
  });
}
