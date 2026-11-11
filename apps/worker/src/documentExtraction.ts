import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { inflateRawSync } from "node:zlib";

const textMimeTypes = new Set(["text/plain", "text/markdown", "text/x-markdown"]);
const maxOcrPdfPages = 10;
const ocrLanguages = ["eng", "fra"] as const;
// Uploads are at most 10 MB, so only a compressed file can unpack to more text than this.
const maxExtractedTextLength = 10 * 1024 * 1024;
const maxInflatedDocxBytes = 256 * 1024 * 1024;

/**
 * Inflates every .docx entry with a cap before mammoth runs, because JSZip
 * inflates into ArrayBuffers that the thread's heap limit does not cover.
 * Finds entries the way JSZip does, so a crafted archive can't show this check
 * different data than JSZip later reads.
 */
export function assertDocxInflatesWithin(body: Uint8Array, limit = maxInflatedDocxBytes): void {
  const zip = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  const end = zip.lastIndexOf(Buffer.from("PK\x05\x06", "latin1"));
  // Not a zip, or a truncated one: JSZip rejects it before inflating anything.
  if (end < 0 || end + 22 > zip.length) return;
  // JSZip would read ZIP64 records instead of these fields, and no 10 MB .docx needs them.
  if ([4, 6, 8, 10].some((at) => zip.readUInt16LE(end + at) === 0xffff) || [12, 16].some((at) => zip.readUInt32LE(end + at) === 0xffffffff)) throw new Error("ZIP64 .docx files are not supported.");
  // Bytes in front of the archive shift every offset, as in JSZip.
  const prefix = end - zip.readUInt32LE(end + 12) - zip.readUInt32LE(end + 16);
  if (prefix < 0) return;
  let inflated = 0;
  // JSZip reads every consecutive directory entry, whatever count the end record gives.
  for (let entry = prefix + zip.readUInt32LE(end + 16); entry + 46 <= zip.length && zip.readUInt32LE(entry) === 0x02014b50; entry += 46 + zip.readUInt16LE(entry + 28) + zip.readUInt16LE(entry + 30) + zip.readUInt16LE(entry + 32)) {
    if (zip.readUInt16LE(entry + 10) !== 8) continue;
    const local = prefix + zip.readUInt32LE(entry + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    try {
      inflated += inflateRawSync(zip.subarray(start, start + zip.readUInt32LE(entry + 20)), { maxOutputLength: Math.max(1, limit - inflated) }).length;
    } catch (error) {
      // A damaged or empty entry fails in JSZip too, so only the size cap rejects the file here.
      if ((error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") throw new Error(`The .docx unpacks to more than ${limit} bytes.`);
    }
  }
}

export type DocumentInput = { body: Uint8Array; contentType: string };
export type OcrRecorder = (durationMs: number, attributes: { source_type: string; page_count?: number }) => void;
type ThreadMessage = { ocr: Parameters<OcrRecorder> } | { text: string };

async function extractPdfText(body: Uint8Array, recordOcr: OcrRecorder): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: body });
  try {
    // The default joiner adds "-- 1 of 12 --" markers, which would hide a scan's missing text layer.
    const result = await parser.getText({ pageJoiner: "" });
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
      recordOcr(performance.now() - ocrStartedAt, { source_type: "pdf", page_count: screenshots.pages.length });
    }
  } finally {
    await parser.destroy();
  }
}

export async function extractDocumentText(input: DocumentInput, recordOcr: OcrRecorder = () => undefined): Promise<string> {
  const contentType = input.contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (textMimeTypes.has(contentType)) return new TextDecoder().decode(input.body);
  if (contentType === "application/pdf") return await extractPdfText(input.body, recordOcr);
  if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    assertDocxInflatesWithin(input.body);
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
      recordOcr(performance.now() - ocrStartedAt, { source_type: "image" });
    }
  }
  throw new Error(`Unsupported knowledge document content type: ${contentType || "unknown"}.`);
}

/**
 * Extracts text in a worker thread with its own heap limit and deadline, so a
 * crafted file that exhausts the parser's heap kills only this thread, not the
 * process that also runs live calls and every other job.
 * shortcut: the limit covers the V8 heap, not ArrayBuffers. .docx entries are
 * capped above, but a PDF's compressed streams are not; run extraction in a
 * child process with a memory limit if PDF bombs become a real threat.
 */
export async function extractDocumentTextInThread(input: DocumentInput, recordOcr: OcrRecorder, limits = { maxHeapMb: 512, timeoutMs: 5 * 60_000 }): Promise<string> {
  // The build emits this module as its own entry beside index.js; dev and tests load the .ts source.
  const thread = new Worker(new URL(`./documentExtraction.${import.meta.url.endsWith(".ts") ? "ts" : "js"}`, import.meta.url), {
    workerData: { documentExtraction: input },
    resourceLimits: { maxOldGenerationSizeMb: limits.maxHeapMb },
  });
  let timer: NodeJS.Timeout | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Document extraction timed out after ${limits.timeoutMs} ms.`)), limits.timeoutMs);
      thread.on("message", (message: ThreadMessage) => {
        if ("ocr" in message) recordOcr(...message.ocr);
        else resolve(message.text);
      });
      thread.on("error", reject);
      thread.on("exit", (code) => reject(new Error(`Document extraction thread exited with code ${code}.`)));
    });
  } finally {
    clearTimeout(timer);
    await thread.terminate();
  }
}

if (!isMainThread && workerData?.documentExtraction) {
  const post = (message: ThreadMessage) => parentPort?.postMessage(message);
  const text = await extractDocumentText(workerData.documentExtraction, (...ocr) => post({ ocr }));
  if (text.length > maxExtractedTextLength) throw new Error(`Extracted text is longer than ${maxExtractedTextLength} characters.`);
  post({ text });
}
