import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { scheduleSnapshotRefreshMock } = vi.hoisted(() => ({
  scheduleSnapshotRefreshMock: vi.fn(),
}));

vi.mock("../businesses/admin.ts", async () => {
  const actual = await vi.importActual<typeof import("../businesses/admin")>(
    "../businesses/admin.ts",
  );

  return {
    ...actual,
    scheduleSnapshotRefresh: scheduleSnapshotRefreshMock,
  };
});

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const convexModules = modules;

type ConvexHarness = TestConvex<typeof schema>;
type TestRunFunction = Parameters<ConvexHarness["run"]>[0];
type TestContext = Parameters<TestRunFunction>[0];
type TenantRole = "business_owner" | "business_admin" | "owner" | "scheduler" | "viewer";

async function insertBusiness(
  ctx: TestContext,
  input: {
    slug: string;
    name?: string;
    onboardingStage?: string;
  },
): Promise<Id<"businesses">> {
  return await ctx.db.insert("businesses", {
    slug: input.slug,
    name: input.name ?? "Tenant Auth Business",
    timezone: "America/Toronto",
    businessType: "clinic",
    defaultLocale: "en",
    deploymentMode: "manual",
    status: "active",
    ...(input.onboardingStage !== undefined
      ? { onboardingStage: input.onboardingStage }
      : {}),
  });
}

async function seedMember(
  t: ConvexHarness,
  input: {
    subject: string;
    role: TenantRole;
    status?: "active" | "inactive";
    businessSlug?: string;
  },
) {
  const seeded = await t.run(async (ctx: TestContext) => {
    const businessId = await insertBusiness(ctx, {
      slug: input.businessSlug ?? `tenant-auth-${input.subject}`,
    });
    const userId = await ctx.db.insert("users", {
      authSubject: input.subject,
      email: `${input.subject}@example.com`,
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: input.role,
      status: input.status ?? "active",
    });

    return { businessId, userId };
  });

  return {
    ...seeded,
    authed: t.withIdentity({ subject: input.subject }),
  };
}

async function seedOutsider(t: ConvexHarness, subject: string) {
  await t.run(async (ctx: TestContext) => {
    await ctx.db.insert("users", {
      authSubject: subject,
      email: `${subject}@example.com`,
    });
  });
  return t.withIdentity({ subject });
}

const adminRoles = ["business_owner", "business_admin", "owner"] as const;
const memberOnlyRoles = ["scheduler", "viewer"] as const;

describe("tenant admin authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduleSnapshotRefreshMock.mockResolvedValue(null);
  });

  it.each(adminRoles)("allows %s to mutate tenant configuration", async (role) => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedMember(t, {
      subject: `tenant-admin-${role}`,
      role,
    });

    await authed.mutation(api.businesses.catalog.updateBusinessName, {
      businessId,
      name: `${role} Updated`,
    });
    const staffResult = await authed.mutation(api.businesses.catalog.upsertStaff, {
      businessId,
      name: "Front Desk",
      timezone: "America/Toronto",
      active: true,
    });
    const uploadUrl = await authed.mutation(
      api.ai.context.knowledge.generateKnowledgeDocumentUploadUrl,
      { businessId },
    );

    const persisted = await t.run(async (ctx: TestContext) => ({
      business: await ctx.db.get(businessId),
      staff: await ctx.db.get(staffResult.staffId),
    }));

    expect(persisted.business?.name).toBe(`${role} Updated`);
    expect(persisted.staff).toMatchObject({
      businessId,
      name: "Front Desk",
    });
    expect(uploadUrl).toEqual(expect.any(String));
  });

  it.each(memberOnlyRoles)("blocks %s from tenant configuration writes", async (role) => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed } = await seedMember(t, {
      subject: `tenant-member-${role}`,
      role,
    });

    await expect(
      authed.mutation(api.businesses.catalog.updateBusinessName, {
        businessId,
        name: "Should Not Save",
      }),
    ).rejects.toThrow("Tenant admin access required.");

    await expect(
      authed.mutation(api.ai.context.knowledge.generateKnowledgeDocumentUploadUrl, {
        businessId,
      }),
    ).rejects.toThrow("Tenant admin access required.");
  });

  it("blocks inactive members and outsiders from tenant configuration writes", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, authed: inactiveMember } = await seedMember(t, {
      subject: "tenant-inactive-member",
      role: "business_owner",
      status: "inactive",
    });
    const outsider = await seedOutsider(t, "tenant-outsider");

    await expect(
      inactiveMember.mutation(api.businesses.catalog.updateBusinessName, {
        businessId,
        name: "Inactive Update",
      }),
    ).rejects.toThrow("You do not have access to this business.");

    await expect(
      outsider.mutation(api.businesses.catalog.updateBusinessName, {
        businessId,
        name: "Outsider Update",
      }),
    ).rejects.toThrow("You do not have access to this business.");
  });

  it("keeps read and operational member paths open for active operators", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, userId, authed } = await seedMember(t, {
      subject: "tenant-active-scheduler",
      role: "scheduler",
    });

    const configuration = await authed.query(api.businesses.catalog.getBusinessConfiguration, {
      businessId,
    });
    await authed.mutation(api.businesses.admin.setActiveBusiness, {
      businessId,
    });

    const user = await t.run(async (ctx: TestContext) => await ctx.db.get(userId));

    expect(configuration.business?._id).toBe(businessId);
    expect(user?.activeBusinessId).toBe(businessId);
  });

  it("filters inactive memberships from the current user's business list", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "tenant-list-filter";
    const { activeBusinessId, inactiveBusinessId } = await t.run(async (ctx: TestContext) => {
      const activeBusinessId = await insertBusiness(ctx, {
        slug: "tenant-list-filter-active",
        name: "Active Business",
      });
      const inactiveBusinessId = await insertBusiness(ctx, {
        slug: "tenant-list-filter-inactive",
        name: "Inactive Business",
      });
      const userId = await ctx.db.insert("users", {
        authSubject: subject,
      });
      await ctx.db.insert("business_memberships", {
        businessId: activeBusinessId,
        userId,
        role: "scheduler",
        status: "active",
      });
      await ctx.db.insert("business_memberships", {
        businessId: inactiveBusinessId,
        userId,
        role: "business_owner",
        status: "inactive",
      });

      return { activeBusinessId, inactiveBusinessId };
    });

    const businesses = await t
      .withIdentity({ subject })
      .query(api.businesses.admin.listForCurrentUser, {});

    expect(businesses.map((entry) => entry.business._id)).toEqual([activeBusinessId]);
    expect(businesses.map((entry) => entry.business._id)).not.toContain(inactiveBusinessId);
  });

  it("rejects cross-business staff, service, assignment, phone, and knowledge IDs", async () => {
    const t = convexTest(schema, convexModules);
    const subject = "tenant-cross-business-admin";
    const seeded = await t.run(async (ctx: TestContext) => {
      const businessAId = await insertBusiness(ctx, {
        slug: "tenant-cross-business-a",
        name: "Business A",
      });
      const businessBId = await insertBusiness(ctx, {
        slug: "tenant-cross-business-b",
        name: "Business B",
      });
      const userId = await ctx.db.insert("users", {
        authSubject: subject,
      });
      await ctx.db.insert("business_memberships", {
        businessId: businessAId,
        userId,
        role: "business_owner",
        status: "active",
      });
      const staffAId = await ctx.db.insert("staff", {
        businessId: businessAId,
        name: "Staff A",
        timezone: "America/Toronto",
        active: true,
      });
      const staffBId = await ctx.db.insert("staff", {
        businessId: businessBId,
        name: "Staff B",
        timezone: "America/Toronto",
        active: true,
      });
      const serviceBId = await ctx.db.insert("services", {
        businessId: businessBId,
        name: "Service B",
        slug: "service-b",
        durationMinutes: 30,
        active: true,
      });
      const phoneBId = await ctx.db.insert("phone_numbers", {
        businessId: businessBId,
        e164: "+14165550123",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
      });
      const snippetBId = await ctx.db.insert("knowledge_snippets", {
        businessId: businessBId,
        title: "Snippet B",
        content: "Business B private knowledge.",
        tags: [],
        priority: 50,
        active: true,
      });
      const documentBId = await ctx.db.insert("knowledge_documents", {
        businessId: businessBId,
        active: true,
        sourceType: "manual",
        title: "Document B",
        textContent: "Business B private document.",
        status: "indexed",
        processingProgress: 100,
        tags: [],
        importance: 50,
      });

      return {
        businessAId,
        staffAId,
        staffBId,
        serviceBId,
        phoneBId,
        snippetBId,
        documentBId,
      };
    });

    const authed = t.withIdentity({ subject });

    await expect(
      authed.mutation(api.businesses.catalog.upsertStaff, {
        businessId: seeded.businessAId,
        staffId: seeded.staffBId,
        name: "Hijacked Staff",
        timezone: "America/Toronto",
        active: false,
      }),
    ).rejects.toThrow("Staff member not found for this business.");

    await expect(
      t.mutation(internal.businesses.catalog.upsertServiceInternal, {
        businessId: seeded.businessAId,
        serviceId: seeded.serviceBId,
        name: "Hijacked Service",
        slug: "hijacked-service",
        durationMinutes: 45,
        active: false,
      }),
    ).rejects.toThrow("Service not found for this business.");

    await expect(
      authed.mutation(api.businesses.catalog.replaceStaffServiceAssignments, {
        businessId: seeded.businessAId,
        assignments: [
          {
            staffId: seeded.staffAId,
            serviceId: seeded.serviceBId,
          },
        ],
      }),
    ).rejects.toThrow("Service not found for this business.");

    await expect(
      authed.action(api.businesses.catalog.savePhoneNumber, {
        businessId: seeded.businessAId,
        phoneNumberId: seeded.phoneBId,
        e164: "+14165550123",
        voiceEnabled: true,
        smsEnabled: true,
        status: "active",
      }),
    ).rejects.toThrow("Phone number not found for this business.");

    await expect(
      authed.action(api.ai.context.knowledge.deleteKnowledgeEntry, {
        businessId: seeded.businessAId,
        snippetId: seeded.snippetBId,
      }),
    ).rejects.toThrow("Knowledge snippet not found.");

    await expect(
      authed.action(api.ai.context.knowledge.setKnowledgeEntryActive, {
        businessId: seeded.businessAId,
        documentId: seeded.documentBId,
        active: false,
      }),
    ).rejects.toThrow("Knowledge document not found.");

    const persisted = await t.run(async (ctx: TestContext) => ({
      staffB: await ctx.db.get(seeded.staffBId),
      serviceB: await ctx.db.get(seeded.serviceBId),
      phoneB: await ctx.db.get(seeded.phoneBId),
      snippetB: await ctx.db.get(seeded.snippetBId),
      documentB: await ctx.db.get(seeded.documentBId),
    }));

    expect(persisted.staffB).toMatchObject({ name: "Staff B", active: true });
    expect(persisted.serviceB).toMatchObject({ name: "Service B", active: true });
    expect(persisted.phoneB).toMatchObject({ businessId: expect.any(String) });
    expect(persisted.snippetB).toMatchObject({ title: "Snippet B", active: true });
    expect(persisted.documentB).toMatchObject({ title: "Document B", active: true });
  });
});
