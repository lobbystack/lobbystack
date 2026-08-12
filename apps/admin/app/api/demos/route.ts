import { NextResponse } from "next/server";

import { createProspectDemo, listProspectDemos } from "@lobbystack/domain";
import { asApiResponse, readJson, requireProspectDemoOperator } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

export async function GET(request: Request) {
  try {
    const session = await requireProspectDemoOperator(request);
    return NextResponse.json({ demos: await listProspectDemos(createDomainContext(), session.user.id) });
  } catch (error) {
    return asApiResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireProspectDemoOperator(request);
    const body = await readJson(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("A demo payload is required.");
    const input = body as Record<string, unknown>;
    if (typeof input.name !== "string" || typeof input.websiteUrl !== "string") throw new Error("Business name and website URL are required.");
    return NextResponse.json(await createProspectDemo(createDomainContext(), {
      operatorUserId: session.user.id,
      name: input.name,
      websiteUrl: input.websiteUrl,
      ...(typeof input.locale === "string" ? { locale: input.locale } : {}),
      ...(typeof input.recipientEmail === "string" ? { recipientEmail: input.recipientEmail } : {}),
      ...(typeof input.recipientName === "string" ? { recipientName: input.recipientName } : {}),
      ...(typeof input.campaignId === "string" ? { campaignId: input.campaignId } : {}),
      ...(typeof input.greeting === "string" ? { greeting: input.greeting } : {}),
      ...(typeof input.timezone === "string" ? { timezone: input.timezone } : {}),
      ...(stringArray(input.services) ? { services: stringArray(input.services)! } : {}),
      ...(stringArray(input.suggestedPrompts) ? { suggestedPrompts: stringArray(input.suggestedPrompts)! } : {}),
    }), { status: 201 });
  } catch (error) {
    return asApiResponse(error);
  }
}
