import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbReader = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type DbWriter = Pick<MutationCtx, "db">;

export async function listStaffServiceAssignmentsForBusiness(
  ctx: DbReader,
  businessId: Id<"businesses">,
): Promise<Array<Doc<"staff_service_assignments">>> {
  return await ctx.db
    .query("staff_service_assignments")
    .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
    .collect();
}

export async function replaceBusinessStaffServiceAssignments(
  ctx: DbWriter,
  input: {
    businessId: Id<"businesses">;
    assignments: Array<{
      staffId: Id<"staff">;
      serviceId: Id<"services">;
    }>;
  },
): Promise<void> {
  for (const assignment of input.assignments) {
    const [staff, service] = await Promise.all([
      ctx.db.get(assignment.staffId),
      ctx.db.get(assignment.serviceId),
    ]);

    if (!staff || staff.businessId !== input.businessId) {
      throw new Error("Staff member not found for this business.");
    }
    if (!service || service.businessId !== input.businessId) {
      throw new Error("Service not found for this business.");
    }
  }

  const existing = await listStaffServiceAssignmentsForBusiness(ctx, input.businessId);

  for (const row of existing) {
    await ctx.db.delete(row._id);
  }

  for (const assignment of input.assignments) {
    await ctx.db.insert("staff_service_assignments", {
      businessId: input.businessId,
      staffId: assignment.staffId,
      serviceId: assignment.serviceId,
    });
  }
}

export async function reassignPreviewSessions(
  ctx: DbWriter,
  input: {
    fromUserId: Id<"users">;
    toUserId: Id<"users">;
  },
): Promise<void> {
  const previewSessions = await ctx.db
    .query("preview_sessions")
    .withIndex("by_user_id", (q) => q.eq("userId", input.fromUserId))
    .collect();

  for (const previewSession of previewSessions) {
    if (previewSession.userId !== input.fromUserId) {
      continue;
    }

    await ctx.db.patch(previewSession._id, { userId: input.toUserId });
  }
}

export async function getOpenConversationForContact(
  ctx: DbReader,
  input: {
    businessId: Id<"businesses">;
    contactId: Id<"contacts">;
    channel: string;
  },
): Promise<Doc<"conversations"> | null> {
  return await ctx.db
    .query("conversations")
    .withIndex("by_business_id_and_contact_id_and_channel_and_status", (q) =>
      q
        .eq("businessId", input.businessId)
        .eq("contactId", input.contactId)
        .eq("channel", input.channel)
        .eq("status", "open"),
    )
    .unique();
}
