"use node";

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import mammoth from "mammoth";
import type { PDFParse as PDFParseClass } from "pdf-parse";

const require = createRequire(import.meta.url);

let pdfParseModulePromise: Promise<{ PDFParse: typeof PDFParseClass }> | null = null;
let pdfWorkerSourcePromise: Promise<string | null> | null = null;
let pdfWorkerInstallPromise: Promise<void> | null = null;

type PdfJsWorkerGlobal = typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler?: unknown;
  };
};

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

    globalThis.DOMMatrix = MinimalDOMMatrix as unknown as typeof DOMMatrix;
  }

  if (typeof globalThis.ImageData === "undefined") {
    class MinimalImageData {}
    globalThis.ImageData = MinimalImageData as unknown as typeof ImageData;
  }

  if (typeof globalThis.Path2D === "undefined") {
    class MinimalPath2D {}
    globalThis.Path2D = MinimalPath2D as unknown as typeof Path2D;
  }
}

async function loadPdfParseModule(): Promise<{ PDFParse: typeof PDFParseClass }> {
  ensurePdfParseGlobals();
  if (!pdfParseModulePromise) {
    pdfParseModulePromise = (async () => {
      const [pdfParseModule, pdfWorkerSource] = await Promise.all([
        import("pdf-parse"),
        ensurePdfWorkerInstalled(),
      ]);

      if (pdfWorkerSource) {
        pdfParseModule.PDFParse.setWorker(pdfWorkerSource);
      }

      return pdfParseModule;
    })();
  }

  return await pdfParseModulePromise;
}

async function loadPdfWorkerSource(): Promise<string | null> {
  if (!pdfWorkerSourcePromise) {
    pdfWorkerSourcePromise = (async () => {
      try {
        const workerModulePath = require.resolve("pdf-parse/worker");
        const workerModuleSource = await readFile(workerModulePath, "utf8");
        const workerSourceMatch = workerModuleSource.match(
          /["'`](data:text\/javascript;base64,[^"'`]+)["'`]/,
        );

        return workerSourceMatch?.[1] ?? null;
      } catch (error) {
        console.warn("Unable to resolve pdf-parse worker source.", error);
        return null;
      }
    })();
  }

  return await pdfWorkerSourcePromise;
}

async function ensurePdfWorkerInstalled(): Promise<string | null> {
  const workerSource = await loadPdfWorkerSource();
  if (!workerSource) {
    return null;
  }

  const globalWithPdfWorker = globalThis as PdfJsWorkerGlobal;

  if (globalWithPdfWorker.pdfjsWorker?.WorkerMessageHandler) {
    return workerSource;
  }

  if (!pdfWorkerInstallPromise) {
    pdfWorkerInstallPromise = (async () => {
      try {
        const workerModule = await import(workerSource);
        if (workerModule.WorkerMessageHandler) {
          globalWithPdfWorker.pdfjsWorker = {
            WorkerMessageHandler: workerModule.WorkerMessageHandler,
          };
        }
      } catch (error) {
        console.warn("Unable to install pdf.js worker module.", error);
      }
    })();
  }

  await pdfWorkerInstallPromise;
  return workerSource;
}

type ExtractKnowledgeDocumentTextArgs = {
  blob: Blob;
  mimeType: string;
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
    case "application/pdf": {
      const { PDFParse } = await loadPdfParseModule();
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text ?? "";
      } finally {
        await parser.destroy();
      }
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    }
    default:
      throw new Error("This document type is not supported.");
  }
}
