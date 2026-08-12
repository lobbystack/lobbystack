import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { acceptInvitation } from "@lobbystack/domain";
import { asApiResponse, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

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
