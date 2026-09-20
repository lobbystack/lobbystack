import { getMeter } from "@lobbystack/telemetry/node";

const textMimeTypes = new Set(["text/plain", "text/markdown", "text/x-markdown"]);
const maxOcrPdfPages = 10;
const ocrLanguages = ["eng", "fra"] as const;
const ocrDuration = getMeter("lobbystack-rag").createHistogram("rag.ocr.duration_ms", { unit: "ms" });

async function extractPdfText(body: Uint8Array): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: body });
  try {
    const result = await parser.getText();
    if (result.text.trim()) return result.text;
    if (result.total > maxOcrPdfPages) {
      throw new Error(`Scanned PDF OCR is limited to ${maxOcrPdfPages} pages.`);
    }

    const ocrStartedAt = performance.now();
    const screenshots = await parser.getScreenshot({ imageBuffer: true, imageDataUrl: false, scale: 2 });
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker([...ocrLanguages]);
    try {
      const pages: string[] = [];
      for (const page of screenshots.pages) {
        const text = (await worker.recognize(Buffer.from(page.data))).data.text.trim();
        if (text) pages.push(text);
      }
      return pages.join("\n\n");
    } finally {
      await worker.terminate();
      ocrDuration.record(performance.now() - ocrStartedAt, { source_type: "pdf", page_count: screenshots.pages.length });
    }
  } finally {
    await parser.destroy();
  }
}

export async function extractDocumentText(input: { body: Uint8Array; contentType: string }): Promise<string> {
  const contentType = input.contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (textMimeTypes.has(contentType)) return new TextDecoder().decode(input.body);
  if (contentType === "application/pdf") return await extractPdfText(input.body);
  if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const { default: mammoth } = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: Buffer.from(input.body) })).value ?? "";
  }
  if (contentType.startsWith("image/")) {
    const ocrStartedAt = performance.now();
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker([...ocrLanguages]);
    try {
      return (await worker.recognize(Buffer.from(input.body))).data.text;
    } finally {
      await worker.terminate();
      ocrDuration.record(performance.now() - ocrStartedAt, { source_type: "image" });
    }
  }
  throw new Error(`Unsupported knowledge document content type: ${contentType || "unknown"}.`);
}
