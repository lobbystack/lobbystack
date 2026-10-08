import { captureBrowserError } from "./browser-error-reporting";
import { requestJson } from "./request-json";

/**
 * Uploads a knowledge document: reserves the object, sends the file to
 * storage, then finalizes it so indexing starts.
 */
export async function uploadKnowledgeDocument(input: { businessId: string; file: File; contentType: string; title?: string; tags?: string[] }, failedMessage: string): Promise<void> {
  const { businessId, file, contentType, title, tags } = input;
  const digest = await checksum(file);
  const created = await requestJson<{ objectId: string; url: string; headers?: Record<string, string> }>("/api/uploads", { method: "POST", body: JSON.stringify({ businessId, purpose: "knowledge", fileName: file.name, contentType, length: file.size, checksum: digest }) });
  await uploadToStorage(created, file, failedMessage);
  await requestJson("/api/uploads", { method: "PUT", body: JSON.stringify({ businessId, objectId: created.objectId, length: file.size, contentType, checksum: digest, title, tags }) });
}

/** Shows the server's own upload limits as they are and anything else as `fallbackMessage`. */
export function uploadErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof Error) || !error.message) return fallbackMessage;
  if (
    error.message === "Documents must be 10 MB or smaller." ||
    error.message === "Supported document types are PDF, DOCX, TXT, and Markdown." ||
    error.message.startsWith("Knowledge storage limit reached.")
  ) return error.message;
  return fallbackMessage;
}

/**
 * Sends a file to its presigned storage URL. The request goes from the browser
 * straight to the bucket and never reaches our server, so a failure is
 * reported here or nowhere. Callers get `failedMessage` to show the operator.
 */
export async function uploadToStorage(upload: { url: string; headers?: Record<string, string> }, file: File, failedMessage: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(upload.url, { method: "PUT", ...(upload.headers ? { headers: upload.headers } : {}), body: file });
  } catch (cause) {
    // A blocked CORS preflight or a dropped connection lands here.
    captureBrowserError(new Error(`Storage upload to ${storageHost(upload.url)} failed without a response: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }));
    throw new Error(failedMessage, { cause });
  }
  if (!response.ok) {
    captureBrowserError(new Error(`Storage upload to ${storageHost(upload.url)} failed with HTTP ${response.status}.`));
    throw new Error(failedMessage);
  }
}

async function checksum(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function storageHost(url: string): string {
  try {
    return new URL(url, globalThis.location?.href).host;
  } catch {
    return "storage";
  }
}
