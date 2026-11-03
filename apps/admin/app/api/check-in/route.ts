import { NextResponse } from "next/server";

import { recordCheckInAnswer } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

// The signed token is the only credential: the owner answers from an email, signed out.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const result = await recordCheckInAnswer(createDomainContext(), { token });
  if (!result) return jsonError("This link has expired or isn't valid.", 400);
  return NextResponse.json({ answer: result.answer });
}
