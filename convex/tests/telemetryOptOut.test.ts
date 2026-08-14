import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import {
  enqueuePostHogOutboxRecord,
  serializePostHogEvent,
} from "../telemetry/posthog";

const { scheduleSnapshotRefreshMock } = vi.hoisted(() => ({
  scheduleSnapshotRefreshMock: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

vi.mock("../businesses/admin.ts", async () => {
  const actual = await vi.importActual<typeof import("../businesses/admin")>(
    "../businesses/admin.ts",
  );

  return {
    ...actual,
    scheduleSnapshotRefresh: scheduleSnapshotRefreshMock,
  };
});

async function seedBusinessMember(subject: string, role: string) {
  const t = convexTest(schema, modules);
  const { businessId, userId } = await t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: `telemetry-${subject}-${role}`,
      name: "Telemetry Test Business",
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
      role,
      status: "active",
    });

    return { businessId, userId };
  });

  return { t, businessId, userId, authed: t.withIdentity({ subject }) };
}

async function withPostHogExportEnabled(run: () => Promise<void>): Promise<void> {
  const originalDeploymentMode = process.env.DEPLOYMENT_MODE;
  const originalPosthogKey = process.env.POSTHOG_KEY;
  const originalPosthogHost = process.env.POSTHOG_HOST;
  process.env.DEPLOYMENT_MODE = "cloud";
  process.env.POSTHOG_KEY = "test-key";
  process.env.POSTHOG_HOST = "https://us.i.posthog.com";
  try {
    await run();
  } finally {
    if (originalDeploymentMode === undefined) {
      delete process.env.DEPLOYMENT_MODE;
    } else {
      process.env.DEPLOYMENT_MODE = originalDeploymentMode;
    }
    if (originalPosthogKey === undefined) {
      delete process.env.POSTHOG_KEY;
    } else {
      process.env.POSTHOG_KEY = originalPosthogKey;
    }
    if (originalPosthogHost === undefined) {
      delete process.env.POSTHOG_HOST;
    } else {
      process.env.POSTHOG_HOST = originalPosthogHost;
    }
  }
}

describe("Business telemetry opt-out settings", () => {
  it("defaults to telemetry enabled for businesses without the field", async () => {
    const { t, businessId, authed } = await seedBusinessMember(
      "telemetry-default-owner",
      "business_owner",
    );

    const result = await authed.query(
      api.settings.telemetryOptOut.getTelemetryEnabled,
      { businessId },
    );

    expect(result).toEqual({ telemetryEnabled: true });
  });

  it("allows owners to disable and re-enable telemetry", async () => {
    const { t, businessId, authed } = await seedBusinessMember(
      "telemetry-owner-toggle",
      "business_owner",
    );

    await authed.mutation(api.settings.telemetryOptOut.setTelemetryEnabled, {
      businessId,
      telemetryEnabled: false,
    });

    let result = await authed.query(
      api.settings.telemetryOptOut.getTelemetryEnabled,
      { businessId },
    );
    expect(result).toEqual({ telemetryEnabled: false });

    await authed.mutation(api.settings.telemetryOptOut.setTelemetryEnabled, {
      businessId,
      telemetryEnabled: true,
    });

    result = await authed.query(api.settings.telemetryOptOut.getTelemetryEnabled, {
      businessId,
    });
    expect(result).toEqual({ telemetryEnabled: true });
  });

  it("allows admins to change the telemetry preference", async () => {
    const { t, businessId, authed } = await seedBusinessMember(
      "telemetry-admin-toggle",
      "business_admin",
    );

    await authed.mutation(api.settings.telemetryOptOut.setTelemetryEnabled, {
      businessId,
      telemetryEnabled: false,
    });

    const result = await authed.query(
      api.settings.telemetryOptOut.getTelemetryEnabled,
      { businessId },
    );
    expect(result).toEqual({ telemetryEnabled: false });
  });

  it("rejects non-members from reading or changing the preference", async () => {
    const { t, businessId } = await seedBusinessMember(
      "telemetry-owner-guard",
      "business_owner",
    );
    const stranger = t.withIdentity({ subject: "telemetry-stranger" });

    await expect(
      stranger.query(api.settings.telemetryOptOut.getTelemetryEnabled, {
        businessId,
      }),
    ).rejects.toThrow();

    await expect(
      stranger.mutation(api.settings.telemetryOptOut.setTelemetryEnabled, {
        businessId,
        telemetryEnabled: false,
      }),
    ).rejects.toThrow();
  });

  it("rejects viewers from changing the preference", async () => {
    const { t, businessId, authed } = await seedBusinessMember(
      "telemetry-viewer",
      "business_viewer",
    );

    await expect(
      authed.mutation(api.settings.telemetryOptOut.setTelemetryEnabled, {
        businessId,
        telemetryEnabled: false,
      }),
    ).rejects.toThrow();
  });

  it("schedules a snapshot refresh so voice telemetry stops promptly", async () => {
    scheduleSnapshotRefreshMock.mockReset();
    scheduleSnapshotRefreshMock.mockResolvedValue(null);

    const { t, businessId, authed } = await seedBusinessMember(
      "telemetry-refresh-owner",
      "business_owner",
    );

    await authed.mutation(api.settings.telemetryOptOut.setTelemetryEnabled, {
      businessId,
      telemetryEnabled: false,
    });

    expect(scheduleSnapshotRefreshMock).toHaveBeenCalledTimes(1);
    expect(scheduleSnapshotRefreshMock).toHaveBeenCalledWith(
      expect.anything(),
      businessId,
    );
  });

  it("updates the stored snapshot before the scheduled refresh runs", async () => {
    scheduleSnapshotRefreshMock.mockReset();
    scheduleSnapshotRefreshMock.mockResolvedValue(null);

    const { t, businessId, authed } = await seedBusinessMember(
      "telemetry-immediate-snapshot-owner",
      "business_owner",
    );
    const snapshotId = await t.run(async (ctx) => {
      return await ctx.db.insert("business_context_snapshots", {
        businessId,
        version: "snapshot-v1",
        generatedAt: new Date().toISOString(),
        displayName: "Telemetry Test Business",
        timezone: "America/Toronto",
        defaultLocale: "en",
        businessType: "clinic",
        greeting: "Hello.",
        voiceInstructions: "Be helpful.",
        smsInstructions: "Be helpful.",
        summary: "A test business.",
        bookingPolicy: "Normal policy.",
        knowledgeDigest: "",
        transferPolicy: { mode: "never" },
        hours: [],
        closures: [],
        services: [],
        contactChannels: {},
      });
    });

    await authed.mutation(api.settings.telemetryOptOut.setTelemetryEnabled, {
      businessId,
      telemetryEnabled: false,
    });

    const storedSnapshot = await t.run(async (ctx) => await ctx.db.get(snapshotId));
    expect(storedSnapshot?.telemetryEnabled).toBe(false);

    const currentSnapshot = await t.query(
      internal.ai.context.snapshots.getByBusinessId,
      { businessId },
    );
    expect(currentSnapshot?.telemetryEnabled).toBe(false);
  });

  it("drops business-scoped events from the outbox when telemetry is disabled", async () => {
    await withPostHogExportEnabled(async () => {
      const { t, businessId, authed } = await seedBusinessMember(
        "telemetry-outbox-owner",
        "business_owner",
      );

      await authed.mutation(api.settings.telemetryOptOut.setTelemetryEnabled, {
        businessId,
        telemetryEnabled: false,
      });

      await t.run(async (ctx) => {
        await enqueuePostHogOutboxRecord(
          ctx,
          serializePostHogEvent({
            eventName: "business.snapshot_refreshed",
            businessId,
            distinctId: `system:business:${String(businessId)}`,
            groupKey: `business:${String(businessId)}`,
            properties: {},
          }),
        );
      });

      const outboxRows = await t.run(async (ctx) => {
        return await ctx.db
          .query("telemetry_outbox")
          .withIndex("by_business_id_and_status", (q) =>
            q.eq("businessId", businessId),
          )
          .collect();
      });

      expect(outboxRows).toHaveLength(0);
    });
  });

  it("keeps enqueuing business-scoped events while telemetry is enabled", async () => {
    await withPostHogExportEnabled(async () => {
      const { t, businessId } = await seedBusinessMember(
        "telemetry-outbox-owner-enabled",
        "business_owner",
      );

      await t.run(async (ctx) => {
        await enqueuePostHogOutboxRecord(
          ctx,
          serializePostHogEvent({
            eventName: "business.snapshot_refreshed",
            businessId,
            distinctId: `system:business:${String(businessId)}`,
            groupKey: `business:${String(businessId)}`,
            properties: {},
          }),
        );
      });

      const outboxRows = await t.run(async (ctx) => {
        return await ctx.db
          .query("telemetry_outbox")
          .withIndex("by_business_id_and_status", (q) =>
            q.eq("businessId", businessId),
          )
          .collect();
      });

      expect(outboxRows).toHaveLength(1);
    });
  });

  it("drops previously-enqueued outbox rows when the business opts out before flush", async () => {
    await withPostHogExportEnabled(async () => {
      const { t, businessId, authed } = await seedBusinessMember(
        "telemetry-outbox-late-optout",
        "business_owner",
      );

      await t.run(async (ctx) => {
        await enqueuePostHogOutboxRecord(
          ctx,
          serializePostHogEvent({
            eventName: "business.snapshot_refreshed",
            businessId,
            distinctId: `system:business:${String(businessId)}`,
            groupKey: `business:${String(businessId)}`,
            properties: {},
          }),
        );
      });

      await authed.mutation(api.settings.telemetryOptOut.setTelemetryEnabled, {
        businessId,
        telemetryEnabled: false,
      });

      await t.mutation(internal.telemetry.posthog.claimDueEvents, { limit: 10 });

      const outboxRows = await t.run(async (ctx) => {
        return await ctx.db
          .query("telemetry_outbox")
          .withIndex("by_business_id_and_status", (q) =>
            q.eq("businessId", businessId),
          )
          .collect();
      });

      expect(outboxRows).toHaveLength(0);
    });
  });

  it("still claims outbox rows for businesses with telemetry enabled", async () => {
    await withPostHogExportEnabled(async () => {
      const { t, businessId } = await seedBusinessMember(
        "telemetry-outbox-claim-enabled",
        "business_owner",
      );

      await t.run(async (ctx) => {
        await enqueuePostHogOutboxRecord(
          ctx,
          serializePostHogEvent({
            eventName: "business.snapshot_refreshed",
            businessId,
            distinctId: `system:business:${String(businessId)}`,
            groupKey: `business:${String(businessId)}`,
            properties: {},
          }),
        );
      });

      await t.mutation(internal.telemetry.posthog.claimDueEvents, { limit: 10 });

      const outboxRows = await t.run(async (ctx) => {
        return await ctx.db
          .query("telemetry_outbox")
          .withIndex("by_business_id_and_status", (q) =>
            q.eq("businessId", businessId),
          )
          .collect();
      });

      expect(outboxRows).toHaveLength(1);
      expect(outboxRows[0].status).toBe("processing");
    });
  });

  it("drops a claimed row when the business opts out before delivery", async () => {
    await withPostHogExportEnabled(async () => {
      const { t, businessId, authed } = await seedBusinessMember(
        "telemetry-outbox-claimed-optout",
        "business_owner",
      );

      await t.run(async (ctx) => {
        await enqueuePostHogOutboxRecord(
          ctx,
          serializePostHogEvent({
            eventName: "business.snapshot_refreshed",
            businessId,
            distinctId: `system:business:${String(businessId)}`,
            groupKey: `business:${String(businessId)}`,
            properties: {},
          }),
        );
      });

      const claimResult = await t.mutation(internal.telemetry.posthog.claimDueEvents, {
        limit: 10,
      });
      expect(claimResult.events).toHaveLength(1);

      await authed.mutation(api.settings.telemetryOptOut.setTelemetryEnabled, {
        businessId,
        telemetryEnabled: false,
      });

      const canDeliver = await t.mutation(
        internal.telemetry.posthog.prepareEventForDelivery,
        { outboxId: claimResult.events[0]!._id },
      );
      expect(canDeliver).toBe(false);

      const outboxRows = await t.run(async (ctx) => {
        return await ctx.db
          .query("telemetry_outbox")
          .withIndex("by_business_id_and_status", (q) =>
            q.eq("businessId", businessId),
          )
          .collect();
      });
      expect(outboxRows).toHaveLength(0);
    });
  });

  it("continues flushing when opted-out rows fill the claim window", async () => {
    await withPostHogExportEnabled(async () => {
      const t = convexTest(schema, modules);
      const { enabledBusinessId } = await t.run(async (ctx) => {
        const disabledBusinessId = await ctx.db.insert("businesses", {
          slug: "telemetry-disabled-backlog",
          name: "Disabled Telemetry Business",
          timezone: "America/Toronto",
          businessType: "clinic",
          defaultLocale: "en",
          deploymentMode: "manual",
          status: "active",
          telemetryEnabled: false,
        });
        const enabledBusinessId = await ctx.db.insert("businesses", {
          slug: "telemetry-enabled-behind-backlog",
          name: "Enabled Telemetry Business",
          timezone: "America/Toronto",
          businessType: "clinic",
          defaultLocale: "en",
          deploymentMode: "manual",
          status: "active",
          telemetryEnabled: true,
        });
        const availableAt = new Date(0).toISOString();

        for (let index = 0; index < 25; index += 1) {
          await ctx.db.insert("telemetry_outbox", {
            destination: "posthog",
            status: "pending",
            availableAt,
            attemptCount: 0,
            eventName: "business.snapshot_refreshed",
            distinctId: `disabled-${index}`,
            businessId: disabledBusinessId,
            groupKey: `business:${String(disabledBusinessId)}`,
            payloadJson: "{}",
          });
        }
        await ctx.db.insert("telemetry_outbox", {
          destination: "posthog",
          status: "pending",
          availableAt,
          attemptCount: 0,
          eventName: "business.snapshot_refreshed",
          distinctId: "enabled-behind-backlog",
          businessId: enabledBusinessId,
          groupKey: `business:${String(enabledBusinessId)}`,
          payloadJson: "{}",
        });

        return { enabledBusinessId };
      });
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const firstFlush = await t.action(internal.telemetry.posthog.flushDueEvents, {});

      expect(firstFlush).toMatchObject({ attempted: 0, delivered: 0, skipped: false });
      const scheduledNames = await t.run(async (ctx) => {
        const jobs = await ctx.db.system.query("_scheduled_functions").collect();
        return jobs.map((job) => job.name);
      });
      expect(scheduledNames).toContain("telemetry/posthog:flushDueEvents");

      const secondFlush = await t.action(internal.telemetry.posthog.flushDueEvents, {});
      expect(secondFlush).toMatchObject({ attempted: 1, delivered: 1, skipped: false });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const enabledRows = await t.run(async (ctx) => {
        return await ctx.db
          .query("telemetry_outbox")
          .withIndex("by_business_id_and_status", (q) =>
            q.eq("businessId", enabledBusinessId),
          )
          .collect();
      });
      expect(enabledRows).toHaveLength(1);
      expect(enabledRows[0]?.status).toBe("delivered");
    });
  });
});
