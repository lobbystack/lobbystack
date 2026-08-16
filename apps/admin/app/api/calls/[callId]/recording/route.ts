import { NextResponse } from "next/server";

import { createObjectDownload, getCallDetail } from "@lobbystack/domain";
import { S3StorageProvider } from "@lobbystack/providers";
import { asApiResponse, businessIdFromRequest, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

function storageProvider(): S3StorageProvider {
  return new S3StorageProvider({
    bucket: process.env.S3_BUCKET ?? "lobbystack",
    region: process.env.S3_REGION ?? "us-east-1",
    ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ callId: string }> }) {
  try {
    const session = await requireApiSession(request);
    const businessId = businessIdFromRequest(request);
    if (!businessId) return NextResponse.json({ error: "A businessId is required." }, { status: 400 });
    const { callId } = await params;
    const detail = await getCallDetail(createDomainContext(), { userId: session.user.id, businessId, callId });
    if (!detail) return NextResponse.json({ error: "Call not found.", code: "not_found" }, { status: 404 });
    if (detail.recording.state !== "available" || !detail.recording.objectId) {
      const status = detail.recording.state === "expired" ? 410 : 409;
      return NextResponse.json({ error: `Recording is ${detail.recording.state}.`, code: `recording_${detail.recording.state}` }, { status });
    }
    return NextResponse.json(await createObjectDownload(createDomainContext(), { userId: session.user.id, businessId, objectId: detail.recording.objectId }, storageProvider()));
  } catch (error) {
    return asApiResponse(error);
  }
}
