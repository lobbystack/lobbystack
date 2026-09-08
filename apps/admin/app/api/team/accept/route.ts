import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { acceptInvitation, previewInvitation } from "@lobbystack/domain";
import { asApiResponse, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim();
    if (!token) return NextResponse.json({ invitation: null });
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return NextResponse.json({ invitation: await previewInvitation(createDomainContext(), { tokenHash }) });
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request);
    if (typeof body !== "object" || body === null || Array.isArray(body) || typeof (body as { token?: unknown }).token !== "string") {
      throw new Error("An invitation token is required.");
    }
    const tokenHash = createHash("sha256").update((body as { token: string }).token).digest("hex");
    return NextResponse.json(await acceptInvitation(createDomainContext(), { userId: session.user.id, tokenHash }));
  } catch (error) {
    return asApiResponse(error);
  }
}
