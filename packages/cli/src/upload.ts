import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

import { KNOWLEDGE_UPLOAD_MAX_BYTES } from "@lobbystack/shared";

import type { Client } from "./client";
import { CliError, exitCodes } from "./errors";
import type { Row } from "./operations";

const uploadTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

/** A file's bytes and what the upload says about them. */
export type UploadFile = { name: string; contentType: string; bytes: Buffer; sha256: string };

/** A file's bytes and what the upload needs to say about them, or why it can't be uploaded. */
export async function readUploadFile(path: string): Promise<UploadFile> {
  const name = basename(path);
  const contentType = uploadTypes[extname(path).toLowerCase()];
  if (!contentType) throw new CliError(`${name} isn't a type the receptionist reads. Upload a PDF, Word (.docx), text, Markdown, JPEG, PNG, WebP or TIFF file.`);
  const size = await stat(path).then((info) => info.size, (error: Error) => { throw new CliError(`Couldn't read ${path}: ${error.message}`); });
  if (size === 0 || size > KNOWLEDGE_UPLOAD_MAX_BYTES) throw new CliError(`${name} has to be between 1 byte and 10 MB.`);
  const bytes = await readFile(path);
  return { name, contentType, bytes, sha256: createHash("sha256").update(bytes).digest("base64") };
}

/**
 * Uploads a document as knowledge: reserves the upload, sends the bytes to
 * the signed URL it returns, and completes it. The signed URL gets the bytes,
 * never the API key, and a redirect away from it is refused.
 */
export async function uploadKnowledgeFile(client: Client, options: UploadDetails & { baseUrl: string; fetch: typeof fetch; file: UploadFile; onReserved?(uploadId: string): Promise<void> }): Promise<Row> {
  const { file } = options;
  const upload = (await client.call("createKnowledgeUpload", { body: { file_name: file.name, content_type: file.contentType as never, length: file.bytes.length, checksum_sha256: file.sha256 } })).data;
  await options.onReserved?.(upload.upload_id);
  let stored: Response;
  try {
    stored = await options.fetch(new URL(upload.upload_url, options.baseUrl), { method: "PUT", headers: upload.upload_headers, body: new Uint8Array(file.bytes), redirect: "error", signal: AbortSignal.timeout(5 * 60_000) });
  } catch (error) {
    throw new CliError(`Couldn't send ${file.name} to storage: ${(error as Error).message}`, exitCodes.failed);
  }
  if (!stored.ok) throw new CliError(`Storage refused ${file.name} with status ${stored.status}. Try again for a new upload.`, exitCodes.failed);
  return await completeUpload(client, upload.upload_id, options);
}

/** What an uploaded document is called and tagged. */
export type UploadDetails = { title?: string | undefined; tags?: string[] | undefined };

/** Makes an upload that has arrived a source. Completing it again returns the same source. */
export async function completeUpload(client: Client, uploadId: string, details: UploadDetails): Promise<Row> {
  return (await client.call("completeKnowledgeUpload", { params: { upload_id: uploadId }, body: { ...(details.title ? { title: details.title } : {}), ...(details.tags?.length ? { tags: details.tags } : {}) } })).data as Row;
}
