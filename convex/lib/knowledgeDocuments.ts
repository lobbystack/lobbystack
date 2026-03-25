export const MAX_KNOWLEDGE_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;

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
