import { NextResponse } from "next/server";

import { createObjectDownload, createUpload, finalizeUpload } from "@lobbystack/domain";
import { S3StorageProvider } from "@lobbystack/providers";
import { uploadCreateRequestSchema, uploadDownloadRequestSchema, uploadFinalizeRequestSchema } from "@lobbystack/contracts";
import { asApiResponse, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

function storageProvider(): S3StorageProvider {
  return new S3StorageProvider({ bucket: process.env.S3_BUCKET ?? "lobbystack", region: process.env.S3_REGION ?? "us-east-1", ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}), accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin", forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" });
}

export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    const url = new URL(request.url);
    const input = uploadDownloadRequestSchema.parse({
      businessId: url.searchParams.get("businessId"),
      objectId: url.searchParams.get("objectId"),
      ...(url.searchParams.get("range") ? { range: url.searchParams.get("range") } : {}),
    });
    return NextResponse.json(await createObjectDownload(createDomainContext(), {
      ...input,
      userId: session.user.id,
    }, storageProvider()));
  } catch (error) { return asApiResponse(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = uploadCreateRequestSchema.parse(await readJson(request));
    return NextResponse.json(await createUpload(createDomainContext(), { ...body, userId: session.user.id, ...(body.checksum !== undefined ? { checksum: body.checksum } : {}) }, storageProvider()), { status: 201 });
  } catch (error) { return asApiResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = uploadFinalizeRequestSchema.parse(await readJson(request));
    await finalizeUpload(createDomainContext(), { ...body, userId: session.user.id, ...(body.checksum !== undefined ? { checksum: body.checksum } : {}) }, storageProvider());
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
