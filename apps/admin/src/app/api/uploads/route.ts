import { NextRequest } from "next/server";

import { createUploadRequestSchema } from "@lobbystack/contracts";
import { createPendingUpload } from "@lobbystack/domain/server";
import { S3StorageProvider, s3StorageConfigFromEnvironment } from "@lobbystack/providers";

import { errorResponse, jsonResponse, parseJsonBody } from "@/lib/api-helpers";
import { requireBusinessAccess, requireSession } from "@/lib/authorization";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const businessId = request.nextUrl.searchParams.get("businessId");
    if (!businessId) {
      return jsonResponse({ error: "businessId is required" }, { status: 400 });
    }
    await requireBusinessAccess({ businessId, userId: session.userId });
    const body = createUploadRequestSchema.parse(await parseJsonBody(request));
    const config = s3StorageConfigFromEnvironment();
    if (!config) {
      return jsonResponse({ error: "Storage is not configured" }, { status: 503 });
    }
    const upload = await createPendingUpload({
      businessId,
      userId: session.userId,
      values: body,
      provider: new S3StorageProvider(config),
    });
    return jsonResponse(upload, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
