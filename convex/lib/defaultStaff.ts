import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { listStaffServiceAssignmentsForBusiness } from "./indexedQueries";

type DbReader = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type DbWriter = Pick<MutationCtx, "db">;

export const HIDDEN_DEFAULT_STAFF_NAME = "Bookings";

async function listBusinessStaff(
  ctx: DbReader,
  businessId: Id<"businesses">,
): Promise<Array<Doc<"staff">>> {
  const staff = await ctx.db
    .query("staff")
    .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
    .collect();

  return [...staff].sort((left, right) => left._creationTime - right._creationTime);
}

export async function selectDefaultStaffForBusiness(
  ctx: DbReader,
  businessId: Id<"businesses">,
): Promise<Doc<"staff"> | null> {
  const staff = await listBusinessStaff(ctx, businessId);

  return (
    staff.find((member) => member.name === HIDDEN_DEFAULT_STAFF_NAME && member.active) ??
    staff.find((member) => member.active) ??
    staff.find((member) => member.name === HIDDEN_DEFAULT_STAFF_NAME) ??
    staff[0] ??
    null
  );
}

export async function ensureDefaultStaffForBusiness(
  ctx: DbWriter,
  input: {
    businessId: Id<"businesses">;
    timezone: string;
  },
): Promise<Id<"staff">> {
  const existing = await selectDefaultStaffForBusiness(ctx, input.businessId);
  if (existing) {
    if (!existing.active) {
      await ctx.db.patch(existing._id, { active: true });
    }
    return existing._id;
  }

  return await ctx.db.insert("staff", {
    businessId: input.businessId,
    name: HIDDEN_DEFAULT_STAFF_NAME,
    timezone: input.timezone,
    active: true,
  });
}

export async function ensureDefaultStaffAssignmentForService(
  ctx: DbWriter,
  input: {
    businessId: Id<"businesses">;
    serviceId: Id<"services">;
    timezone: string;
  },
): Promise<Id<"staff">> {
  const staffId = await ensureDefaultStaffForBusiness(ctx, {
    businessId: input.businessId,
    timezone: input.timezone,
  });
  const assignments = await listStaffServiceAssignmentsForBusiness(ctx, input.businessId);
  const existing = assignments.find(
    (assignment) =>
      assignment.staffId === staffId && assignment.serviceId === input.serviceId,
  );
  if (!existing) {
    await ctx.db.insert("staff_service_assignments", {
      businessId: input.businessId,
      staffId,
      serviceId: input.serviceId,
    });
  }
  return staffId;
}
