import { Readable } from "node:stream";

import { LocalStorageProvider, LocalStorageValidationError, createStorageProvider } from "@lobbystack/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localStorage(): LocalStorageProvider {
  const storage = createStorageProvider();
  if (!(storage instanceof LocalStorageProvider)) throw new Error("Local storage is not enabled.");
  return storage;
}

function tokenFrom(request: Request): string {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) throw new Error("Missing storage token.");
  return token;
}

async function* requestBody(request: Request): AsyncGenerator<Uint8Array> {
  if (!request.body) return;
  const reader = request.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return;
      yield chunk.value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function PUT(request: Request) {
  try {
    const storage = localStorage();
    const claims = storage.verifyToken(tokenFrom(request), "upload");
    if (claims.length === undefined || !claims.contentType) return Response.json({ error: "Invalid storage token." }, { status: 403 });
    if (request.headers.get("content-type") !== claims.contentType) {
      return Response.json({ error: "Uploaded object metadata does not match the signed request." }, { status: 400 });
    }
    if (claims.checksum && request.headers.get("x-lobbystack-checksum-sha256") !== claims.checksum) {
      return Response.json({ error: "Uploaded object checksum does not match the signed request." }, { status: 400 });
    }
    await storage.putObjectStream({
      key: claims.key,
      body: requestBody(request),
      contentType: claims.contentType,
      expectedLength: claims.length,
      ...(claims.checksum ? { expectedChecksum: claims.checksum } : {}),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Storage upload failed.";
    return Response.json({ error: message }, { status: message.includes("token") ? 403 : error instanceof LocalStorageValidationError ? 400 : 500 });
  }
}

export async function GET(request: Request) {
  try {
    const storage = localStorage();
    const claims = storage.verifyToken(tokenFrom(request), "download");
    const metadata = await storage.headObject({ key: claims.key });
    if (!metadata) return Response.json({ error: "Object not found." }, { status: 404 });
    const range = claims.range ?? request.headers.get("range") ?? undefined;
    const object = await storage.openObject({ key: claims.key, ...(range ? { range } : {}) });
    const headers = new Headers({
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
      "content-length": String(object.length),
      "content-type": metadata.contentType,
    });
    if (range) {
      headers.set("content-range", `bytes ${object.start}-${object.end}/${object.totalLength}`);
    }
    return new Response(Readable.toWeb(object.body) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Storage download failed.";
    const status = message.includes("range") ? 416 : message.includes("token") ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
