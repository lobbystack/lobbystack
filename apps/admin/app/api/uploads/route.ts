import { NextResponse } from "next/server";

import { createObjectDownload, createUpload, finalizeUpload } from "@lobbystack/domain";
import { uploadCreateRequestSchema, uploadDownloadRequestSchema, uploadFinalizeRequestSchema } from "@lobbystack/contracts";
import { operatorRoute } from "@/lib/operator-request";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const url = new URL(request.url);
  const input = uploadDownloadRequestSchema.parse({
    businessId,
    objectId: url.searchParams.get("objectId"),
    ...(url.searchParams.get("range") ? { range: url.searchParams.get("range") } : {}),
  });
  return NextResponse.json(await createObjectDownload(domain, {
    ...input,
    userId,
  }, getStorageProvider()));
});

export const POST = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  const body = uploadCreateRequestSchema.parse({ ...input, businessId });
  return NextResponse.json(await createUpload(domain, { ...body, userId, ...(body.checksum !== undefined ? { checksum: body.checksum } : {}) }, getStorageProvider()), { status: 201 });
});

export const PUT = operatorRoute(async ({ userId, businessId, body: input, domain }) => {
  const body = uploadFinalizeRequestSchema.parse({ ...input, businessId });
  await finalizeUpload(domain, { ...body, userId, ...(body.checksum !== undefined ? { checksum: body.checksum } : {}) }, getStorageProvider());
  return NextResponse.json({ ok: true });
});
