"use node";

import mammoth from "mammoth";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

type PdfJsWorkerGlobal = typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler?: unknown;
  };
};

async function ensurePdfParseGlobals(): Promise<void> {
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

  const globalWithPdfWorker = globalThis as PdfJsWorkerGlobal;
  if (!globalWithPdfWorker.pdfjsWorker?.WorkerMessageHandler) {
    // @ts-expect-error pdfjs-dist does not publish typings for the worker bundle entrypoint.
    const pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    globalWithPdfWorker.pdfjsWorker = {
      WorkerMessageHandler: pdfjsWorker.WorkerMessageHandler,
    };
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  await ensurePdfParseGlobals();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    useWorkerFetch: false,
  });

  try {
    const document = await loadingTask.promise;

    try {
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
    } finally {
      await document.destroy();
    }
  } finally {
    await loadingTask.destroy();
  }
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
