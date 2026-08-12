import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { persistCallRecording } from "@lobbystack/domain";
import { S3StorageProvider } from "@lobbystack/providers";
import { asApiResponse, getAppDatabase, requireInternalService } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function storageProvider(): S3StorageProvider {
  return new S3StorageProvider({ bucket: process.env.S3_BUCKET ?? "lobbystack", region: process.env.S3_REGION ?? "us-east-1", ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}), accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin", forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" });
}

export async function POST(request: Request) {
  try {
    const body = new Uint8Array(await request.arrayBuffer());
    await requireInternalService(request, body);
    const callId = new URL(request.url).searchParams.get("callId");
    if (!callId || body.byteLength === 0) return NextResponse.json({ error: "callId and recording body are required." }, { status: 400 });
    const resolved = await getAppDatabase().db.execute<{ business_id: string }>(sql`select app.resolve_business_by_call_id(${callId}::uuid) as business_id`);
    const businessId = resolved.rows[0]?.business_id;
    if (!businessId) return new Response("Call not found", { status: 404 });
    await persistCallRecording(createWorkerDomainContext(), { businessId, callId, durationMs: Number(new URL(request.url).searchParams.get("durationMs") ?? 0), contentType: request.headers.get("content-type") ?? "audio/wav", body }, storageProvider());
    return new Response(null, { status: 204 });
  } catch (error) {
    return asApiResponse(error);
  }
}
