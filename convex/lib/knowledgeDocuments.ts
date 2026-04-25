export const MAX_KNOWLEDGE_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_INLINE_KNOWLEDGE_DOCUMENT_TEXT_BYTES = 256 * 1024;
const TRUNCATED_TEXT_SUFFIX = "\n\n...";

export const SUPPORTED_KNOWLEDGE_DOCUMENT_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
]);

export function isSupportedKnowledgeDocumentContentType(contentType: string): boolean {
  return SUPPORTED_KNOWLEDGE_DOCUMENT_CONTENT_TYPES.has(contentType);
}

export function inferKnowledgeDocumentContentTypeFromFileName(
  fileName: string,
): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    default:
      return null;
  }
}

export function normalizeKnowledgeDocumentText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasMeaningfulKnowledgeDocumentText(text: string): boolean {
  return text.replace(/\s+/g, " ").trim().length >= 10;
}

export function buildKnowledgeDocumentPreviewText(text: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).byteLength <= MAX_INLINE_KNOWLEDGE_DOCUMENT_TEXT_BYTES) {
    return text;
  }

  let low = 0;
  let high = text.length;
  let best = TRUNCATED_TEXT_SUFFIX.trim();

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = `${text.slice(0, middle).trimEnd()}${TRUNCATED_TEXT_SUFFIX}`;

    if (encoder.encode(candidate).byteLength <= MAX_INLINE_KNOWLEDGE_DOCUMENT_TEXT_BYTES) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return best;
}
