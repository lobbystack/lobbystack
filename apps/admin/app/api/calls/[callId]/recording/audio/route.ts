import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { InvalidByteRangeError } from "@lobbystack/providers/storage/range";
import { operatorRoute } from "@/lib/operator-request";
import { getStorageProvider } from "@/lib/storage";
import { callRecordingObject } from "../recording-object";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `attachment; filename=...` with an ASCII fallback and the UTF-8 name. */
function attachment(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * The recording's bytes, streamed from storage on the dashboard's own origin.
 * The player reads them to draw the waveform, which a provider's signed URL on
 * another origin only allows with bucket CORS. Same session and business
 * checks as the recording route, and Range requests so the audio element seeks.
 */
export const GET = operatorRoute<{ callId: string }>(async (operator, { callId }) => {
  const object = await callRecordingObject(operator, callId);
  if (object instanceof NextResponse) return object;
  const range = operator.request.headers.get("range") ?? undefined;
  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "content-type": object.contentType,
    // Served from the dashboard's origin, so it must never render as a page there.
    "content-disposition": attachment(object.fileName),
    "x-content-type-options": "nosniff",
  });
  let opened;
  try {
    opened = await getStorageProvider().openObject({ key: object.objectKey, ...(range ? { range } : {}) });
  } catch (error) {
    if (!(error instanceof InvalidByteRangeError)) throw error;
    if (object.contentLength !== null) headers.set("content-range", `bytes */${object.contentLength}`);
    headers.delete("content-type");
    return new Response(null, { status: 416, headers });
  }
  headers.set("content-length", String(opened.length));
  const partial = Boolean(range) && opened.start !== undefined && opened.end !== undefined;
  if (partial) headers.set("content-range", `bytes ${opened.start}-${opened.end}/${opened.totalLength}`);
  return new Response(Readable.toWeb(opened.body) as ReadableStream<Uint8Array>, { status: partial ? 206 : 200, headers });
});
