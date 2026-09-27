import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteReceptionist, setReceptionistKnowledgeItem, setReceptionistService } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";

const toggleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("knowledge_document"), documentId: z.string().uuid(), enabled: z.boolean() }),
  z.object({ kind: z.literal("knowledge_snippet"), snippetId: z.string().uuid(), enabled: z.boolean() }),
  z.object({ kind: z.literal("service"), serviceId: z.string().uuid(), enabled: z.boolean() }),
]);

const deleteSchema = z.object({ reassignToAgentId: z.string().uuid() });

/** Deletes a receptionist after moving its numbers and widget to another one. */
export async function DELETE(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await params;
    z.string().uuid().parse(agentId);
    const body = deleteSchema.parse(await readJson(request));
    return NextResponse.json(await withOperatorTransaction(request, async ({ session, businessId }) => await deleteReceptionist(createDomainContext(), { userId: session.user.id, businessId, agentId, reassignToAgentId: body.reassignToAgentId }), { minimumRole: "business_admin" }));
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError("Invalid request.", 400, "invalid_request");
    return asApiResponse(error);
  }
}

/** Turns one shared knowledge item or service on or off for this receptionist. */
export async function PATCH(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await params;
    z.string().uuid().parse(agentId);
    const body = toggleSchema.parse(await readJson(request));
    await withOperatorTransaction(request, async ({ session, businessId }) => {
      const input = { userId: session.user.id, businessId, agentId, enabled: body.enabled };
      if (body.kind === "service") await setReceptionistService(createDomainContext(), { ...input, serviceId: body.serviceId });
      else if (body.kind === "knowledge_document") await setReceptionistKnowledgeItem(createDomainContext(), { ...input, documentId: body.documentId });
      else await setReceptionistKnowledgeItem(createDomainContext(), { ...input, snippetId: body.snippetId });
    }, { minimumRole: "business_admin" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError("Invalid request.", 400, "invalid_request");
    return asApiResponse(error);
  }
}
