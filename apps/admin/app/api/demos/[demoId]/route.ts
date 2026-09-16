import { NextResponse } from "next/server";

import { getProspectDemoStatus, publishProspectDemo, revokeProspectDemo, rotateProspectDemoToken } from "@lobbystack/domain";
import { asApiResponse, readJson, requireProspectDemoOperator } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

type RouteContext = { params: Promise<{ demoId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requireProspectDemoOperator(request);
    const { demoId } = await context.params;
    return NextResponse.json(await getProspectDemoStatus(createDomainContext(), { operatorUserId: session.user.id, demoId }));
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireProspectDemoOperator(request);
    const { demoId } = await context.params;
    const body = await readJson(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("A demo action is required.");
    const input = body as Record<string, unknown>;
    if (input.action === "rotate") return NextResponse.json(await rotateProspectDemoToken(createDomainContext(), { operatorUserId: session.user.id, demoId }));
    if (input.action === "revoke") {
      await revokeProspectDemo(createDomainContext(), { operatorUserId: session.user.id, demoId });
      return NextResponse.json({ status: "revoked" });
    }
    if (input.action === "publish") {
      if (typeof input.token !== "string") throw new Error("The current demo token is required to publish.");
      const suggestedPrompts = Array.isArray(input.suggestedPrompts) && input.suggestedPrompts.every((item) => typeof item === "string") ? input.suggestedPrompts as string[] : undefined;
      return NextResponse.json(await publishProspectDemo(createDomainContext(), { operatorUserId: session.user.id, demoId, token: input.token, ...(suggestedPrompts ? { suggestedPrompts } : {}) }));
    }
    throw new Error("Unsupported demo action.");
  } catch (error) {
    return asApiResponse(error);
  }
}
