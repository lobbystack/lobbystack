import { NextResponse } from "next/server";

import { createObjectDownload, createUpload, finalizeUpload } from "@lobbystack/domain";
import { createStorageProvider } from "@lobbystack/providers";
import { uploadCreateRequestSchema, uploadDownloadRequestSchema, uploadFinalizeRequestSchema } from "@lobbystack/contracts";
import { asApiResponse, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

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
    }, createStorageProvider()));
  } catch (error) { return asApiResponse(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = uploadCreateRequestSchema.parse(await readJson(request));
    return NextResponse.json(await createUpload(createDomainContext(), { ...body, userId: session.user.id, ...(body.checksum !== undefined ? { checksum: body.checksum } : {}) }, createStorageProvider()), { status: 201 });
  } catch (error) { return asApiResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = uploadFinalizeRequestSchema.parse(await readJson(request));
    await finalizeUpload(createDomainContext(), { ...body, userId: session.user.id, ...(body.checksum !== undefined ? { checksum: body.checksum } : {}) }, createStorageProvider());
    return NextResponse.json({ ok: true });
  } catch (error) { return asApiResponse(error); }
}
