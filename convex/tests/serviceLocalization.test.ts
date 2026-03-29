import { convexTest, type TestConvex } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

const { generateMissingLocalizedServiceNamesMock, scheduleSnapshotRefreshMock } = vi.hoisted(
  () => ({
    generateMissingLocalizedServiceNamesMock: vi.fn(),
    scheduleSnapshotRefreshMock: vi.fn(),
  }),
);

vi.mock("../lib/serviceNameGeneration.ts", () => ({
  generateMissingLocalizedServiceNames: generateMissingLocalizedServiceNamesMock,
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

const convexModules = modules;
type ConvexHarness = TestConvex<typeof schema>;

async function seedBusinessOwner(
  t: ConvexHarness,
  input?: { membershipStatus?: "active" | "inactive" },
) {
  const subject = "service-localization-owner";

  const { businessId } = await t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: "service-localization-business",
      name: "Service Localization Business",
      timezone: "America/Toronto",
      businessType: "clinic",
      defaultLocale: "en",
      deploymentMode: "manual",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: subject,
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "business_owner",
      status: input?.membershipStatus ?? "active",
    });

    return { businessId };
  });

  return { businessId, subject };
}

describe("Service localization save flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduleSnapshotRefreshMock.mockResolvedValue(null);
    generateMissingLocalizedServiceNamesMock.mockImplementation(
      async ({
        name,
        localizedNames,
      }: {
        name: string;
        localizedNames?: { en?: string; fr?: string };
      }) => ({
        en: localizedNames?.en?.trim() || `${name} (EN)`,
        fr: localizedNames?.fr?.trim() || `${name} (FR)`,
      }),
    );
  });

  it("auto-generates and persists both localized labels when they are blank", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    const result = await authed.action(api.businesses.catalog.upsertService, {
      businessId,
      name: "Initial Consultation",
      localizedNames: {
        en: "",
        fr: "",
      },
      slug: "initial-consultation",
      durationMinutes: 30,
      active: true,
    });

    expect(result).toMatchObject({
      localizedNames: {
        en: "Initial Consultation (EN)",
        fr: "Initial Consultation (FR)",
      },
    });

    const configuration = await authed.query(api.businesses.catalog.getBusinessConfiguration, {
      businessId,
    });
    const service = configuration.services.find((row) => row._id === result.serviceId);

    expect(service).toMatchObject({
      name: "Initial Consultation",
      localizedNames: {
        en: "Initial Consultation (EN)",
        fr: "Initial Consultation (FR)",
      },
    });
  });

  it("preserves a supplied label and generates only the missing side", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    const result = await authed.action(api.businesses.catalog.upsertService, {
      businessId,
      name: "Follow-up Visit",
      localizedNames: {
        en: "Follow-up Visit",
        fr: "",
      },
      slug: "follow-up-visit",
      durationMinutes: 45,
      active: true,
    });

    expect(result).toMatchObject({
      localizedNames: {
        en: "Follow-up Visit",
        fr: "Follow-up Visit (FR)",
      },
    });

    const configuration = await authed.query(api.businesses.catalog.getBusinessConfiguration, {
      businessId,
    });
    const service = configuration.services.find((row) => row._id === result.serviceId);

    expect(service?.localizedNames).toEqual({
      en: "Follow-up Visit",
      fr: "Follow-up Visit (FR)",
    });
  });

  it("keeps operator-provided English and French labels unchanged", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t);
    const authed = t.withIdentity({ subject });

    const result = await authed.action(api.businesses.catalog.upsertService, {
      businessId,
      name: "Initial Consultation",
      localizedNames: {
        en: "Initial Consultation",
        fr: "Consultation initiale",
      },
      slug: "initial-consultation-manual",
      durationMinutes: 30,
      active: true,
    });

    expect(result).toMatchObject({
      localizedNames: {
        en: "Initial Consultation",
        fr: "Consultation initiale",
      },
    });

    const configuration = await authed.query(api.businesses.catalog.getBusinessConfiguration, {
      businessId,
    });
    const service = configuration.services.find((row) => row._id === result.serviceId);

    expect(service?.localizedNames).toEqual({
      en: "Initial Consultation",
      fr: "Consultation initiale",
    });
  });

  it("rejects service updates for inactive memberships", async () => {
    const t = convexTest(schema, convexModules);
    const { businessId, subject } = await seedBusinessOwner(t, {
      membershipStatus: "inactive",
    });
    const authed = t.withIdentity({ subject });

    await expect(
      authed.action(api.businesses.catalog.upsertService, {
        businessId,
        name: "Initial Consultation",
        slug: "initial-consultation",
        durationMinutes: 30,
        active: true,
      }),
    ).rejects.toThrow("You do not have access to this business.");
  });
});
