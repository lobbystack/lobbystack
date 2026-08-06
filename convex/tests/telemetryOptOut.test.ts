import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";
import {
  enqueuePostHogOutboxRecord,
  serializePostHogEvent,
} from "../telemetry/posthog";

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
});
