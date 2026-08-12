import { NextResponse } from "next/server";

import { claimProspectDemo } from "@lobbystack/domain";
import { asApiResponse, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const body = await readJson(request);
    const token = typeof body === "object" && body !== null && !Array.isArray(body) && typeof (body as { token?: unknown }).token === "string" ? (body as { token: string }).token : "";
    if (!token) throw new Error("A demo token is required.");
    return NextResponse.json(await claimProspectDemo(createDomainContext(), { userId: session.user.id, token }));
  } catch (error) {
    return asApiResponse(error);
  }
}
