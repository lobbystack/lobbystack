import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

type ConvexHarness = TestConvex<typeof schema>;

function createConvexHarness() {
  return convexTest(schema, modules);
}

async function seedBusinessOwner(input: {
  t: ConvexHarness;
  subject: string;
  websiteUrl?: string;
}) {
  return await input.t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: `${input.subject}-business`,
      name: `${input.subject} Business`,
      timezone: "America/Toronto",
      defaultLocale: "en",
      ...(input.websiteUrl ? { websiteUrl: input.websiteUrl } : {}),
      onboardingStage: "completed",
      businessType: "clinic",
      deploymentMode: "manual",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: input.subject,
      email: `${input.subject}@example.com`,
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "business_owner",
      status: "active",
    });

    return { businessId, userId };
  });
}

async function addUploadedSource(t: ConvexHarness, businessId: Id<"businesses">) {
  await t.run(async (ctx) => {
    await ctx.db.insert("knowledge_documents", {
      businessId,
      section: "knowledge",
      active: true,
      sourceType: "upload",
      title: "Menu",
      status: "indexed",
      tags: [],
      importance: 75,
    });
  });
}

async function addConnectedCalendar(t: ConvexHarness, businessId: Id<"businesses">) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: "calendar-owner",
      email: "calendar-owner@example.com",
    });
    await ctx.db.insert("calendar_connections", {
      businessId,
      provider: "google",
      ownerUserId: userId,
      externalAccountId: "google-account",
      selectedCalendarId: "primary",
      selectedCalendarSummary: "Primary",
      status: "connected",
    });
  });
}

async function addActiveService(t: ConvexHarness, businessId: Id<"businesses">) {
  await t.run(async (ctx) => {
    await ctx.db.insert("services", {
      businessId,
      name: "Consultation",
      slug: "consultation",
      description: "Initial appointment.",
      durationMinutes: 30,
      active: true,
    });
  });
}

async function addActiveRule(t: ConvexHarness, businessId: Id<"businesses">) {
  await t.run(async (ctx) => {
    const now = new Date().toISOString();
    await ctx.db.insert("agent_rules", {
      businessId,
      title: "Escalations",
      content: "Transfer urgent billing questions.",
      active: true,
      order: 1000,
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("setup guide progress", () => {
  it("returns no completed steps for an empty completed workspace", async () => {
    const t = createConvexHarness();
    const subject = "setup-guide-empty";
    const { businessId } = await seedBusinessOwner({ t, subject });

    const progress = await t.withIdentity({ subject }).query(
      api.businesses.setupGuide.getProgress,
      { businessId },
    );

    expect(progress.completedSteps).toBe(0);
    expect(progress.totalSteps).toBe(5);
    expect(progress.allCompleted).toBe(false);
    expect(progress.steps.map((step) => [step.id, step.completed])).toEqual([
      ["website", false],
      ["sources", false],
      ["calendar", false],
      ["services", false],
      ["rules", false],
    ]);
  });

  it("counts only the setup records that exist", async () => {
    const t = createConvexHarness();
    const subject = "setup-guide-partial";
    const { businessId } = await seedBusinessOwner({
      t,
      subject,
      websiteUrl: "https://example.com",
    });
    await addUploadedSource(t, businessId);
    await addActiveService(t, businessId);

    const progress = await t.withIdentity({ subject }).query(
      api.businesses.setupGuide.getProgress,
      { businessId },
    );

    expect(progress.completedSteps).toBe(3);
    expect(progress.allCompleted).toBe(false);
    expect(progress.steps.map((step) => [step.id, step.completed])).toEqual([
      ["website", true],
      ["sources", true],
      ["calendar", false],
      ["services", true],
      ["rules", false],
    ]);
  });

  it("counts skipped setup steps as completed", async () => {
    const t = createConvexHarness();
    const subject = "setup-guide-skipped";
    const { businessId } = await seedBusinessOwner({ t, subject });

    await t.withIdentity({ subject }).mutation(api.businesses.setupGuide.skipStep, {
      businessId,
      stepId: "calendar",
    });

    const progress = await t.withIdentity({ subject }).query(
      api.businesses.setupGuide.getProgress,
      { businessId },
    );
    const business = await t.run((ctx) => ctx.db.get(businessId));

    expect(progress.completedSteps).toBe(1);
    expect(progress.allCompleted).toBe(false);
    expect(progress.steps.map((step) => [step.id, step.completed])).toEqual([
      ["website", false],
      ["sources", false],
      ["calendar", true],
      ["services", false],
      ["rules", false],
    ]);
    expect(business?.setupGuideSkippedSteps).toEqual(["calendar"]);
  });

  it("marks the guide complete when all setup records exist", async () => {
    const t = createConvexHarness();
    const subject = "setup-guide-complete";
    const { businessId } = await seedBusinessOwner({
      t,
      subject,
      websiteUrl: "https://example.com",
    });
    await addUploadedSource(t, businessId);
    await addConnectedCalendar(t, businessId);
    await addActiveService(t, businessId);
    await addActiveRule(t, businessId);

    const progress = await t.withIdentity({ subject }).query(
      api.businesses.setupGuide.getProgress,
      { businessId },
    );

    expect(progress.completedSteps).toBe(5);
    expect(progress.allCompleted).toBe(true);
    expect(progress.steps.every((step) => step.completed)).toBe(true);
  });
});
