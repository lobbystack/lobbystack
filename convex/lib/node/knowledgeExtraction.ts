"use node";

import mammoth from "mammoth";
import type { PDFParse as PDFParseClass } from "pdf-parse";

let pdfParseModulePromise: Promise<{ PDFParse: typeof PDFParseClass }> | null = null;

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
    pdfParseModulePromise = import("pdf-parse");
  }

  return await pdfParseModulePromise;
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
