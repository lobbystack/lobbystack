import { pendingUploadTarget } from "@lobbystack/domain";
import { LocalStorageProvider, LocalStorageValidationError } from "@lobbystack/providers/storage/local";
import { isUuid } from "@lobbystack/shared";

import { asApiResponse, jsonError } from "@/lib/api-helpers";
import { requireOperator } from "@/lib/operator-request";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Uploads from a partner's host. Its pages can't send a file to the bucket,
// whose CORS rules list only the host's origins, nor to a URL on the host's
// domain, so POST /api/uploads points them here, on their own origin, and this
// route sends the file on to storage.

/** The body's bytes, refusing one longer than the upload said it would be. */
async function readWithin(request: Request, length: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(request.headers.get("content-length") ?? 0) > length) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > length) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** PUT ?businessId=&objectId= with the file as the body, for an upload POST /api/uploads created. */
export async function PUT(request: Request) {
  try {
    const objectId = new URL(request.url).searchParams.get("objectId");
    if (!objectId || !isUuid(objectId)) return jsonError("An objectId is required.", 400, "invalid_request");
    const { userId, businessId, domain } = await requireOperator(request);
    const target = await pendingUploadTarget(domain, { userId, businessId, objectId });
    if (!target) return jsonError("Upload is missing or already finalized.", 404, "upload_not_found");
    if (request.headers.get("content-type") !== target.contentType) return jsonError("Uploaded object metadata does not match the requested upload.", 400, "upload_mismatch");
    const body = await readWithin(request, target.length);
    if (!body || body.byteLength !== target.length) return jsonError("Uploaded object metadata does not match the requested upload.", 400, "upload_mismatch");
    const storage = getStorageProvider();
    if (storage instanceof LocalStorageProvider) {
      await storage.putObject({ key: target.key, body, contentType: target.contentType, ...(target.checksum ? { checksum: target.checksum } : {}) });
      return new Response(null, { status: 204 });
    }
    // The same signed upload the browser gets on the host's domain, so the
    // bucket checks the length, type and checksum just as it does there.
    const upload = await storage.createUpload(target);
    // fetch sets the length from the body itself.
    const headers = Object.fromEntries(Object.entries(upload.headers).filter(([name]) => name.toLowerCase() !== "content-length"));
    const stored = await fetch(upload.url, { method: "PUT", headers, body, signal: AbortSignal.timeout(60_000) });
    if (!stored.ok) return jsonError("Storage upload failed.", 502, "storage_upload_failed");
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof LocalStorageValidationError) return jsonError(error.message, 400, "upload_mismatch");
    return asApiResponse(error);
  }
}
